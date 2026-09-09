#!/usr/bin/env bash
# Tunggu URL tunnel muncul, tulis ke .env bot. Dipanggil systemd sekali tiap boot.
ENV=/home/imfa/projects/wa/bot/.env
for i in $(seq 1 20); do
  # ambil yang TERAKHIR (log bisa berisi hostname lama dari proses sebelumnya)
  ARENA=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/tun-arena.log 2>/dev/null | grep -v api | tail -n 1)
  BOT=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/tun-bot.log 2>/dev/null | grep -v api | tail -n 1)
  [ -n "$ARENA" ] && [ -n "$BOT" ] && break
  sleep 3
done
[ -z "$ARENA" ] || [ -z "$BOT" ] && echo "tunnel-sync: URL tidak muncul" && exit 1
sed -i '/^ARENA_PUBLIC_URL=/d; /^BOT_PUBLIC_URL=/d' "$ENV"
printf 'ARENA_PUBLIC_URL=%s\nBOT_PUBLIC_URL=%s\n' "$ARENA" "$BOT" >> "$ENV"
echo "tunnel-sync: arena=$ARENA bot=$BOT"
