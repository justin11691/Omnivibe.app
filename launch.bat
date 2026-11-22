@echo off
cd /d "%~dp0"
netstat -ano | findstr 127.0.0.1:5173 >nul
if %errorlevel% neq 0 (
    start "" /b npm run dev
    timeout /t 2 /nobreak >nul
)
start http://localhost:5173
