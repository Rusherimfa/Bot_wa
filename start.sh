#!/usr/bin/env bash
# Start semua: bot WA + panel Laravel + scheduler broadcast. 100% lokal, Rp0.
cd ~/projects/wa/bot || exit 1
setsid nohup npm run bot > /tmp/wa-bot.log 2>&1 < /dev/null &
echo "bot: $(sleep 2; grep -c 'WA connected' /tmp/wa-bot.log 2>/dev/null) (lihat log: tail -f /tmp/wa-bot.log)"
cd ~/projects/wa/panel || exit 1
setsid nohup php artisan serve --port=8000 > /tmp/wa-panel.log 2>&1 < /dev/null &
setsid nohup php artisan schedule:work > /tmp/wa-sched.log 2>&1 < /dev/null &
sleep 3
echo "panel: http://127.0.0.1:8000 (admin / admin123 — GANTI di .env!)"
echo "status bot: curl -H 'x-api-key: <PANEL_API_KEY>' http://127.0.0.1:3000/wa/status"
cd ~/projects/wa/bot/arena || exit 1
setsid nohup node server.js > /tmp/wa-arena.log 2>&1 < /dev/null &
sleep 2
echo "arena: http://127.0.0.1:3001 (RPG PvP, skor butuh ARENA_WA_KEY di env)"
