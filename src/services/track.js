// Helper unduhan lagu (dipakai !spotify kartu UI dan !spotifydl file audio).
// Cache di ./data/music/<md5(judul)>.mp3 + .json agar judul sama tak unduh ulang.
import { execFile } from 'child_process';
import fs from 'fs';
import crypto from 'crypto';

export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const runYt = (args) =>
  new Promise((resolve, reject) => {
    execFile(process.env.HOME + '/.local/bin/yt-dlp', args, { timeout: 120000 }, (err, stdout, stderr) => {
      // yt-dlp bisa exit non-zero walau file jadi (mis. max-downloads) — pemanggil cek file
      if (err && !stdout) reject(new Error((stderr || err.message).split('\n').filter(Boolean).slice(-2).join(' ')));
      else resolve(stdout);
    });
  });

// Judul lagu ATAU link langsung (YouTube dkk — yt-dlp yang urus).
const targetOf = (raw) => (/^https?:\/\//.test(raw.trim()) ? raw.trim() : `ytsearch1:${raw}`);

const probeDur = (p) =>
  new Promise((resolve, reject) => {
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', p],
      { timeout: 30000 }, (err, stdout) => {
        const d = parseFloat(String(stdout).trim());
        if (err || !Number.isFinite(d) || d <= 0) reject(new Error('probe gagal'));
        else resolve(d);
      });
  });

export async function ensureTrack(raw) {
  const dir = new URL('../../data/music/', import.meta.url).pathname;
  fs.mkdirSync(dir, { recursive: true });
  const h = crypto.createHash('md5').update(raw.toLowerCase().trim()).digest('hex').slice(0, 12);
  const mp3 = dir + h + '.opus';
  const metaF = dir + h + '.json';
  let title = raw, artist = 'YouTube', dur = 60, url = '';
  if (!fs.existsSync(mp3)) {
    const meta = await runYt(['--no-playlist', '--skip-download', '--print', '%(title)s\t%(uploader)s\t%(duration)s\t%(webpage_url)s', targetOf(raw)]);
    const parts = String(meta).trim().split('\t');
    if (parts[0]) title = parts[0].slice(0, 60);
    if (parts[1] && parts[1] !== 'NA') artist = parts[1].slice(0, 40);
    const full = Number(parts[2]);
    if (Number.isFinite(full) && full > 0) dur = Math.min(60, Math.floor(full));
    if (parts[3] && /^https?:\/\//.test(parts[3])) url = parts[3].slice(0, 200);
    await runYt(['--no-playlist', '-x', '--audio-format', 'opus', '--audio-quality', '64K',
      '--download-sections', '*00:00-01:00', '--write-thumbnail', '--convert-thumbnails', 'jpg',
      '-o', dir + h + '.%(ext)s', targetOf(raw)]);
    if (!fs.existsSync(mp3)) throw new Error('download gagal');
    fs.writeFileSync(metaF, JSON.stringify({ title, artist, url }));
    // Normalisasi paksa: 60 detik, opus 48k CBR (yt-dlp pernah lolos full-length
    // dan mengabaikan --audio-quality untuk opus → 138k. Deterministik di sini.)
    try {
      const tmp = mp3 + '.norm.opus';
      await new Promise((resolve, reject) => {
        execFile('ffmpeg', ['-y', '-v', 'error', '-i', mp3, '-t', '60',
          '-c:a', 'libopus', '-b:a', '64k', '-vbr', 'off', '-ac', '2', tmp],
          { timeout: 120000 }, (e) => (e ? reject(e) : resolve()));
      });
      fs.renameSync(tmp, mp3);
      const d = await probeDur(mp3);
      dur = Math.min(60, Math.floor(d) || dur);
    } catch { /* pakai file apa adanya + dur meta */ }
    // Kecilkan cover 16:9 penuh TANPA crop (best-effort, musik tetap jalan tanpa cover)
    try {
      const { default: sharp } = await import('sharp');
      const cover = dir + h + '.jpg';
      if (fs.existsSync(cover)) {
        const small = await sharp(cover).resize(320).jpeg({ quality: 68 }).toBuffer();
        fs.writeFileSync(cover, small);
      }
    } catch { /* abaikan */ }
  } else if (fs.existsSync(metaF)) {
    try { ({ title, artist, url } = JSON.parse(fs.readFileSync(metaF, 'utf8'))); } catch { /* pakai default */ }
  }
  const coverP = dir + h + '.jpg';
  // 3 foto 720p untuk slideshow sinematik (best-effort). Fakta: flip cepat
  // atas gambar detail (teks!) terlihat burik karena mata tak sempat fokus;
  // stills 4-detik + zoom selalu tajam (terbukti di file gambar).
  let stills = null;
  const stillsF = dir + h + '.stills.json';
  try {
    if (fs.existsSync(stillsF)) {
      const arr = JSON.parse(fs.readFileSync(stillsF, 'utf8'));
      if (Array.isArray(arr) && arr.length) stills = arr;
    } else {
      await runYt(['--no-playlist', '-f', 'bv*[height<=720]/b[height<=720]/worst',
        '--download-sections', '*00:30-00:35', '--force-keyframes-at-cuts',
        '-o', dir + h + '.fsec.%(ext)s', targetOf(raw)]);
      const seg = fs.readdirSync(dir).find((f) => f.startsWith(h + '.fsec.'));
      if (seg) {
        const tmp = fs.mkdtempSync('/tmp/st-');
        try {
          const arr = [];
          for (let s = 0; s < 3; s++) {
            const out = tmp + '/s' + s + '.jpg';
            await new Promise((resolve, reject) => {
              execFile('ffmpeg', ['-y', '-v', 'error', '-ss', String(0.5 + s * 2),
                '-i', dir + seg, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '8', out],
                { timeout: 60000 }, (err) => (err ? reject(err) : resolve()));
            });
            if (fs.existsSync(out)) arr.push(fs.readFileSync(out).toString('base64'));
          }
          if (arr.length === 3 && JSON.stringify(arr).length < 400000) {
            fs.writeFileSync(stillsF, JSON.stringify(arr));
            stills = arr;
          }
        } finally {
          try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* abaikan */ }
          try { fs.unlinkSync(dir + seg); } catch { /* abaikan */ }
        }
      }
    }
  } catch { stills = null; }
  return { h, mp3, title, artist, dur, url: url || '', hasCover: fs.existsSync(coverP), cover: fs.existsSync(coverP) ? coverP : null, stills };
}

// Full song untuk !spotifydl (tanpa potongan 60 detik). File besar (MB-an)
// wajar untuk pesan audio WA — kartu UI tetap preview 60 detik karena
// batas ukuran pesan (terbukti: kartu >~640KB tidak sampai utuh).
export async function ensureFull(raw) {
  const dir = new URL('../../data/music/', import.meta.url).pathname;
  fs.mkdirSync(dir, { recursive: true });
  const h = crypto.createHash('md5').update(raw.toLowerCase().trim()).digest('hex').slice(0, 12);
  const full = dir + h + '.full.mp3';
  if (!fs.existsSync(full)) {
    await runYt(['--no-playlist', '-x', '--audio-format', 'mp3', '--audio-quality', '128K',
      '-o', dir + h + '.full.%(ext)s', targetOf(raw)]);
    if (!fs.existsSync(full)) throw new Error('download full song gagal');
    const st = fs.statSync(full);
    if (st.size > 16 * 1024 * 1024) { try { fs.unlinkSync(full); } catch { /* abaikan */ } throw new Error('full song terlalu besar untuk WA'); }
  }
  let title = raw, artist = 'YouTube', url = '';
  try {
    const metaF = dir + h + '.json';
    if (fs.existsSync(metaF)) ({ title, artist, url } = JSON.parse(fs.readFileSync(metaF, 'utf8')));
  } catch { /* pakai default */ }
  return { full, title, artist, url: url || '' };
}

// Full song dalam 1 kartu (Opus). Batas ukur !spotsize: 701KB html utuh
// (≈940KB wire) → budget biner audio 448KB → wire kartu ≤ ~900KB.
export async function ensureFullCard(raw, targetKB = 500) {
  const { full, title, artist } = await ensureFull(raw);
  const dir = new URL('../../data/music/', import.meta.url).pathname;
  const h = crypto.createHash('md5').update(raw.toLowerCase().trim()).digest('hex').slice(0, 12);
  const durTotal = await new Promise((resolve, reject) => {
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', full],
      { timeout: 30000 }, (err, stdout) => {
        const d = parseFloat(String(stdout).trim());
        if (err || !Number.isFinite(d) || d <= 0) reject(new Error('gagal baca durasi'));
        else resolve(d);
      });
  });
  // libopus stereo-48kHz diam-diam menaikkan <32k menjadi ~36k (terbukti).
  // Jadi stereo hanya bila budget ≥38k, selain itu mono-24kHz (jujur + pas).
  let br = Math.max(12, Math.min(48, Math.floor((targetKB * 8) / durTotal)));
  let ch = 1, ar = 24000;
  if (br >= 38) { ch = 2; ar = 48000; }
  const card = dir + h + '.card.ogg';
  await new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-v', 'error', '-i', full,
      '-c:a', 'libopus', '-b:a', br + 'k', '-vbr', 'off', '-ac', String(ch), '-ar', String(ar), card],
      { timeout: 180000 }, (err) => (err ? reject(err) : resolve()));
  });
  const st = fs.statSync(card);
  if (st.size > (targetKB + 20) * 1024) { try { fs.unlinkSync(card); } catch { /* abaikan */ } throw new Error('lagu kepanjangan untuk 1 kartu — pakai !spotifyfull / !spotifydl'); }
  const fullP = dir + h + '.full.mp3';
  return { card, full: fullP, title, artist, durTotal, br, ch, ar };
}

// Full song sebagai potongan 60 detik untuk dimainkan sambung-menyambung
// dalam 1 kartu (menghindari decode raksasa yang bikin HP kentang patah-patah).
export async function ensureFullChunks(raw, sec = 60, targetKB = 500) {
  const info = await ensureFullCard(raw, targetKB);
  const dir = new URL('../../data/music/', import.meta.url).pathname;
  const h = crypto.createHash('md5').update(raw.toLowerCase().trim()).digest('hex').slice(0, 12);
  const n = Math.max(1, Math.ceil(info.durTotal / sec));
  const chunks = [], durs = [];
  for (let i = 0; i < n; i++) {
    const cf = dir + h + '.c' + i + '.ogg';
    const want = i < n - 1 ? sec : info.durTotal - sec * (n - 1);
    if (!fs.existsSync(cf)) {
      await new Promise((resolve, reject) => {
        execFile('ffmpeg', ['-y', '-v', 'error', '-ss', String(i * sec), '-t', String(want), '-i', info.full,
          '-c:a', 'libopus', '-b:a', info.br + 'k', '-vbr', 'off', '-ac', String(info.ch), '-ar', String(info.ar), cf],
          { timeout: 120000 }, (err) => (err ? reject(err) : resolve()));
      });
      if (!fs.existsSync(cf)) throw new Error('gagal motong chunk ' + (i + 1));
    }
    const d = await probeDur(cf);
    chunks.push(cf);
    durs.push(d);
  }
  return { ...info, chunks, durs, total: durs.reduce((a, b) => a + b, 0), n };
}

// Potongan per 60 detik dari full song untuk !spotifyfull (full di UI).
export async function ensureParts(raw, sec = 60, maxParts = 6) {
  const { full, title, artist } = await ensureFull(raw);
  const dir = new URL('../../data/music/', import.meta.url).pathname;
  const h = crypto.createHash('md5').update(raw.toLowerCase().trim()).digest('hex').slice(0, 12);
  const durTotal = await new Promise((resolve, reject) => {
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', full],
      { timeout: 30000 }, (err, stdout) => {
        const d = parseFloat(String(stdout).trim());
        if (err || !Number.isFinite(d) || d <= 0) reject(new Error('gagal baca durasi'));
        else resolve(d);
      });
  });
  if (Math.ceil(durTotal / sec) > maxParts) throw new Error('lagu lebih dari 6 menit — pakai !spotifydl saja');
  const n = Math.max(1, Math.ceil(durTotal / sec));
  const parts = [];
  for (let i = 0; i < n; i++) {
    const pf = dir + h + '.p' + i + '.opus';
    if (!fs.existsSync(pf)) {
      await new Promise((resolve, reject) => {
        execFile('ffmpeg', ['-y', '-v', 'error', '-ss', String(i * sec), '-t', String(sec),
          '-i', full, '-c:a', 'libopus', '-b:a', '64k', '-vbr', 'off', '-ac', '2', pf],
          { timeout: 120000 }, (err) => (err ? reject(err) : resolve()));
      });
      if (!fs.existsSync(pf)) throw new Error('gagal motong bagian ' + (i + 1));
    }
    parts.push(pf);
  }
  return { parts, title, artist, n, durTotal };
}

// Video musik 60 detik (00:00-01:00, target 720p HD) untuk !spotifyv.
// Kalau 720p kebesaran untuk WA, otomatis turun ke 480p.
export async function ensureVideo(raw) {
  const dir = new URL('../../data/music/', import.meta.url).pathname;
  fs.mkdirSync(dir, { recursive: true });
  const h = crypto.createHash('md5').update(raw.toLowerCase().trim()).digest('hex').slice(0, 12);
  const final = dir + h + '.60s.mp4';
  if (fs.existsSync(final)) {
    let title = raw;
    try {
      const metaF = dir + h + '.json';
      if (fs.existsSync(metaF)) ({ title } = JSON.parse(fs.readFileSync(metaF, 'utf8')));
    } catch { /* pakai default */ }
    return { clip: final, title };
  }
  await runYt(['--no-playlist', '-f', 'bv*[height<=720]+ba/b[height<=720]/b/worst',
    '--download-sections', '*00:00-01:00', '--force-keyframes-at-cuts',
    '-o', dir + h + '.v60.%(ext)s', targetOf(raw)]);
  const found = fs.readdirSync(dir).find((f) => f.startsWith(h + '.v60.'));
  if (!found) throw new Error('download video gagal');
  const enc = (scale, crf) => new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-v', 'error', '-i', dir + found,
      '-vf', 'scale=' + scale + ':-2', '-c:v', 'libx264', '-crf', String(crf), '-preset', 'veryfast',
      '-c:a', 'aac', '-b:a', '96k', final], { timeout: 300000 }, (err) => (err ? reject(err) : resolve()));
  });
  try {
    await enc(1280, 26);
    if (fs.statSync(final).size > 32 * 1024 * 1024) await enc(854, 26);
  } finally {
    try { fs.unlinkSync(dir + found); } catch { /* abaikan */ }
  }
  const st = fs.statSync(final);
  if (st.size > 32 * 1024 * 1024) { try { fs.unlinkSync(final); } catch { /* abaikan */ } throw new Error('video terlalu besar untuk WA'); }
  let title = raw;
  try {
    const metaF = dir + h + '.json';
    if (fs.existsSync(metaF)) ({ title } = JSON.parse(fs.readFileSync(metaF, 'utf8')));
  } catch { /* pakai default */ }
  return { clip: final, title };
}
