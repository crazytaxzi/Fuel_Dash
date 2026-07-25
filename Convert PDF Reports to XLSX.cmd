@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:8765/ -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "Vixen Fuel Dashboard Server" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve_dashboard.ps1" -Port 8765
  timeout /t 2 /nobreak >nul
)

start "" "http://127.0.0.1:8765/pdf_to_xlsx.html"
exit /b 0
