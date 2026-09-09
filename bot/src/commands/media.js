import sharp from 'sharp';
import axios from 'axios';
import { config, arenaBase, webBase } from '../core/config.js';

async function getImageBuffer(sock, m) {
  const { downloadMediaMessage } = await import('@sairidev/baileys-new');
  try {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const target = quoted ? { message: quoted, key: m.key } : m;
    if (!target.message?.imageMessage && !target.message?.videoMessage) return null;
    return await downloadMediaMessage(target, 'buffer', {});
  } catch { return null; }
}

// Rakit kartu player Spotify: audio + cover + frame bg gerak ditanam base64,
// bunyi via WebAudio (satu-satunya jalur audio yang lolos WebView WA).
async function buildSpotCard({ title, artist, dur, tag, mp3File, cover, stills }) {
  const { esc } = await import('../services/track.js');
  const fs = await import('fs');
  const audioB64 = fs.readFileSync(mp3File).toString('base64');
  if (audioB64.length > 700000) throw new Error('file terlalu besar untuk kartu, pakai !spotifydl');
  let coverB64 = '';
  try { if (cover) coverB64 = fs.readFileSync(cover).toString('base64'); } catch { /* fallback SVG */ }
  let html = fs.readFileSync(new URL('../web/spotify.html', import.meta.url).pathname, 'utf8');
  html = html.split('__TITLE__').join(esc(title)).split('__ARTIST__').join(esc(artist))
    .split('__TAG__').join(esc(tag)).split('__DUR__').join(String(dur))
    .split('__AUDIO_B64__').join(audioB64)
    .split('__COVER_B64__').join(coverB64)
    .split('__STILLS__').join(stills && stills.length ? JSON.stringify(stills) : '[]');
  if (html.length > 990000) throw new Error('kartu kebesaran untuk WA — pakai !spotifyfull / !spotifydl');
  return html;
}

// Kartu full chunked: potongan 60 detik dimainkan sambung-menyambung,
// decode just-in-time agar HP kentang tidak patah-patah.
async function buildFullCard({ title, artist, total, tag, chunks, durs, cover, stills }) {
  const { esc } = await import('../services/track.js');
  const fs = await import('fs');
  const parts = chunks.map((f) => fs.readFileSync(f).toString('base64'));
  let coverB64 = '';
  try { if (cover) coverB64 = fs.readFileSync(cover).toString('base64'); } catch { /* fallback SVG */ }
  let html = fs.readFileSync(new URL('../web/spotify-full.html', import.meta.url).pathname, 'utf8');
  html = html.split('__TITLE__').join(esc(title)).split('__ARTIST__').join(esc(artist))
    .split('__TAG__').join(esc(tag)).split('__TOTAL__').join(JSON.stringify(Math.floor(total)))
    .split('__PARTS__').join(JSON.stringify(parts))
    .split('__DURS__').join(JSON.stringify(durs.map((d) => Math.round(d * 100) / 100)))
    .split('__COVER_B64__').join(coverB64)
    .split('__STILLS__').join(stills && stills.length ? JSON.stringify(stills) : '[]');
  if (html.length > 990000) throw new Error('kartu kebesaran untuk WA — pakai !spotifyfull / !spotifydl');
  return html;
}

export const media = [
  {
    name: 's', aliases: ['sticker', 'stiker'], desc: 'Foto -> stiker (reply foto)',
    async run({ sock, jid, m, send }) {
      const buf = await getImageBuffer(sock, m);
      if (!buf) return send(jid, 'Balas foto dengan !s untuk menjadikannya stiker.');
      try {
        const webp = await sharp(buf).resize(512, 512, { fit: 'inside' }).webp().toBuffer();
        await sock.sendMessage(jid, { sticker: webp });
      } catch { await send(jid, 'Gagal membuat stiker. Coba foto lain.'); }
    },
  },
  {
    name: 'hd', aliases: ['enhance', 'remini'], desc: 'HD-kan foto (reply foto)',
    async run({ jid, m, send, sock }) {
      const buf = await getImageBuffer(sock, m);
      if (!buf) return send(jid, 'Balas foto dengan !hd untuk meningkatkan kualitasnya.');
      await send(jid, 'Memproses. Mohon tunggu...');
      try {
        const meta = await sharp(buf).metadata();
        const out = await sharp(buf).resize({ width: (meta.width || 800) * 2, kernel: 'lanczos3' })
          .sharpen().jpeg({ quality: 90 }).toBuffer();
        await sock.sendMessage(jid, { image: out, caption: 'Hasil penjernihan 2x, diproses lokal.' });
      } catch { await send(jid, 'Gagal memproses foto.'); }
    },
  },
  {
    name: 'tiktok', aliases: ['ig', 'ytmp3', 'ytmp4', 'dl'], desc: '!tiktok <url> downloader',
    async run({ jid, args, send, sock }) {
      const url = args[0];
      if (!url || !/^https?:\/\//.test(url)) return send(jid, 'Gunakan: !tiktok <link>');
      await send(jid, 'Mengunduh. Mohon tunggu, server gratis bisa lambat.');
      try {
        // API publik gratis (cobalt fallback). Jika mati, balas panduan manual.
        const { data } = await axios.post('https://co.wukko.xyz/api/json', { url },
          { headers: { Accept: 'application/json' }, timeout: 25000 }).catch(() => ({ data: null }));
        if (data?.url) {
          await sock.sendMessage(jid, { video: { url: data.url }, caption: 'Hasil unduhan.' });
        } else {
          await send(jid, 'Unduhan otomatis gagal untuk link ini. Coba link TikTok atau IG publik yang lain.');
        }
      } catch { await send(jid, 'Unduhan gagal.'); }
    },
  },
  {
    name: 'gambar', desc: '!gambar <prompt> (AI image gratis)',
    async run({ jid, raw, send, sock }) {
      if (!raw) return send(jid, 'Gunakan: !gambar kucing astronot');
      const { aiImage } = await import('../services/ai.js');
      const url = await aiImage(raw);
      await sock.sendMessage(jid, { image: { url }, caption: `${raw}` });
    },
  },
  {
    name: 'pin', aliases: ['pins', 'pinterest'], desc: '!pin <tema> galeri AI ala Pinterest di chat',
    async run({ jid, raw, send, sock }) {
      const tema = (raw || 'pemandangan indah').slice(0, 60);
      try {
        const { inlineGame, sendInlineWebUI } = await import('../wa/airich-send.js');
        const { webBase, config } = await import('../core/config.js');
        await send(jid, `Menyiapkan galeri *${tema}* 📌 (mengambil foto asli, ~5 detik)…`);
        // Foto ASLI per kata kunci via LoremFlickr (Pinterest langsung memblokir
        // server: 403 + dinding login). Thumb ditanam base64 agar pasti tampil.
        const kw = tema.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 3).join(',') || 'nature';
        const HS = [560, 380, 620, 440, 520, 400];
        const jobs = HS.map(async (h, i) => {
          const lock = Math.floor(Math.random() * 9000) + 1;
          const full = `https://loremflickr.com/420/${h}/${kw}?lock=${lock}`;
          const thumbUrl = `https://loremflickr.com/320/${Math.round(h * 320 / 420)}/${kw}?lock=${lock}`;
          let thumb = null;
          try {
            const r = await fetch(thumbUrl, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (r.ok) {
              const buf = Buffer.from(await r.arrayBuffer());
              if (buf.length > 2000 && buf.length < 400000) thumb = 'data:image/jpeg;base64,' + buf.toString('base64');
            }
          } catch {}
          if (!thumb) {
            // cadangan: AI bila foto asli gagal
            try {
              const r2 = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(tema)}?width=320&height=320&seed=${lock}&nologo=true`, { signal: AbortSignal.timeout(25000) });
              if (r2.ok) {
                const b2 = Buffer.from(await r2.arrayBuffer());
                if (b2.length > 2000 && b2.length < 400000) thumb = 'data:image/jpeg;base64,' + b2.toString('base64');
              }
            } catch {}
          }
          return { cap: `${tema} • Foto ${i + 1}`, sty: 'Foto asli', thumb, full };
        });
        const pins = await Promise.all(jobs);
        let html = await inlineGame('pin.html', {});
        html = html.split('__TEMA__').join(tema.replace(/</g, '').replace(/>/g, ''));
        html = html.split('__PINS__').join(JSON.stringify(pins).replace(/</g, '\\u003c'));
        const base = (config.webPublic || webBase()).replace(/\/$/, '');
        await sendInlineWebUI(sock, jid, html, '📌 ' + tema, { trustedSources: [base, 'https://loremflickr.com', 'https://image.pollinations.ai'] });
        await send(jid, `Galeri *${tema}* terkirim di atas 📌 (foto asli — Pinterest-nya langsung blokir bot, jadi ambil dari Flickr 📷).`);
      } catch (e) {
        const { webBase } = await import('../core/config.js');
        const { config } = await import('../core/config.js');
        await send(jid, `📌 *${tema}*\nBuka: ${webBase()}/pin?key=${config.panelKey}&tema=${encodeURIComponent(tema)} (inline gagal: ${e.message})`);
      }
    },
  },
  {
    name: 'spotify', aliases: ['musik', 'lagu', 'play'], desc: '!spotify <judul> [full] kartu preview / full-song-1-kartu',
    async run({ jid, raw, send, sock }) {
      if (!raw) return send(jid, 'Gunakan: !spotify <judul lagu> [full]\nContoh: !spotify kenangan terindah\nFull 1 kartu: !spotify kenangan terindah full\nFull per menit: !spotifyfull <judul> • Full file: !spotifydl <judul>');
      const { ensureTrack, ensureFullCard } = await import('../services/track.js');
      try {
        let q = raw, wantFull = false;
        if (/\sfull\s*$/i.test(q)) { wantFull = true; q = q.replace(/\sfull\s*$/i, '').trim(); }
        if (!q) return send(jid, 'Judulnya apa? Contoh: !spotify kenangan terindah full');
        const { sendInlineWebUI } = await import('../wa/airich-send.js');
        if (wantFull) {
          await send(jid, `Menyiapkan FULL "${q}" 1 kartu... (bisa ~3 menit)`);
          const { ensureTrack, ensureFullChunks } = await import('../services/track.js');
          const { cover, stills } = await ensureTrack(q);
          // Budget audio dinamis: sisa ruang kartu setelah cover+stills (html ≤960KB).
          const fs0 = await import('fs');
          let stillsLen = 0;
          try { stillsLen = JSON.stringify(stills || []).length; } catch { /* abaikan */ }
          let coverLen = 0;
          try { if (cover) coverLen = fs0.readFileSync(cover).toString('base64').length; } catch { /* abaikan */ }
          const targetKB = Math.max(200, Math.min(650, Math.floor(((960000 - 30000 - coverLen - stillsLen) / 1.336) / 1024)));
          const { chunks, durs, total, title, artist, br, n } = await ensureFullChunks(q, 60, targetKB);
          const html = await buildFullCard({
            title, artist, total, tag: `FULL SONG • OPUS ${br}K • ${n} BAGIAN`,
            chunks, durs, cover, stills,
          });
          await sendInlineWebUI(sock, jid, html, `Musik full: ${title}`);
          await send(jid, `Full *${title}* 1 kartu, main sambung-menyambung (Opus ${br}K). Mau kualitas file? !spotifydl ${q}`);
          return;
        }
        await send(jid, `Mencari "${q}"... (bisa ~1 menit)`);
        const { mp3, cover, stills, title, artist, dur } = await ensureTrack(q);
        const html = await buildSpotCard({ title, artist, dur, tag: 'PREVIEW 60 DETIK • OPUS 64K', mp3File: mp3, cover, stills });
        await sendInlineWebUI(sock, jid, html, `Musik: ${title}`);
      } catch (e) {
        await send(jid, `Gagal ambil lagu: ${e.message}`);
      }
    },
  },
  {
    name: 'spotifyfull', aliases: ['musikfull', 'lagufull', 'playfull'], desc: '!spotifyfull <judul> FULL song sebagai kartu per menit di UI',
    async run({ jid, raw, send, sock }) {
      if (!raw) return send(jid, 'Gunakan: !spotifyfull <judul lagu>\nContoh: !spotifyfull kenangan terindah');
      const { ensureTrack, ensureParts } = await import('../services/track.js');
      const { sendInlineWebUI } = await import('../wa/airich-send.js');
      try {
        await send(jid, `Menyiapkan FULL "${raw}" di UI... (bisa ~3 menit: unduh + potong per menit)`);
        const { parts, title, artist, n } = await ensureParts(raw);
        const { cover, stills } = await ensureTrack(raw);
        const fs = await import('fs');
        for (let i = 0; i < parts.length; i++) {
          const html = await buildSpotCard({
            title, artist, dur: 60,
            tag: `BAGIAN ${i + 1}/${n} • FULL SONG`,
            mp3File: parts[i], cover, stills,
          });
          await sendInlineWebUI(sock, jid, html, `Musik: ${title} (${i + 1}/${n})`);
        }
        await send(jid, `Full *${title}* terkirim ${n} kartu — putar berurutan dari 1/${n}. Lebih praktis? !spotifydl ${raw}`);
      } catch (e) {
        await send(jid, `Gagal ambil full: ${e.message}`);
      }
    },
  },
  {
    name: 'spotifydl', aliases: ['dlmusik', 'lagump3', 'musikdl'], desc: '!spotifydl <judul> kirim FULL song (file audio)',
    async run({ jid, raw, send, sock }) {
      if (!raw) return send(jid, 'Gunakan: !spotifydl <judul lagu>\nContoh: !spotifydl kenangan terindah');
      const { ensureFull } = await import('../services/track.js');
      try {
        await send(jid, `Mengambil FULL "${raw}"... (bisa ~2 menit, file besar)`);
        const { full, title, artist, url } = await ensureFull(raw);
        const fs = await import('fs');
        const crypto = await import('crypto');
        const h = crypto.createHash('md5').update(raw.toLowerCase().trim()).digest('hex').slice(0, 12);
        const coverP = new URL('../../data/music/' + h + '.jpg', import.meta.url).pathname;
        const caption = `*${title}* — ${artist} (full)${url ? `\nVideo: ${url}` : ''}\nKartu UI: !spotify ${raw}`;
        if (fs.existsSync(coverP)) {
          await sock.sendMessage(jid, { image: fs.readFileSync(coverP), caption });
        } else {
          await send(jid, caption);
        }
        await sock.sendMessage(jid, { audio: fs.readFileSync(full), mimetype: 'audio/mpeg' });
      } catch (e) {
        await send(jid, `Gagal ambil lagu: ${e.message}`);
      }
    },
  },
  {
    name: 'spotifyv', aliases: ['videolagu', 'musikvideo', 'spotvideodl'], desc: '!spotifyv <judul> kirim video musik 60 detik',
    async run({ jid, raw, send, sock }) {
      if (!raw) return send(jid, 'Gunakan: !spotifyv <judul lagu>\nContoh: !spotifyv kenangan terindah');
      const { ensureVideo } = await import('../services/track.js');
      try {
        await send(jid, `Mengambil video "${raw}"... (bisa ~2 menit, file besar)`);
        const { clip, title } = await ensureVideo(raw);
        const fs = await import('fs');
        await sock.sendMessage(jid, { video: fs.readFileSync(clip), caption: `*${title}* (video 60 detik)`, mimetype: 'video/mp4' });
      } catch (e) {
        await send(jid, `Gagal ambil video: ${e.message}`);
      }
    },
  },
  {
    name: 'spotsize', aliases: ['tesbatas'], desc: '!spotsize ukur batas ukuran kartu (diagnosa)',
    async run({ jid, send, sock }) {
      try {
        const fs = await import('fs');
        const { sendInlineWebUI } = await import('../wa/airich-send.js');
        let html = fs.readFileSync(new URL('../web/sizeprobe.html', import.meta.url).pathname, 'utf8');
        html = html.split('__FILLER__').join('A'.repeat(700 * 1024));
        await sendInlineWebUI(sock, jid, html, 'Ukur Batas');
        await send(jid, 'Kartu ukur terkirim (kalau tampil). Laporkan angka di dalamnya / kalau tidak muncul sama sekali.');
      } catch (e) {
        await send(jid, `Gagal kirim tes: ${e.message}`);
      }
    },
  },
  {
    name: 'spottest', aliases: ['tesfps'], desc: '!spottest tes 30fps + WebP di UI',
    async run({ jid, send, sock }) {
      try {
        const fs = await import('fs');
        const { sendInlineWebUI } = await import('../wa/airich-send.js');
        let html = fs.readFileSync(new URL('../web/fpstest.html', import.meta.url).pathname, 'utf8');
        const fr = fs.readFileSync(new URL('../../data/music/fps-test.json', import.meta.url).pathname, 'utf8');
        const webp = fs.readFileSync(new URL('../../data/music/webp-test.b64', import.meta.url).pathname, 'utf8');
        html = html.split('__FRAMES60__').join(fr).split('__WEBP_B64__').join(webp.trim());
        await sendInlineWebUI(sock, jid, html, 'Tes FPS');
        await send(jid, 'Kartu tes terkirim. Laporkan: kotak merah tampil? angka fps berapa? lancar/patah?');
      } catch (e) {
        await send(jid, `Gagal kirim tes: ${e.message}`);
      }
    },
  },
  {
    name: 'spotsize2', aliases: ['tesbatas2'], desc: '!spotsize2 ukur batas kartu 1MB+ (diagnosa)',
    async run({ jid, send, sock }) {
      try {
        const fs = await import('fs');
        const { sendInlineWebUI } = await import('../wa/airich-send.js');
        let html = fs.readFileSync(new URL('../web/sizeprobe.html', import.meta.url).pathname, 'utf8');
        html = html.split('__FILLER__').join('B'.repeat(1000 * 1024));
        await sendInlineWebUI(sock, jid, html, 'Ukur Batas 2');
        await send(jid, 'Kartu ukur 2 terkirim (kalau tampil). Laporkan angka / kalau tidak muncul.');
      } catch (e) {
        await send(jid, `Gagal kirim tes: ${e.message}`);
      }
    },
  },
  {
    name: 'spotsize3', aliases: ['tesbatas3'], desc: '!spotsize3 ukur batas kartu ~1MB (diagnosa)',
    async run({ jid, send, sock }) {
      try {
        const fs = await import('fs');
        const { sendInlineWebUI } = await import('../wa/airich-send.js');
        let html = fs.readFileSync(new URL('../web/sizeprobe.html', import.meta.url).pathname, 'utf8');
        html = html.split('__FILLER__').join('C'.repeat(1000 * 1024));
        await sendInlineWebUI(sock, jid, html, 'Ukur Batas 3');
        await send(jid, 'Kartu ukur 3 terkirim (kalau tampil). Laporkan angka / kalau tidak muncul.');
      } catch (e) {
        await send(jid, `Gagal kirim tes: ${e.message}`);
      }
    },
  },
  {
    name: 'spottone', aliases: ['tesringan'], desc: '!spottone tes audio minimal tanpa visual (diagnosa patah)',
    async run({ jid, raw, send, sock }) {
      try {
        const fs = await import('fs');
        const { ensureTrack } = await import('../services/track.js');
        const { sendInlineWebUI } = await import('../wa/airich-send.js');
        const q = (raw || 'sency').trim();
        const { mp3 } = await ensureTrack(q);
        let html = fs.readFileSync(new URL('../web/tonetest.html', import.meta.url).pathname, 'utf8');
        html = html.split('__AUDIO_B64__').join(fs.readFileSync(mp3).toString('base64'));
        await sendInlineWebUI(sock, jid, html, 'Tes Ringan');
        await send(jid, 'Kartu ringan terkirim (lagu yang sama, tanpa gambar/animasi). Putar 30 detik: MULUS atau PATAH?');
      } catch (e) {
        await send(jid, `Gagal kirim tes: ${e.message}`);
      }
    },
  },
  {
    name: 'spotdiag', aliases: ['tesaudio'], desc: '!spotdiag tes kemampuan audio WebView (diagnosa player)',
    async run({ jid, send, sock }) {
      try {
        const fs = await import('fs');
        const { sendInlineWebUI } = await import('../wa/airich-send.js');
        const { esc } = await import('../services/track.js');
        const { default: crypto } = await import('crypto');
        const base = webBase();
        // Nada tes 3 detik (dibuat via ffmpeg, lihat tools-make-testtone.sh)
        const testH = crypto.createHash('md5').update('wa-test-tone').digest('hex').slice(0, 12);
        const testUrl = `${base}/music/${testH}.mp3?key=${config.panelKey}`;
        let html = fs.readFileSync(new URL('../web/audiotest.html', import.meta.url).pathname, 'utf8');
        html = html.split('__TEST_URL__').join(esc(testUrl));
        try {
          const songH = crypto.createHash('md5').update('kenangan terindah').digest('hex').slice(0, 12);
          html = html.split('__DIAG_CLIP_B64__').join(fs.readFileSync(new URL('../../data/music/' + songH + '.mp4', import.meta.url).pathname).toString('base64'));
          html = html.split('__DIAG_COVER_B64__').join(fs.readFileSync(new URL('../../data/music/' + songH + '.jpg', import.meta.url).pathname).toString('base64'));
        } catch { html = html.split('__DIAG_CLIP_B64__').join('').split('__DIAG_COVER_B64__').join(''); }
        await sendInlineWebUI(sock, jid, html, 'Diagnosa Audio', { trustedSources: [base] });
        await send(jid, 'Kartu tes terkirim di atas. Ketuk tiap tombol Tes, lalu laporkan hasil A/B/C ke owner.');
      } catch (e) {
        await send(jid, `Gagal kirim tes: ${e.message}`);
      }
    },
  },
  {
    name: 'snake', aliases: ['snakeweb'], desc: '!snake game ular langsung di chat',
    async run({ jid, sender, send, sock }) {
      try {
        const { inlineGame, sendInlineWebUI } = await import('../wa/airich-send.js');
        const { createPlayToken } = await import('../core/playtoken.js');
        await sendInlineWebUI(sock, jid, await inlineGame('snake.html', { token: await createPlayToken(sender) }), 'Snake');
      } catch (e) {
        await send(jid, `Gagal memuat game: ${e.message}`);
      }
    },
  },
  {
    name: 'airichtest', aliases: ['airich'], desc: '!airichtest [catur|rpg] uji HTML via AIRich (owner)', ownerOnly: true,
    async run({ jid, args, send, sock }) {
      const which = (args[0] || 'catur').toLowerCase();
      try {
        const { sendAiRichHtml } = await import('../wa/airich-send.js');
        let html, title;
        if (which === 'rpg') {
          const fs = await import('fs');
          html = fs.readFileSync(new URL('../web/rpggame.html', import.meta.url).pathname, 'utf8');
          title = 'Tes AIRich HTML: RPG';
        } else {
          const { Chess } = await import('chess.js');
          const { chessHtml } = await import('./chesshtml.js');
          const c = new Chess();
          html = chessHtml(c);
          title = 'Tes AIRich HTML: Catur';
        }
        const id = await sendAiRichHtml(sock, jid, { title, html });
        await send(jid, `Terkirim via jalur AIRich (id ${id}). Lihat di HP: tampil interaktif, statis, atau kosong? Laporkan.`);
      } catch (e) {
        await send(jid, `Gagal kirim: ${e.message}`);
      }
    },
  },
  {
    name: 'diag', aliases: ['diagnostik', 'teskoneksi'], desc: '!diag tes internet di dalam chat',
    async run({ jid, send, sock }) {
      try {
        const fs = await import('fs');
        const { sendInlineWebUI } = await import('../wa/airich-send.js');
        const { arenaBase } = await import('../core/config.js');
        let html = fs.readFileSync(new URL('../../arena/public/diag.html', import.meta.url).pathname, 'utf8');
        const sioPath = new URL('../../arena/node_modules/socket.io/client-dist/socket.io.min.js', import.meta.url).pathname;
        html = html.replace('<script src="/socket.io/socket.io.js"></script>', '<script>' + fs.readFileSync(sioPath, 'utf8') + '</script>');
        html = html.split('__DIAG_BASE__').join(arenaBase());
        html = html.split('__BUILT_AT__').join(new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }));
        await sendInlineWebUI(sock, jid, html, 'Diagnostik Koneksi', {
          trustedSources: [
            arenaBase(),
            'https://www.google.com',
            'https://example.com',
            'https://cdnjs.cloudflare.com',
          ],
        });
        await send(jid, 'Halaman tes terkirim di atas. Baca 5 baris hasilnya dan laporkan semuanya.');
      } catch (e) {
        await send(jid, `Gagal kirim tes: ${e.message}`);
      }
    },
  },
  {
    name: 'bubble', aliases: ['bubblechat', 'chatui'], desc: '!bubble ngobrol bubble langsung di chat',
    async run({ jid, sender, send, sock }) {
      try {
        const { inlineGame, sendInlineWebUI } = await import('../wa/airich-send.js');
        const { createPlayToken } = await import('../core/playtoken.js');
        await sendInlineWebUI(sock, jid, await inlineGame('bubble.html', { token: await createPlayToken(sender) }), 'Bubble Chat');
        await send(jid, 'Bubble chat terkirim di atas. Ngobrol langsung di situ, klaim skor buat !rank.');
      } catch (e) {
        await send(jid, `Gagal memuat bubble: ${e.message}`);
      }
    },
  },
  {
    name: 'kuiz', aliases: ['kuisweb'], desc: '!kuiz kuis kilat langsung di chat',
    async run({ jid, sender, send, sock }) {
      try {
        const { inlineGame, sendInlineWebUI } = await import('../wa/airich-send.js');
        const { createPlayToken } = await import('../core/playtoken.js');
        await sendInlineWebUI(sock, jid, await inlineGame('kuiz.html', { token: await createPlayToken(sender) }), 'Kuis Kilat');
      } catch (e) {
        await send(jid, `Gagal memuat game: ${e.message}`);
      }
    },
  },
  {
    name: 'arena', aliases: ['rpgpvp', 'pvp', 'ui', 'webui'], desc: '!arena [KODE] RPG multipemain langsung di chat',
    async run({ jid, sender, args, send, sock }) {
      const room = ((args[0] || '').toUpperCase().slice(0, 8)) || 'LOBBY';
      try {
        const fs = await import('fs');
        const { sendInlineWebUI } = await import('../wa/airich-send.js');
        const { createPlayToken } = await import('../core/playtoken.js');
        const { arenaBase } = await import('../core/config.js');
        const sioPath = new URL('../../arena/node_modules/socket.io/client-dist/socket.io.min.js', import.meta.url).pathname;
        let html = fs.readFileSync(new URL('../../arena/public/rpg.html', import.meta.url).pathname, 'utf8');
        const sio = fs.readFileSync(sioPath, 'utf8');
        html = html.replace('<script src="/socket.io/socket.io.js"></script>', '<script>' + sio + '</script>');
        html = html.split('__RPG_SOCK__').join(arenaBase());
        html = html.split(`'__PTOK__'`).join(`'${await createPlayToken(sender)}'`);
        html = html.split(`'__ROOM__'`).join(`'${room}'`);
        try {
          await sendInlineWebUI(sock, jid, html, 'RPG Arena ' + room);
        } catch (e) {
          await send(jid, `RPG Arena room *${room}* (buka link, bisa beda jaringan):\n${arenaBase()}/rpg?room=${room}`);
          return;
        }
        await send(jid, `RPG Arena room *${room}* terkirim di atas. Isi nama + MAIN. Ajak teman: suruh kirim !arena ${room}.`);
      } catch (e) {
        await send(jid, `Gagal memuat game: ${e.message}`);
      }
    },
  },
  {
    name: 'rpghtml', aliases: ['rpgweb'], desc: '!rpghtml RPG langsung di bubble chat',
    async run({ jid, sender, send, sock }) {
      try {
        const { inlineGame, sendInlineWebUI } = await import('../wa/airich-send.js');
        const { createPlayToken } = await import('../core/playtoken.js');
        await sendInlineWebUI(sock, jid, await inlineGame('rpggame.html', { token: await createPlayToken(sender) }), 'RPG Adventure');
        await send(jid, 'Game RPG terkirim di atas. Mainkan langsung di chat, skor tercatat otomatis.');
      } catch (e) {
        await send(jid, `Gagal memuat game: ${e.message}`);
      }
    },
  },
  {
    name: 'bomber', aliases: ['nekopark', 'neko'], desc: '!bomber [KODE] bomber PvP ala kucing',
    async run({ jid, args, send, sock }) {
      const room = (args[0] || '').toUpperCase().slice(0, 8);
      try {
        const res = await axios.post(config.arenaApi, { roomId: room || undefined, groupId: jid }, { timeout: 8000 });
        const rid = res.data.roomId || room || 'LOBBY';
        const link = `${arenaBase()}/bomber.html?room=${rid}`;
        const caption = `*NEKO PARK*\nRoom: *${rid}*\n\nMain di sini (ketuk link):\n${link}\n\nTombol: kiri-kanan gerak, LOMPAT, PAKAI BOM. JAUH/DEKAT atur kamera. Kirim emoji + chat global dari dalam game. 2-6 pemain, 5 kill menang. Isi nomor WA untuk klaim skor ke !rank.`;
        try {
          const { bomberCard } = await import('./promocard.js');
          await sock.sendMessage(jid, { image: await bomberCard(), caption });
        } catch {
          await send(jid, caption);
        }
      } catch {
        const r = room || Math.random().toString(36).slice(2, 6).toUpperCase();
        await send(jid, `Arena mode offline. Buka: ${arenaBase()}/bomber.html?room=${r}`);
      }
    },
  },
];
