// Mini REST API lokal untuk panel Laravel. BUKAN publik — hanya localhost + API key.
// GET  /wa/status -> { connected, user, qrAvailable }
// GET  /wa/qr     -> PNG QR (404 bila tidak ada / sudah connect)
// POST /wa/send   -> { jid, text } header x-api-key
import express from 'express';
import { config } from './core/config.js';

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
  const MAX_SCORE = { snake: 100, kuiz: 100, chess: 40, rpgpvp: 100, rpghtml: 100 };
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
