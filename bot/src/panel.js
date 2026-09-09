// Mini REST API lokal untuk panel Laravel. BUKAN publik — hanya localhost + API key.
// GET  /wa/status -> { connected, user, qrAvailable }
// GET  /wa/qr     -> PNG QR (404 bila tidak ada / sudah connect)
// POST /wa/send   -> { jid, text } header x-api-key
import express from 'express';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { config, webBase } from './core/config.js';

// Jalankan perintah sistem dengan timeout, tanpa shell (anti-injection).
// Mengembalikan stdout string atau '' bila gagal.
function sh(cmd, args, timeout = 2500) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 512 * 1024 }, (err, stdout) => {
      resolve(err ? '' : String(stdout || ''));
    });
  });
}

let prevCpu = null;
function cpuUsage() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const c of cpus) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  const cur = { idle, total, at: Date.now() };
  let pct = null;
  if (prevCpu && cur.total > prevCpu.total) {
    const dt = cur.total - prevCpu.total, di = cur.idle - prevCpu.idle;
    pct = Math.max(0, Math.min(100, (1 - di / dt) * 100));
  }
  prevCpu = cur;
  return pct;
}

let prevNet = null;
async function netStat() {
  try {
    const { readFile } = await import('node:fs/promises');
    const txt = await readFile('/proc/net/dev', 'utf8');
    // pilih iface fisik aktif (bukan lo/docker)
    let best = null;
    for (const line of txt.split('\n')) {
      const m = line.trim().match(/^([a-z0-9]+):\s*(.+)$/i);
      if (!m) continue;
      const name = m[1];
      if (/^(lo|docker|veth|br-|virbr)/.test(name)) continue;
      const f = m[2].trim().split(/\s+/).map(Number);
      const rx = f[0], tx = f[8];
      if (rx == null || tx == null || Number.isNaN(rx)) continue;
      if (!best || rx + tx > best.rx + best.tx) best = { iface: name, rx, tx };
    }
    const cur = best || { iface: '-', rx: 0, tx: 0 };
    // rate dihitung SERVER (bukan di browser) agar jalan walau fetch WebView diblokir
    let rxRate = null, txRate = null;
    if (prevNet && prevNet.iface === cur.iface && cur.rx >= prevNet.rx) {
      const dt = Math.max(0.5, (Date.now() - prevNet.at) / 1000);
      rxRate = (cur.rx - prevNet.rx) / dt;
      txRate = (cur.tx - prevNet.tx) / dt;
    }
    prevNet = { ...cur, at: Date.now() };
    return { ...cur, rxRate, txRate };
  } catch {
    return { iface: '-', rx: 0, tx: 0, rxRate: null, txRate: null };
  }
}

// HTML monitor siap kirim: API absolut + snapshot statistik dibake server.
// Dipakai oleh route /monitor dan perintah !monitor (inline bubble WA).
export async function monitorHtml() {
  const fs = await import('node:fs/promises');
  let html = await fs.readFile(new URL('./web/monitor.html', import.meta.url), 'utf8');
  const base = (config.webPublic || webBase()).replace(/\/$/, '');
  html = html.split(`'api/monitor/`).join(`'${base}/api/monitor/`);
  html = html.replace(/new URLSearchParams\(location\.search\)\.get\('key'\)\s*\|\|\s*''/g, `'${config.panelKey}'`);
  try {
    // pemanasan: fetch pertama mengisi sampel CPU/net di server, fetch kedua yang dibake
    try { await fetch(`http://127.0.0.1:${config.panelPort}/api/monitor/stats?key=${config.panelKey}`, { signal: AbortSignal.timeout(8000) }); } catch {}
    await new Promise((r) => setTimeout(r, 1100));
    const r = await fetch(`http://127.0.0.1:${config.panelPort}/api/monitor/stats?key=${config.panelKey}`, { signal: AbortSignal.timeout(8000) });
    const safe = JSON.stringify(await r.json()).replace(/</g, '\\u003c');
    html = html.split('__SNAPSHOT__').join(safe);
  } catch {
    html = html.split('__SNAPSHOT__').join('null');
  }
  // Hasil nettest server dibake juga (cache 60 dtk di endpoint) agar tombol
  // speedtest tetap menampilkan angka walau fetch dari WebView diblokir.
  try {
    const r = await fetch(`http://127.0.0.1:${config.panelPort}/api/monitor/nettest?key=${config.panelKey}`, { signal: AbortSignal.timeout(15000) });
    const safe = JSON.stringify(await r.json()).replace(/</g, '\\u003c');
    html = html.split('__NETTEST__').join(safe);
  } catch {
    html = html.split('__NETTEST__').join('null');
  }
  return { html, base };
}

export function startPanel(getCtx) {
  if (!config.panelKey) {
    console.log('⚠️ PANEL_API_KEY kosong — panel API nonaktif.');
    return null;
  }
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  // CORS untuk submit skor dari webview WA / browser mana pun (auth tetap via key di body)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });
  // /wa/* hanya localhost. Halaman game + skor pakai key (bisa dibuka HP satu jaringan).
  const localOnly = (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    if (!/127\.0\.0\.1|::1|::ffff:127/.test(ip)) return res.status(403).json({ error: 'localhost only' });
    next();
  };
  const auth = (req, res, next) => {
    if (req.headers['x-api-key'] !== config.panelKey) return res.status(401).json({ error: 'bad key' });
    next();
  };
  const webKey = (req) => req.query.key === config.panelKey;

  app.get('/wa/status', localOnly, auth, (req, res) => {
    const { status } = getCtx();
    res.json({ connected: status.connected, user: status.user, qrAvailable: !!status.qr, at: status.lastUpdate });
  });

  app.get('/wa/qr', localOnly, auth, async (req, res) => {
    const { status } = getCtx();
    if (!status.qr) return res.status(404).json({ error: 'no qr (sudah connect?)' });
    try {
      const { default: QR } = await import('qrcode');
      const png = await QR.toBuffer(status.qr, { width: 300, margin: 1 });
      res.type('png').send(png);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/wa/send', localOnly, auth, async (req, res) => {
    const { jid, text } = req.body || {};
    if (!jid || !text) return res.status(400).json({ error: 'jid + text wajib' });
    try {
      await getCtx().send(jid, String(text).slice(0, 2000));
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Game web ringan (dibuka dari HP satu jaringan / tunnel, kunci via ?key=)
  const webGame = (file) => (req, res) => {
    if (!webKey(req)) return res.status(401).send('butuh ?key=PANEL_API_KEY');
    res.sendFile(new URL('./web/' + file, import.meta.url).pathname);
  };
  app.get('/snake', webGame('snake.html'));
  app.get('/kuiz', webGame('kuiz.html'));
  app.get('/catur', webGame('catur.html'));
  app.get('/rpggame', webGame('rpggame.html'));
  app.get('/bubble', webGame('bubble.html'));
  // Monitor: snapshot dibake server + API absolut, agar data tampil
  // walau WebView WA memblokir fetch (dipakai route /monitor & !monitor).
  app.get('/monitor', async (req, res) => {
    if (!webKey(req)) return res.status(401).send('butuh ?key=PANEL_API_KEY');
    const { html } = await monitorHtml();
    res.type('html').send(html);
  });

  // --- Monitor server (laptop jadi server): semua butuh ?key=PANEL_API_KEY ---
  const monKey = (req, res, next) => {
    const k = req.query.key || req.headers['x-api-key'];
    if (k !== config.panelKey) {
      console.log(`[monitor] 401 ${req.path} ip=${req.ip}`);
      return res.status(401).json({ error: 'bad key' });
    }
    console.log(`[monitor] HIT ${req.path} ip=${req.ip} ua=${String(req.headers['user-agent'] || '').slice(0, 70)}`);
    next();
  };

  // Latency check ringan untuk speedtest
  app.get('/api/monitor/ping', monKey, (req, res) => {
    res.json({ t: Date.now() });
  });

  // Speedtest sisi SERVER (internet laptop): ping 1.1.1.1 + download CDN.
  // Hasil di-cache 60 detik. Ini selalu jalan walau WebView blokir fetch client.
  let netCache = null;
  app.get('/api/monitor/nettest', monKey, async (req, res) => {
    try {
      if (netCache && Date.now() - netCache.at < 60000) return res.json(netCache.data);
      const pingOut = await sh('ping', ['-c', '3', '-W', '2', '1.1.1.1'], 12000);
      const pm = pingOut.match(/rtt min\/avg\/max\/mdev = [\d.]+\/([\d.]+)/);
      const url = 'https://speed.cloudflare.com/__down?bytes=8000000';
      const d0 = Date.now();
      const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
      const buf = Buffer.from(await r.arrayBuffer());
      const dt = Math.max(0.1, (Date.now() - d0) / 1000);
      const data = {
        pingMs: pm ? Number(pm[1]) : null,
        downMBs: buf.length / 1048576 / dt,
        bytes: buf.length, secs: Math.round(dt * 10) / 10,
        via: 'speed.cloudflare.com', at: Date.now(),
      };
      netCache = { at: Date.now(), data };
      res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Blob bytes acak untuk ukur throughput download (max 5MB)
  app.get('/api/monitor/blob', monKey, async (req, res) => {
    const size = Math.max(1024, Math.min(5 * 1024 * 1024, Math.floor(Number(req.query.size) || 2 * 1024 * 1024)));
    const { randomBytes } = await import('node:crypto');
    res.type('application/octet-stream').send(randomBytes(size));
  });

  // Statistik lengkap: CPU/GPU/RAM/disk/net/service
  app.get('/api/monitor/stats', monKey, async (req, res) => {
    try {
      const usage = cpuUsage();
      const cpus = os.cpus();
      const [df, smi, vga, svc, temp] = await Promise.all([
        sh('df', ['-B1', '--output=target,size,used,avail,pcent', '/']),
        sh('nvidia-smi', ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits']),
        sh('lspci', []),
        sh('systemctl', ['--user', 'is-active', 'wa-bot', 'wa-arena', 'wa-panel', 'wa-sched', 'wa-nginx']),
        sh('cat', ['/sys/class/thermal/thermal_zone0/temp']),
      ]);
      // disk: baris ke-2 (baris-1 header)
      const disk = {};
      const dl = df.trim().split('\n')[1];
      if (dl) {
        const p = dl.trim().split(/\s+/);
        disk.size = Number(p[1]) || 0; disk.used = Number(p[2]) || 0;
        disk.avail = Number(p[3]) || 0; disk.pcent = p[4] || '0%';
      }
      // gpu: baris nvidia-smi + daftar VGA lain (mis. iGPU AMD)
      const gpus = [];
      for (const line of smi.trim().split('\n')) {
        const p = line.split(',').map((s) => s.trim());
        if (p.length >= 5 && p[0]) {
          gpus.push({
            name: p[0],
            util: Number(p[1]) || 0,
            memUsed: (Number(p[2]) || 0) * 1024 * 1024,
            memTotal: (Number(p[3]) || 0) * 1024 * 1024,
            temp: Number(p[4]) || null,
          });
        }
      }
      for (const line of vga.split('\n')) {
        const m = line.match(/VGA compatible controller:\s*(.+?)\s*\(rev/i) || line.match(/VGA compatible controller:\s*(.+)/i);
        if (m && !/nvidia/i.test(m[1])) gpus.push({ name: m[1].trim() + ' (iGPU)', util: null, memUsed: null, memTotal: null, temp: null });
      }
      const names = ['wa-bot', 'wa-arena', 'wa-panel', 'wa-sched', 'wa-nginx'];
      const states = svc.trim().split('\n');
      const services = {};
      names.forEach((n, i) => { services[n] = (states[i] || 'unknown').trim(); });
      const net = await netStat();
      const { status } = getCtx();
      let db = 'json';
      try {
        if (process.env.DATABASE_URL) {
          const { default: Pg } = await import('pg');
          const pool = new Pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1500 });
          await pool.query('SELECT 1');
          await pool.end();
          db = 'postgres-ok';
        }
      } catch { db = 'postgres-down'; }
      res.json({
        host: os.hostname(),
        uptime: os.uptime(),
        cpuModel: (cpus[0]?.model || '').replace(/\s+/g, ' ').trim(),
        cpuCores: cpus.length,
        cpu: { usage, load1: os.loadavg()[0], load5: os.loadavg()[1], load15: os.loadavg()[2] },
        mem: { total: os.totalmem(), free: os.freemem(), used: os.totalmem() - os.freemem() },
        swap: { total: 0, free: 0 },
        gpus,
        cpuTemp: temp ? Math.round(Number(temp.trim()) / 1000) : null,
        disk,
        net,
        services,
        info: {
          node: process.version,
          botUp: process.uptime(),
          wa: status.connected ? `connected (${status.user || ''})` : 'offline',
          db,
          time: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }) + ' WITA',
        },
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Musik hasil !spotify (mp3 60 detik). Auth via ?key= agar bisa dibuka
  // dari WebView WA / HP satu jaringan / tunnel. Validasi hash anti-traversal.
  app.get('/music/:h', (req, res) => {
    const ok = webKey(req);
    console.log(`[music] h=${req.params.h} key=${ok ? 'ok' : 'SALAH/HILANG'} range=${req.headers.range || '-'} ua=${String(req.headers['user-agent'] || '').slice(0, 60)}`);
    if (!ok) return res.status(401).send('butuh ?key=PANEL_API_KEY');
    const h = String(req.params.h || '').replace(/\.mp3$/, '');
    if (!/^[a-f0-9]{12}$/i.test(h)) return res.status(400).send('hash tidak valid');
    res.sendFile(new URL('../data/music/' + h + '.mp3', import.meta.url).pathname, {
      headers: { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' },
    }, (err) => { if (err && !res.headersSent) res.status(404).send('musik tidak ditemukan'); });
  });

  // Cover lagu !spotify (jpg 480px). Auth + validasi sama seperti /music.
  app.get('/cover/:h', (req, res) => {
    const ok = webKey(req);
    console.log(`[cover] h=${req.params.h} key=${ok ? 'ok' : 'SALAH/HILANG'} ua=${String(req.headers['user-agent'] || '').slice(0, 60)}`);
    if (!ok) return res.status(401).send('butuh ?key=PANEL_API_KEY');
    const h = String(req.params.h || '').replace(/\.jpg$/, '');
    if (!/^[a-f0-9]{12}$/i.test(h)) return res.status(400).send('hash tidak valid');
    res.sendFile(new URL('../data/music/' + h + '.jpg', import.meta.url).pathname, {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
    }, (err) => { if (err && !res.headersSent) res.status(404).send('cover tidak ditemukan'); });
  });
  // Terima skor dari game web -> masuk !rank. Batas anti-cheat per submit.
  // Identitas via token (otomatis dari chat) atau nomor manual (kompatibel lama).
  const MAX_SCORE = { snake: 100, kuiz: 100, chess: 40, rpgpvp: 100, rpghtml: 100, bubble: 100 };
  app.post('/api/wa/score', async (req, res) => {
    const { key, nomor, token, game, points } = req.body || {};
    if (key !== config.panelKey) return res.status(401).json({ error: 'bad key' });
    if (!MAX_SCORE[game]) return res.status(400).json({ error: 'game tidak dikenal' });
    let jid = null, name = null;
    if (token) {
      const { resolvePlayToken } = await import('./core/playtoken.js');
      jid = await resolvePlayToken(token);
      if (!jid) return res.status(403).json({ error: 'token kedaluwarsa, minta link baru dari chat' });
      name = jid.split('@')[0];
    } else {
      const digits = String(nomor || '').replace(/\D/g, '').replace(/^0/, '');
      if (digits.length < 9) return res.status(400).json({ error: 'nomor WA tidak valid' });
      jid = (digits.startsWith('62') ? digits : '62' + digits) + '@s.whatsapp.net';
      name = String(nomor);
    }
    const pts = Math.max(0, Math.min(MAX_SCORE[game], Math.floor(Number(points) || 0)));
    try {
      const { db } = await import('./core/store.js');
      await db.addScore(jid, game, pts);
      await db.addXp(jid, name, 10);
      res.json({ ok: true, points: pts });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.listen(config.panelPort, '0.0.0.0', () =>
    console.log(`Panel API: http://127.0.0.1:${config.panelPort}/wa/status (LAN: ${config.publicBase}:${config.panelPort})`))
    .on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.log(`⚠️ Port ${config.panelPort} sudah dipakai — kemungkinan bot sudah jalan di terminal lain. Matikan dulu (~/projects/stop.sh) lalu ulangi.`);
        process.exit(1);
      }
      throw e;
    });
  return app;
}
