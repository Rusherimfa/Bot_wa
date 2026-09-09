#!/usr/bin/env bash
# Dijalankan via timer tiap 5 menit. Kalau hostname tunnel berubah,
# tulis ulang .env dan restart bot agar link yang dikirim selalu hidup.
ENV=/home/imfa/projects/wa/bot/.env
ARENA=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/tun-arena.log 2>/dev/null | grep -v api | tail -n 1)
BOT=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/tun-bot.log 2>/dev/null | grep -v api | tail -n 1)
[ -z "$ARENA" ] || [ -z "$BOT" ] && exit 0
CUR_A=$(grep -E "^ARENA_PUBLIC_URL=" "$ENV" | cut -d= -f2)
CUR_B=$(grep -E "^BOT_PUBLIC_URL=" "$ENV" | cut -d= -f2)
if [ "$ARENA" != "$CUR_A" ] || [ "$BOT" != "$CUR_B" ]; then
  sed -i '/^ARENA_PUBLIC_URL=/d; /^BOT_PUBLIC_URL=/d' "$ENV"
  printf 'ARENA_PUBLIC_URL=%s\nBOT_PUBLIC_URL=%s\n' "$ARENA" "$BOT" >> "$ENV"
  echo "tunnel-watch: URL berubah arena=$ARENA bot=$BOT — restart wa-bot"
  systemctl --user restart wa-bot
fi
