# WA Suite (~/projects/wa)

Satu folder rapi untuk semua WA:

- `bot/` — WA Bot Full Node (dulu `wa-bot-full`) + `bot/arena/`
- `panel/` — Dashboard Laravel (dulu `wa-panel`)
- `*.sh` — start/stop/tunnel/watchdog

## Jalankan
```bash
~/projects/wa/start.sh
# stop:
~/projects/wa/stop.sh
```

## Service systemd (auto-login)
`wa-bot wa-arena wa-panel wa-sched wa-nginx wa-tunnel-* wa-watchdog wa-inhibit`
- Cek: `systemctl --user is-active wa-bot wa-arena wa-panel`
- Log: `tail -f /tmp/wa-bot.log /tmp/wa-arena.log /tmp/wa-panel.log`
