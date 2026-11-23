#!/bin/sh
# One-time setup for /demo. Everything is free and runs on your machine.
#   ./setup.sh            Node deps, Chromium, ffmpeg, whisper, Qwen3-TTS voice, OpenCV
#   ./setup.sh --no-voice skip the TTS model (about 3 GB) if you bring your own narration
set -eu
cd "$(dirname "$0")"
voice=1; [ "${1:-}" = "--no-voice" ] && voice=0

need() { command -v "$1" >/dev/null 2>&1; }
say() { printf '\n== %s\n' "$1"; }

say "Node packages and headless Chromium"
need node || { echo "Install Node 20 or newer first: https://nodejs.org"; exit 1; }
npm install --silent
npx playwright install chromium

say "ffmpeg and whisper.cpp"
if ! need ffmpeg || ! need whisper-cli; then
  if need brew; then brew install ffmpeg whisper-cpp
  else echo "Install ffmpeg and whisper.cpp (whisper-cli) with your package manager, then run this again."; exit 1; fi
fi
model="${WHISPER_MODEL:-$HOME/.cache/whisper/ggml-small.en.bin}"
if [ ! -f "$model" ]; then
  mkdir -p "$(dirname "$model")"
  curl -L --fail -o "$model" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin
fi

say "OpenCV for face-safe layouts (cv-venv/)"
[ -x cv-venv/bin/python3 ] || python3 -m venv cv-venv
cv-venv/bin/pip install --quiet "opencv-python-headless<5"

if [ "$voice" = 1 ]; then
  say "Qwen3-TTS narration (tts-venv/, Apple Silicon)"
  if [ "$(uname -s)-$(uname -m)" != "Darwin-arm64" ]; then
    echo "The bundled voice runs on Apple Silicon (mlx). On other machines, record your own narration or use --provider elevenlabs with your own key."
  else
    [ -x tts-venv/bin/python ] || python3 -m venv tts-venv
    tts-venv/bin/pip install --quiet mlx-audio
    echo "The voice model downloads on first use (about 3 GB)."
  fi
fi
chmod +x tools/say tools/words

say "Check"
npm test --silent >/dev/null 2>&1 && echo "All tests pass. Try: /demo in Claude Code." || echo "Some tests failed: run npm test to see which."
