#!/usr/bin/env bash
# Stop semua.
pkill -f "node src/index.js" 2>/dev/null
pkill -f "node server.js" 2>/dev/null
pkill -f "artisan serve" 2>/dev/null
pkill -f "artisan schedule:work" 2>/dev/null
echo "berhenti. Cek: ps aux | grep -E 'node src/index|artisan' | grep -v grep"
