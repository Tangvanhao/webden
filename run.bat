@echo off
chcp 65001 >nul
title Luxury Game Hub - Server Launcher
cd /d "%~dp0"

echo ===================================================
echo   LUXURY GAME HUB (XU AO) - KHOI DONG SERVER
echo ===================================================

if not exist ".venv\Scripts\python.exe" (
    echo [1/3] Dang tao moi truong ao .venv...
    python -m venv .venv
)

if not exist ".venv\Scripts\uvicorn.exe" (
    echo [2/3] Dang cai dat FastAPI va Uvicorn...
    ".venv\Scripts\pip.exe" install -r requirements.txt
) else (
    echo [1/2] Moi truong da san sang.
)

echo [2/2] Dang mo trinh duyet tai http://127.0.0.1:8000 ...
start "" "http://127.0.0.1:8000"

echo Dang chay server (Nhan Ctrl+C de tat)...
".venv\Scripts\uvicorn.exe" app:app --host 127.0.0.1 --port 8000
pause
