#!/bin/bash
# OmniPlan AI - Desktop App Launcher
# Double-click this file or run: ./run.sh

cd "$(dirname "$0")"

echo ""
echo "  ============================================"
echo "       OmniPlan AI - Executive Life OS"
echo "  ============================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "  [ERROR] Node.js is not installed."
    echo ""
    echo "  Install it:"
    echo "    Ubuntu/Debian: sudo apt install nodejs npm"
    echo "    Mac:           brew install node"
    echo "    Or download:   https://nodejs.org/"
    echo ""
    read -p "  Press Enter to exit..."
    exit 1
fi

# Install deps if needed
if [ ! -d "node_modules" ]; then
    echo "  [1/3] First run - installing dependencies..."
    echo ""
    npm install || { echo "  [ERROR] Install failed."; read -p "Press Enter..."; exit 1; }
    echo ""
fi

# Build if needed
if [ ! -f "dist/index.html" ]; then
    echo "  [2/3] Building app..."
    echo ""
    npm run build || { echo "  [ERROR] Build failed."; read -p "Press Enter..."; exit 1; }
    echo ""
fi

# Launch
echo "  [3/3] Launching OmniPlan AI..."
echo ""
npx electron . &
echo "  App launched! You can close this terminal."
sleep 1
