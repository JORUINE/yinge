#!/usr/bin/env bash
# One-command setup for the thesis/document toolchain.
# Usage (Git Bash):  bash tools/setup_env.sh
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
VENV="$USERPROFILE/.venv-html-to-docx"   # legacy folder name, kept to avoid re-downloading
PY="$VENV/Scripts/python.exe"

if [ ! -f "$PY" ]; then
  echo "[1/3] creating venv at $VENV"
  "$(command -v python || command -v py)" -m venv "$VENV"
else
  echo "[1/3] venv found: $VENV"
fi

echo "[2/3] installing requirements"
"$PY" -m pip install --upgrade pip -q
"$PY" -m pip install -r "$DIR/requirements.txt"

echo "[3/3] verifying imports"
"$PY" - <<'EOF'
mods = ["docx", "pptx", "openpyxl", "PIL", "matplotlib", "win32com.client", "markdown", "pypdf"]
bad = []
for m in mods:
    try:
        __import__(m)
        print("  ok  ", m)
    except Exception as e:
        bad.append((m, e))
        print("  FAIL", m, e)
raise SystemExit(1 if bad else 0)
EOF

echo "done."
