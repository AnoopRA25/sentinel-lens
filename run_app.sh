#!/usr/bin/env bash
# Sentinel Lens v2.0 - Linux / macOS Universal Launcher
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================================================"
echo "   SENTINEL LENS v2.0 - AUTONOMOUS MULTIMODAL HAZARD ADVISOR"
echo "   9-Agent LangGraph Safety Pipeline & Terminal Ember Interface"
echo "======================================================================"
echo ""

# Locate Python
if [ -f ".venv/bin/python" ]; then
    PYTHON_BIN=".venv/bin/python"
    echo "[INFO] Using virtual environment (.venv)"
elif [ -f "venv/bin/python" ]; then
    PYTHON_BIN="venv/bin/python"
    echo "[INFO] Using virtual environment (venv)"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
    echo "[INFO] Using system python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
    echo "[INFO] Using system python"
else
    echo "[ERROR] Python 3.10+ is required but was not found."
    exit 1
fi

# Open browser in background after 2 seconds
(
    sleep 2
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "http://localhost:8000" >/dev/null 2>&1 || true
    elif command -v open >/dev/null 2>&1; then
        open "http://localhost:8000" >/dev/null 2>&1 || true
    fi
) &

echo "[INFO] Starting Sentinel Lens at http://localhost:8000 ..."
echo "[INFO] Press Ctrl+C to shut down."
echo ""

exec "$PYTHON_BIN" -m uvicorn app.api:app --host 0.0.0.0 --port 8000
