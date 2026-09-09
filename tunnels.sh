#!/usr/bin/env bash
# Buka akses publik gratis (Cloudflare Quick Tunnel, tanpa daftar).
# URL berubah tiap jalan -> tulis ke .env bot -> restart bot.
# Pakai: ~/projects/wa/tunnels.sh
set -u
CF=~/.local/bin/cloudflared
ENV=~/projects/wa/bot/.env

pkill -f "cloudflared tunnel" 2>/dev/null
sleep 1
setsid nohup $CF tunnel --url http://127.0.0.1:3001 </dev/null >/tmp/tun-arena.log 2>&1 &
setsid nohup $CF tunnel --url http://127.0.0.1:3000 </dev/null >/tmp/tun-bot.log 2>&1 &
echo "menunggu tunnel..."

ARENA=""; BOT=""
for i in $(seq 1 20); do
  ARENA=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/tun-arena.log 2>/dev/null | grep -v api | head -n 1)
  BOT=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/tun-bot.log 2>/dev/null | grep -v api | head -n 1)
  [ -n "$ARENA" ] && [ -n "$BOT" ] && break
  sleep 3
done
[ -z "$ARENA" ] || [ -z "$BOT" ] && echo "GAGAL: tunnel tidak muncul. Cek /tmp/tun-*.log" && exit 1

sed -i '/^ARENA_PUBLIC_URL=/d; /^BOT_PUBLIC_URL=/d' "$ENV"
printf 'ARENA_PUBLIC_URL=%s\nBOT_PUBLIC_URL=%s\n' "$ARENA" "$BOT" >> "$ENV"
echo "arena: $ARENA"
echo "bot  : $BOT"

# restart bot agar baca URL baru
systemctl --user restart wa-bot 2>/dev/null || {
  pkill -f "node src/index.js" 2>/dev/null
  sleep 2
  cd ~/projects/wa/bot || exit 1
  setsid nohup npm run bot >/tmp/wa-bot.log 2>&1 </dev/null &
  sleep 15
  grep -E "WA connected|Panel API" /tmp/wa-bot.log | head -n 3
}
