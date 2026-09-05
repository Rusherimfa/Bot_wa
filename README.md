# WA Bot Full (~/projects/wa-bot-full)

Bot kompleks gratis: game + admin grup + media + AI + toko + util + arena PvP.

## Jalankan (3 langkah)
```bash
cd ~/projects/wa-bot-full
cp .env.example .env   # isi OWNER_JID + PAIRING_NUMBER (opsional)
npm install
npm run bot            # scan QR sekali
# terminal 2 (opsional arena):
npm run arena          # buka http://localhost:3001/?room=ABC1
```

DB opsional:
```bash
docker compose up -d   # postgres + redis
# isi di .env:
# DATABASE_URL=postgres://wa:wa@localhost:5432/wabot
# REDIS_URL=redis://localhost:6379
```
Tanpa itu bot tetap jalan (JSON `./data/db.json` + memory cache).

## Perintah penting
`!menu !game !rank !tagall !welcome on !antilink on !s (reply foto) !hd (reply foto) !tiktok <url> !ai <teks> !gambar <prompt> !katalog !order !cuaca Samarinda !sholat Samarinda !arena ABC1`

## Anti-ban (gratis tapi aman)
- Nomor kedua, pairing code (`PAIRING_NUMBER=628...`), jangan broadcast.
- Queue + delay otomatis di `src/core/queue.js`, max 25 msg/menit.
- `auth_info/` jangan dihapus biar tidak scan ulang.

## Integrasi n8n / Hermes / 9Router
- n8n: arahkan webhook ke `POST localhost:3000/` atau panggil `ARENA_API`. Cocok untuk order/reminder, bukan game real-time.
- Hermes: isi `HERMES_WEBHOOK=` di .env -> `!ai` diteruskan ke agent lokalmu.
- 9Router: isi `NINE_ROUTER_URL` + KEY -> `!ai` otomatis pilih model murah/pintar.

## Panel Laravel (`~/projects/wa-panel`)
Dashboard web: buka http://127.0.0.1:8000 (admin/admin123).
- Koneksi: QR scan dari browser (`GET /wa/qr`), status live.
- Grup/Toko/Rank/Broadcast: baca-tulis DB Postgres yang sama (`wabot`).
- Bot sediakan API localhost: `GET /wa/status`, `GET /wa/qr`, `POST /wa/send` (header `x-api-key: PANEL_API_KEY`).
- Jalankan semua: `~/projects/start.sh` — berhenti: `~/projects/stop.sh`.
- `!ai` memakai Ollama lokal (`OLLAMA_URL=http://localhost:11434`, model `llama3.2:3b`).

## Laptop sebagai server (systemd user, tanpa sudo)
- Semua jalan otomatis saat login: `wa-bot wa-arena wa-panel wa-sched wa-tunnel-arena wa-tunnel-bot wa-tunnel-sync wa-inhibit` (cek: `systemctl --user is-active wa-bot wa-arena`).
- Habis reboot → login sekali → semua naik sendiri (URL tunnel ditulis ulang otomatis oleh tunnel-sync).
- `wa-inhibit` menahan suspend/idle/tutup-lid agar server tetap hidup saat 24/7.
- Kalau link game mati: kirim perintah gamenya lagi dari WA untuk dapat link fresh (URL dibuat saat perintah dikirim).
