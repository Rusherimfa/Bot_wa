# WA Panel (Laravel) — dashboard web untuk WA Bot Full. 100% gratis, lokal.

## Jalankan
```bash
~/projects/start.sh   # bot + panel + scheduler sekaligus
# atau manual:
php artisan serve --port=8000
php artisan schedule:work   # wajib untuk broadcast terjadwal
```
Buka http://127.0.0.1:8000 — login `admin / admin123`
( ganti `PANEL_ADMIN_USER` / `PANEL_ADMIN_PASS` di `.env`, lalu buat ulang admin:
`php artisan tinker --execute="App\Models\PanelAdmin::truncate(); App\Http\Controllers\AuthController::seedDefault();"` )

## Syarat
- Bot Node jalan (`wa-bot-full`, port 3000 + `PANEL_API_KEY` sama dengan `WA_BOT_KEY` di sini)
- Postgres sistem jalan, DB `wabot` (bot + panel pakai tabel yang sama)

## Halaman
- `/` Dashboard (status WA live + statistik)
- `/koneksi` QR scan langsung dari browser (auto: bila bot belum connect)
- `/grup` welcome/antilink per grup (sama efeknya dengan `!welcome`)
- `/toko` produk, stok, order, omset (terhubung dengan `!katalog/!order`)
- `/broadcast` kirim cepat + jadwalkan (max 5 target/menit, jeda 12 dtk — anti-ban)
- `/rank` leaderboard game

## Catatan
- Tanpa docker/VPS: semua jalan di mesin ini saat menyala.
- Broadcast butuh `schedule:work` tetap jalan.
- `Ollama` (port 11434) dipakai bot untuk `!ai` bila `OLLAMA_URL` diisi.
