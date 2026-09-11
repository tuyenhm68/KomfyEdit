#!/usr/bin/env bash
# ==============================================================================
# KomfyEdit - Whisper Local Service for macOS Apple Silicon (M1/M2/M3/M4)
# Run an OpenAI-compatible Whisper speech-to-text service accelerated by Metal/CPU.
# ==============================================================================

set -e

PORT="${PORT:-8000}"
MODEL="${MODEL:-small}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${SCRIPT_DIR}/.mac_whisper"

echo "========================================================"
echo " KomfyEdit: Whisper Server for Apple Silicon (macOS)"
echo " Listening on: http://localhost:${PORT}/v1"
echo " Model: ${MODEL}"
echo "========================================================"

mkdir -p "${WORK_DIR}"
cd "${WORK_DIR}"

# Find a suitable Python binary (>= 3.10)
find_python() {
    for candidate in python3.13 python3.12 python3.11 python3.10 /opt/homebrew/bin/python3.11 /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3 /usr/local/bin/python3 python3; do
        if command -v "$candidate" &>/dev/null; then
            if "$candidate" -c 'import sys; exit(0 if sys.version_info >= (3, 10) else 1)' &>/dev/null; then
                echo "$candidate"
                return 0
            fi
        fi
    done
    return 1
}

PYTHON_BIN="$(find_python || true)"

if [ -z "${PYTHON_BIN}" ]; then
    echo "Error: Python 3.10+ is required, but none was found."
    echo "Please install Python 3.10+ via Homebrew:"
    echo "    brew install python@3.11"
    exit 1
fi

echo "Using Python: ${PYTHON_BIN} ($(${PYTHON_BIN} --version))"

# Check existing virtual environment
RECREATE_VENV=0
if [ -d "venv" ]; then
    if [ ! -f "venv/bin/python" ] || ! venv/bin/python -c 'import sys; exit(0 if sys.version_info >= (3, 10) else 1)' &>/dev/null; then
        echo "Existing venv is missing or uses Python < 3.10. Recreating..."
        rm -rf venv
        RECREATE_VENV=1
    fi
else
    RECREATE_VENV=1
fi

if [ "${RECREATE_VENV}" -eq 1 ]; then
    echo "Setting up Python virtual environment..."
    "${PYTHON_BIN}" -m venv venv
fi

source venv/bin/activate

# Install dependencies if missing
if ! python3 -c "import faster_whisper, fastapi, uvicorn, multipart" &>/dev/null; then
    echo "Installing required dependencies (faster-whisper, fastapi, uvicorn)..."
    pip install --upgrade pip
    pip install "faster-whisper>=1.0.0" "fastapi>=0.100.0" "uvicorn[standard]" "python-multipart"
fi

echo ""
echo "Starting Whisper Server..."
echo "Configure KomfyEdit Settings -> Speech:"
echo "  - Provider: Self-hosted Whisper Service"
echo "  - Endpoint: http://localhost:${PORT}/v1"
echo ""

exec python3 "${SCRIPT_DIR}/server.py" \
    --host 0.0.0.0 \
    --port "${PORT}" \
    --model "${MODEL}" \
    --device auto \
    --compute-type int8