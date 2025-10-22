#!/usr/bin/env bash
# Запускает веб-интерфейс Veo 16:9.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

python3 veo_web_app.py
