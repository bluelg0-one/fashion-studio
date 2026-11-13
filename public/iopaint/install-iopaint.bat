@echo off
setlocal
title IOPaint installer for Fashion Studio
set "DIR=%USERPROFILE%\iopaint"
echo ============================================================
echo  IOPaint installer (Fashion Studio)
echo  Install folder: %DIR%
echo  Takes 10-20 minutes and about 2 GB. Keep this window open.
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

rem ---- 4) Desktop shortcut "IOPaint Start" ----
echo [4/4] Creating desktop shortcut "IOPaint Start"...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\IOPaint Start.lnk'); $s.TargetPath='%DIR%\venv\Scripts\iopaint.exe'; $s.Arguments='start --model lama --device cpu --host 127.0.0.1 --port 8080'; $s.WorkingDirectory='%DIR%'; $s.Save()"

echo.
echo ============================================================
echo  Done. Double-click "IOPaint Start" on the desktop to run it.
echo  The first start downloads the LaMa model (about 200 MB).
echo ============================================================
pause
exit /b 0

:fail
echo.
echo [ERROR] Installation failed. Check your internet connection and run this file again.
echo If it keeps failing, take a screenshot of this window and send it.
pause
exit /b 1
