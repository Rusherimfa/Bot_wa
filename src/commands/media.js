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
        const out = await sharp(buf).resize((meta.width || 800) * 2, null, { kernel: 'lanczos3' })
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
    name: 'spotify', aliases: ['musik', 'lagu', 'play'], desc: '!spotify <judul> player lagu 60 detik',
    async run({ jid, raw, send, sock }) {
      if (!raw) return send(jid, 'Gunakan: !spotify <judul lagu>\nContoh: !spotify kenangan terindah');
      const { execFile } = await import('child_process');
      const fs = await import('fs');
      const crypto = await import('crypto');
      const runYt = (args) => new Promise((resolve, reject) => {
        execFile(process.env.HOME + '/.local/bin/yt-dlp', args, { timeout: 120000 }, (err, stdout, stderr) => {
          // yt-dlp bisa exit non-zero walau file jadi (mis. max-downloads) — pemanggil cek file
          if (err && !stdout) reject(new Error((stderr || err.message).split('\n').filter(Boolean).slice(-2).join(' ')));
          else resolve(stdout);
        });
      });
      const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      try {
        await send(jid, `Mencari "${raw}"... (bisa ~1 menit)`);
        const dir = new URL('../../data/music/', import.meta.url).pathname;
        fs.mkdirSync(dir, { recursive: true });
        const h = crypto.createHash('md5').update(raw.toLowerCase().trim()).digest('hex').slice(0, 12);
        const mp3 = dir + h + '.mp3';
        const metaF = dir + h + '.json';
        let title = raw, artist = 'YouTube', dur = 60;
        if (!fs.existsSync(mp3)) {
          const meta = await runYt(['--no-playlist', '--skip-download', '--print', '%(title)s|%(uploader)s|%(duration)s', `ytsearch1:${raw}`]);
          const parts = meta.trim().split('|');
          if (parts[0]) title = parts[0].slice(0, 60);
          if (parts[1] && parts[1] !== 'NA') artist = parts[1].slice(0, 40);
          await runYt(['--no-playlist', '-x', '--audio-format', 'mp3', '--audio-quality', '48K',
            '--download-sections', '*00:00-01:00', '-o', dir + h + '.%(ext)s', `ytsearch1:${raw}`]);
          if (!fs.existsSync(mp3)) throw new Error('download gagal');
          fs.writeFileSync(metaF, JSON.stringify({ title, artist }));
        } else if (fs.existsSync(metaF)) {
          try { ({ title, artist } = JSON.parse(fs.readFileSync(metaF, 'utf8'))); } catch { /* pakai default */ }
        }
        const b64 = fs.readFileSync(mp3).toString('base64');
        if (b64.length > 1500000) throw new Error('file terlalu besar');
        let html = fs.readFileSync(new URL('../web/spotify.html', import.meta.url).pathname, 'utf8');
        html = html.split('__TITLE__').join(esc(title)).split('__ARTIST__').join(esc(artist))
          .split('__DUR__').join(String(dur)).split('__AUDIO_B64__').join(b64);
        const { sendInlineWebUI } = await import('../wa/airich-send.js');
        await sendInlineWebUI(sock, jid, html, `Musik: ${title}`);
      } catch (e) {
        await send(jid, `Gagal ambil lagu: ${e.message}`);
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
