@echo off
setlocal enabledelayedexpansion
title Sentinel Lens v2.0 - Autonomous Multimodal Hazard Advisor

echo ======================================================================
echo    SENTINEL LENS v2.0 - AUTONOMOUS MULTIMODAL HAZARD ADVISOR
echo    9-Agent LangGraph Safety Pipeline & Terminal Ember Interface
echo ======================================================================
echo.

:: 1. Detect Python Executable
set PYTHON_EXE=
if exist ".venv\Scripts\python.exe" (
    set "PYTHON_EXE=.venv\Scripts\python.exe"
    echo [INFO] Found local virtual environment (.venv).
) else if exist "venv\Scripts\python.exe" (
    set "PYTHON_EXE=venv\Scripts\python.exe"
    echo [INFO] Found local virtual environment (venv).
) else (
    where python >nul 2>&1
    if !errorlevel! equ 0 (
        set "PYTHON_EXE=python"
        echo [INFO] Using system Python.
    ) else (
        where py >nul 2>&1
        if !errorlevel! equ 0 (
            set "PYTHON_EXE=py -3"
            echo [INFO] Using Windows Python Launcher (py).
        )
    )
)

if "%PYTHON_EXE%"=="" (
    echo [ERROR] Python 3.10+ was not found on your system!
    echo Please install Python from https://www.python.org/downloads/
    echo Make sure to check the box: "Add python.exe to PATH"
    echo.
    pause
    exit /b 1
)

:: 2. Check Dependencies
echo [INFO] Checking Python environment dependencies...
!PYTHON_EXE! -c "import fastapi, uvicorn, pydantic, PIL" >nul 2>&1
if !errorlevel! neq 0 (
    echo [INFO] Installing required dependencies...
    !PYTHON_EXE! -m pip install -r requirements.txt
    if !errorlevel! neq 0 (
        echo [WARNING] Some dependencies could not be installed automatically.
    )
)

:: 3. Launch Default Browser after short delay
echo [INFO] Starting Sentinel Lens application...
echo [INFO] Access the web UI at: http://localhost:8000
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000"

:: 4. Start Uvicorn Server (serving both API and Frontend SPA)
!PYTHON_EXE! -m uvicorn app.api:app --host 0.0.0.0 --port 8000

pause
