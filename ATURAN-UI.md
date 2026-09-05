# ATURAN UI GAME — DILARANG & WAJIB

> Dokumen ini mengikat semua pengembangan game bot.
> Prinsip: pemain **hanya menyentuh UI di dalam bubble chat**. Tidak ada jalan keluar dari chat.

## DILARANG KERAS

| # | Larangan | Alasan |
|---|----------|--------|
| 1 | **Polling** sebagai kontrol game | Bukan UI game; merusak pengalaman |
| 2 | **Tombol WA** dalam bentuk apa pun (native flow, klasik, template, list, CTA) | Terbukti tidak tampil untuk pengirim nomor biasa |
| 3 | **Balas angka / huruf** (`1`, `U`, dsb) sebagai kontrol | Itu mengetik, bukan UI |
| 4 | **Ketik perintah** untuk bermain (`!serang`, `!jalan`, dll) | Perintah hanya untuk mulai (`!dunia`), selebihnya UI |
| 5 | **Ketuk yang tidak terlihat** (tombol terkirim tapi tak tampil) | Dilarang mengandalkan format yang belum terbukti tampil di HP |
| 6 | **Buka browser / link keluar WA** untuk inti permainan | Game harus hidup di bubble chat |

## WAJIB

- Kontrol game (maju, mundur, kiri, kanan, aksi, skill) **tampil sebagai UI di dalam bubble chat** dan berfungsi saat disentuh.
- Setiap giliran layar diperbarui di dalam chat (gambar/peta/kartu + kontrolnya satu kesatuan).
- Skor, nyawa, dan progres terlihat tanpa keluar chat.

## STATUS RISET (fakta uji, bukan opini)

| Pendekatan | Hasil uji | Kesimpulan |
|------------|-----------|------------|
| Quick reply native | Terkirim, tak tampil | MATI untuk nomor biasa |
| Interactive nativeFlow | Terkirim, tak tampil | MATI untuk nomor biasa |
| Template / list / CTA URL | Terkirim, tak tampil | MATI untuk nomor biasa |
| Tombol klasik buttonsMessage | Terkirim, tak tampil | MATI untuk nomor biasa |
| Polling | Tampil & berfungsi | HIDUP tapi DILARANG aturan #1 |
| Balas angka/huruf | Berfungsi | HIDUP tapi DILARANG aturan #3 |
| Gambar peta/kartu per giliran | Tampil | HIDUP, dipakai sebagai layar |
| AIRich render HTML→gambar | Tampil sempurna | HIDUP, dipakai untuk papan/kartu |
| Game web + websocket | Jalan beda jaringan | HIDUP tapi di luar chat (langgar #6 bila jadi inti) |
| Inline WebUI Azusa (`botForwardedMessage` + `GenAIaeacdsnwHtmlPrimitive`, relay langsung) | **TERBUKTI TAMPIL di HP (tes `!ui`)** | **JALUR RESMI game bubble** |

## ATURAN PENGEMBANGAN

1. Format kontrol baru **dilarang dipakai** sebelum terbukti tampil di HP lewat tes langsung (kirim → screenshot → konfirmasi).
2. Klaim "katanya bisa" tanpa artefak yang bisa diuji = bukan bukti.
3. Fallback teks/angka hanya boleh sebagai cadangan tak terlihat (tidak diiklankan di caption).
4. Setiap perubahan alur game wajib lolos simulasi (`node -e` harness) sebelum restart service.

## PENGECUALIAN DISETUJUI PEMILIK

- Game multipemain real-time (RPG Arena: `!ui`) boleh memakai WebUI inline + websocket — disetujui karena tidak ada jalur bubble yang lolos uji untuk PvP 6 pemain real-time.
- Skor web tetap tercatat otomatis via token per pemain (tanpa input nomor).

## VONIS DIAGNOSTIK (`!diag`, teruji di HP 2026-09-05)

- JavaScript di WebUI: JALAN
- Fetch HTTPS dari WebUI: GAGAL (sandbox tanpa internet)
- WebSocket dari WebUI: DITOLAK
- Gambar (img), JSONP (script): GAGAL

Artinya: semua yang butuh jaringan dari dalam WebUI (duel socket, submit skor, CDN) MUSTAHIL di HP ini. Yang hidup hanya HTML+JS murni offline. Duel multipemain kembali ke teks+gambar (`!chess e2e4` + papan per giliran).

## VONIS FINAL (2026-09-05, hasil `!diag` v2)

Sandbox WebUI: klik JALAN, gambar/img GAGAL, fetch GAGAL, JSONP/script GAGAL — **nol akses jaringan**. Maka:
- Tombol Kirim skor dicabut dari semua game (snake, kuiz, rpg, catur) — skor hanya tercatat server-side (duel, bot catur, RPG chat).
- Game WebUI = murni hiburan offline (catur vs bot, snake, kuiz, RPG solo).
- Duel & rank tetap lewat chat (teks + gambar papan per giliran).

## Duel hotseat (tanpa jaringan, 1 HP berdua)

Papan catur inline punya tombol Lawan: Bot / 2 Pemain. Mode 2 Pemain = Putih dan Hitam gantian ketuk di HP yang sama (cocok untuk duel kasual tatap muka). Skor tidak tercatat (butuh server) — yang dicatat hanya duel via chat dan lawan bot.
