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
