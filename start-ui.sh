#!/usr/bin/env bash
# md-outlet - beginner launcher (macOS / Linux)
# Run: ./start-ui.sh   (chmod +x start-ui.sh once)

set -euo pipefail

cd "$(dirname "$0")"

echo
echo "========================================"
echo "  md-outlet  -  Markdown editor + PDF"
echo "========================================"
echo
echo "Folder: $(pwd)"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js not found."
  echo
  echo "Install Node.js LTS first:"
  echo "  https://nodejs.org/"
  echo
  echo "macOS (Homebrew): brew install node"
  echo
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm not found. Reinstall Node.js."
  echo "  https://nodejs.org/"
  echo
  exit 1
fi

echo "Node.js: $(node -v)"
echo

if [[ ! -f package.json ]]; then
  echo "[ERROR] package.json missing. Run inside the md-outlet folder."
  echo
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "First-time setup: running npm install..."
  echo "(This may take a few minutes.)"
  echo
  npm install
  echo
  echo "Setup complete."
  echo
else
  echo "Dependencies: OK (node_modules present)"
  echo
fi

MD_FILE="${1:-}"

if [[ -n "$MD_FILE" ]]; then
  echo "Markdown: $MD_FILE"
  if [[ ! -f "$MD_FILE" ]]; then
    echo "[ERROR] Markdown file not found: $MD_FILE"
    exit 1
  fi
else
  echo "Markdown: (empty — pick from recent / Open)"
fi
echo

echo "Starting UI..."
echo "After the browser opens, use the Guide menu in the header."
echo "Stop with Ctrl+C."
echo

if [[ -n "$MD_FILE" ]]; then
  npx --yes md-outlet ui "$MD_FILE"
else
  npx --yes md-outlet ui
fi
echo
echo "md-outlet UI stopped."
