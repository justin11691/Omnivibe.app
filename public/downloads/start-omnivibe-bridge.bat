@echo off
title OmniVibe Studio - Local Companion Bridge
echo Starting OmniVibe Studio Local Companion Bridge (ws://127.0.0.1:47890)...
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js 18+ is required. Download from https://nodejs.org/
  pause
  exit /b 1
)
node "%~dp0omnivibe-local-companion-bridge.mjs"
pause
