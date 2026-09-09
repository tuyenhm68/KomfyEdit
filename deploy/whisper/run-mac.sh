#!/usr/bin/env bash
# ==============================================================================
# KomfyEdit - Whisper Local Service for macOS Apple Silicon (M1/M2/M3/M4)
# Run an OpenAI-compatible Whisper speech-to-text service accelerated by Metal.
# ==============================================================================

set -e

PORT="${PORT:-8000}"
MODEL="${MODEL:-small}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${SCRIPT_DIR}/.mac_whisper"

echo "========================================================"
echo " KomfyEdit: Whisper Server for Apple Silicon (Metal)"
echo " Listening on: http://localhost:${PORT}/v1"
echo " Model: ${MODEL}"
echo "========================================================"

mkdir -p "${WORK_DIR}"
cd "${WORK_DIR}"

# Check for Python 3
if ! command -v python3 &>/dev/null; then
    echo "Error: python3 is required. Please install Python 3.10+ or via Homebrew ('brew install python')."
    exit 1
fi

# Set up virtual environment
if [ ! -d "venv" ]; then
    echo "Setting up Python virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

# Install faster-whisper-server or mlx-whisper dependencies
if ! python3 -c "import faster_whisper_server" &>/dev/null; then
    echo "Installing faster-whisper-server..."
    pip install --upgrade pip
    pip install faster-whisper-server
fi

echo ""
echo "Starting faster-whisper-server with CPU/ANE/Metal acceleration..."
echo "Configure KomfyEdit Settings -> Speech:"
echo "  - Provider: Self-hosted Whisper Service"
echo "  - Endpoint: http://localhost:${PORT}/v1"
echo ""

exec faster-whisper-server \
    --host 0.0.0.0 \
    --port "${PORT}" \
    --whisper-model "${MODEL}" \
    --device auto \
    --compute-type int8
