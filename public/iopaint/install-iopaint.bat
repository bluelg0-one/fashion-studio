@echo off
setlocal
title IOPaint + BiRefNet installer for Fashion Studio
set "DIR=%USERPROFILE%\iopaint"
echo ============================================================
echo  IOPaint + BiRefNet installer (Fashion Studio)
echo  Install folder: %DIR%
echo  Takes 10-20 minutes and about 3 GB. Keep this window open.
echo  If it is already installed, this only adds what is missing.
echo ============================================================
echo.

rem ---- 1) Python 3.11 ----
set PY=
py -3.11 -V >nul 2>&1 && set PY=py -3.11
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set PY="%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if not defined PY (
  echo [1/4] Python 3.11 not found. Installing it with winget...
  winget install -e --id Python.Python.3.11 --scope user --accept-package-agreements --accept-source-agreements
  if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set PY="%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
)
if not defined PY (
  echo.
  echo [ERROR] Could not install Python 3.11.
  echo Install "Python 3.11" from https://www.python.org/downloads/windows/ and run this file again.
  pause
  exit /b 1
)
echo [1/4] Python: %PY%

rem ---- 2) Private environment ----
if not exist "%DIR%\venv\Scripts\python.exe" (
  echo [2/4] Creating environment...
  %PY% -m venv "%DIR%\venv"
)
set "VPY=%DIR%\venv\Scripts\python.exe"
if not exist "%VPY%" (
  echo [ERROR] Could not create the environment in %DIR%.
  pause
  exit /b 1
)
"%VPY%" -m pip install --upgrade pip

rem ---- 3) PyTorch (CPU) + IOPaint ----
echo [3/4] Installing PyTorch (CPU) and IOPaint. This is the long step...
"%VPY%" -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 goto fail
"%VPY%" -m pip install iopaint
if errorlevel 1 goto fail
rem BiRefNet (free background removal) uses the same PyTorch. It needs these extra packages.
"%VPY%" -m pip install "kornia==0.9.0" timm einops
if errorlevel 1 goto fail

rem Copy the BiRefNet server and the start script stored at the end of this file into %DIR%.
"%VPY%" -c "import re,sys;t=open(sys.argv[1],encoding='utf-8',newline='').read();fs=re.findall(r'(?ms)^#==FILE:(\S+)==#\r?\n(.*?)^#==END==#',t);[open(sys.argv[2]+'\\'+n,'w',encoding='utf-8',newline='').write(b) for n,b in fs];print('Copied',len(fs),'files')" "%~f0" "%DIR%"
if not exist "%DIR%\birefnet_server.py" goto fail

rem ---- 4) Desktop shortcut "IOPaint Start" ----
echo [4/4] Creating desktop shortcut "IOPaint Start"...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\IOPaint Start.lnk'); $s.TargetPath='%DIR%\start-iopaint.bat'; $s.WorkingDirectory='%DIR%'; $s.Save()"

echo.
echo ============================================================
echo  Done. Double-click "IOPaint Start" on the desktop to run it.
echo  The first start downloads the LaMa model (about 200 MB)
echo  and the BiRefNet model (about 450 MB).
echo ============================================================
pause
exit /b 0

:fail
echo.
echo [ERROR] Installation failed. Check your internet connection and run this file again.
echo If it keeps failing, take a screenshot of this window and send it.
pause
exit /b 1

rem ---- Files copied by the installer (not run by this script) ----
#==FILE:birefnet_server.py==#
# BiRefNet background removal server for Fashion Studio (runs on your own PC, free).
# Started by start-iopaint.bat next to IOPaint. Listens on http://127.0.0.1:8081 only.
#   GET  /health  -> {"ok": true, "model": "...", "ready": bool}
#   POST /remove  {"image": "data:image/...;base64,..."} -> PNG with transparent background
# Model: ZhengPeng7/BiRefNet (MIT license), PyTorch on CPU (about 4 GB RAM while working).
import base64, gc, io, json, os, re, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST, PORT = "127.0.0.1", int(os.environ.get("BIREFNET_PORT", "8081"))
REPO = "ZhengPeng7/BiRefNet"
REVISION = "e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4"  # pinned, tested version
SIZE = 1024
MAX_BODY = 40 * 1024 * 1024

state = {"model": None, "error": None}
lock = threading.Lock()


def load_model():
    try:
        import torch
        from transformers import AutoModelForImageSegmentation
        print("[BiRefNet] Loading model (first time downloads about 900 MB)...", flush=True)
        t = time.time()
        m = AutoModelForImageSegmentation.from_pretrained(REPO, revision=REVISION, trust_remote_code=True)
        state["model"] = m.float().eval()
        print(f"[BiRefNet] Ready in {time.time() - t:.0f}s at http://{HOST}:{PORT}", flush=True)
    except Exception as e:  # keep the server up so the app can show the error
        state["error"] = f"{type(e).__name__}: {e}"
        print("[BiRefNet] Model load failed:", state["error"], flush=True)


def refine_foreground(img, alpha):
    # Removes the light halo of the old background around edges
    # (blur-fusion foreground estimation, as in the BiRefNet repository).
    import cv2
    import numpy as np

    def est(image, F, B, a, r):
        ba = cv2.blur(a, (r, r))[:, :, None]
        bF = cv2.blur(F * a, (r, r)) / (ba + 1e-5)
        bB = cv2.blur(B * (1 - a), (r, r)) / ((1 - ba) + 1e-5)
        F = np.clip(bF + a * (image - a * bF - (1 - a) * bB), 0, 1)
        return F, bB

    image = img.astype(np.float32) / 255.0
    a = alpha.astype(np.float32)[:, :, None] / 255.0
    F, bB = est(image, image, image, a, 90)
    F, _ = est(image, F, bB, a, 6)
    return (F * 255).round().astype(np.uint8)


def remove_background(data_url):
    import numpy as np
    import torch
    from PIL import Image
    from torchvision import transforms

    m = re.match(r"^data:image/(png|jpeg|webp);base64,(.+)$", data_url or "", re.S)
    if not m:
        raise ValueError("image must be a PNG, JPEG or WebP data URL")
    im = Image.open(io.BytesIO(base64.b64decode(m.group(2)))).convert("RGB")
    tf = transforms.Compose([
        transforms.Resize((SIZE, SIZE)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    with torch.inference_mode():
        pred = state["model"](tf(im).unsqueeze(0))[-1].sigmoid()[0, 0].cpu()
    mask = transforms.ToPILImage()(pred).resize(im.size, Image.BILINEAR)
    rgb = np.asarray(im)
    alpha = np.asarray(mask)
    fg = refine_foreground(rgb, alpha)
    out = Image.fromarray(np.dstack([fg, alpha]), "RGBA")
    buf = io.BytesIO()
    out.save(buf, "PNG")
    del pred
    gc.collect()
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def reply(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/health":
            return self.reply(200, {"ok": True, "model": "BiRefNet", "ready": state["model"] is not None, "error": state["error"]})
        self.reply(404, {"error": "not found"})

    def do_POST(self):
        if self.path.split("?")[0] != "/remove":
            return self.reply(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            return self.reply(413, {"error": "image too large"})
        try:
            body = json.loads(self.rfile.read(n))
        except Exception:
            return self.reply(400, {"error": "invalid JSON"})
        if state["model"] is None:
            return self.reply(503, {"error": state["error"] or "BiRefNet model is still loading"})
        try:
            with lock:
                t = time.time()
                png = remove_background(body.get("image"))
                print(f"[BiRefNet] Background removed in {time.time() - t:.0f}s", flush=True)
            self.reply(200, png, "image/png")
        except ValueError as e:
            self.reply(400, {"error": str(e)})
        except Exception as e:
            print("[BiRefNet] Error:", e, flush=True)
            self.reply(500, {"error": f"{type(e).__name__}: {e}"})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    threading.Thread(target=load_model, daemon=True).start()
    print(f"[BiRefNet] Server on http://{HOST}:{PORT}", flush=True)
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except OSError as e:
        print(f"[BiRefNet] Could not start on port {PORT} (already running?): {e}", flush=True)
        sys.exit(1)
#==END==#
#==FILE:start-iopaint.bat==#
@echo off
title IOPaint + BiRefNet - keep this window open
set "DIR=%USERPROFILE%\iopaint"
if not exist "%DIR%\venv\Scripts\iopaint.exe" (
  echo IOPaint is not installed yet. Run install-iopaint.bat first.
  pause
  exit /b 1
)
echo Keep this window open while you use Fashion Studio. Close it to stop both.
echo.
if exist "%DIR%\birefnet_server.py" (
  echo Starting BiRefNet background removal at http://127.0.0.1:8081
  echo The first start downloads the BiRefNet model, about 450 MB.
  start "" /b "%DIR%\venv\Scripts\python.exe" "%DIR%\birefnet_server.py"
) else (
  echo BiRefNet is not installed. Run install-iopaint.bat again to add it.
)
echo Starting IOPaint at http://127.0.0.1:8080
echo The first start downloads the LaMa model, about 200 MB.
echo.
"%DIR%\venv\Scripts\iopaint.exe" start --model lama --device cpu --host 127.0.0.1 --port 8080
pause
#==END==#
