@echo off
powershell.exe -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:8765/shutdown | Out-Null } catch {}"
exit /b 0
