#!/usr/bin/env bash
# Watchdog uptime: cek semua pintu tiap 2 menit, restart service yang mati.
# Dipicu wa-watchdog.timer. Log ke /tmp/wa-watchdog.log
LOG=/tmp/wa-watchdog.log
ok=1

check() { # check <nama> <url> <service>
  local name="$1" url="$2" svc="$3"
  local code
  code=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null) || code="000"
  if [ "$code" = "200" ] || [ "$code" = "401" ] || [ "$code" = "404" ]; then
    return 0
  fi
  echo "$(date '+%F %T') DOWN $name ($url -> $code), restart $svc" >> "$LOG"
  systemctl --user restart "$svc" 2>>"$LOG"
  return 1
}

check "nginx"      "http://127.0.0.1:8080/healthz"   "wa-nginx"   || ok=0
check "bot"        "http://127.0.0.1:3000/wa/status" "wa-bot"     || ok=0
check "arena"      "http://127.0.0.1:3001/api/rooms" "wa-arena"   || ok=0
check "panel"      "http://127.0.0.1:8000/up"        "wa-panel"   || ok=0

# tunnel publik: cocokkan URL .env dengan yang hidup
ENV=/home/imfa/projects/wa/bot/.env
for pair in "ARENA_PUBLIC_URL:3001" "BOT_PUBLIC_URL:3000"; do
  var="${pair%%:*}"
  U=$(grep -E "^$var=" "$ENV" | cut -d= -f2)
  if [ -n "$U" ]; then
    code=$(curl -s --max-time 15 -o /dev/null -w "%{http_code}" "$U/api/rooms" 2>/dev/null) || code="000"
    # BOT url tidak punya /api/rooms -> 404 = hidup
    if [ "$code" = "000" ]; then
      echo "$(date '+%F %T') TUNNEL MATI $var=$U" >> "$LOG"
      ok=0
    fi
  fi
done

[ "$ok" = "1" ] || echo "$(date '+%F %T') watchdog: ada yang di-restart, cek log" >> "$LOG"
exit 0
