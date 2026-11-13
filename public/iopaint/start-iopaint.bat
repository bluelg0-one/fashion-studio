@echo off
title IOPaint - keep this window open
set "DIR=%USERPROFILE%\iopaint"
if not exist "%DIR%\venv\Scripts\iopaint.exe" (
  echo IOPaint is not installed yet. Run install-iopaint.bat first.
  pause
  exit /b 1
)
echo Starting IOPaint at http://127.0.0.1:8080
echo The first start downloads the LaMa model (about 200 MB).
echo Keep this window open while you use Fashion Studio. Close it to stop IOPaint.
echo.
"%DIR%\venv\Scripts\iopaint.exe" start --model lama --device cpu --host 127.0.0.1 --port 8080
pause
