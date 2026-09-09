import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } from '@sairidev/baileys-new';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { config } from '../core/config.js';
import { enqueue } from '../core/queue.js';

export async function startBot(onMessage) {
  const status = { connected: false, user: null, qr: null, lastUpdate: Date.now() };
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['WA Bot Full', 'Chrome', '2.0'],
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    status.lastUpdate = Date.now();
    if (qr) {
      status.qr = qr;
      console.log('\n📱 Scan QR: WA > Perangkat Tertaut > Tautkan\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      status.connected = true;
      status.qr = null;
      status.user = sock.user?.id || null;
      console.log('✅ WA connected!');
      if (config.pairingNumber && !state.creds.registered) {
        try {
          const code = await sock.requestPairingCode(config.pairingNumber);
          console.log('🔑 Pairing code:', code);
        } catch (e) { console.log('⚠️ pairing gagal:', e.message); }
      }
    }
    if (connection === 'close') {
      status.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const logout = code === DisconnectReason.loggedOut;
      console.log('🔌 putus, code:', code, '| reconnect:', !logout);
      if (!logout) setTimeout(() => startBot(onMessage), 5000);
    }
  });

  const send = (jid, text, extra = {}) =>
    enqueue(jid, () => sock.sendMessage(jid, { text, ...extra }));

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      if (m.key.fromMe || !m.message) continue;
      try { await onMessage(sock, m, send); }
      catch (e) { console.log('⚠️ handler error:', e.message, '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')); }
    }
  });

  // Vote polling game -> aksi RPG (ketuk tanpa ketik)
  sock.ev.on('messages.update', async (updates) => {
    try {
      const { routePollVote } = await import('./polls.js');
      for (const { key, update } of updates) {
        if (!update?.pollUpdates?.length) continue;
        const jid = key.remoteJid;
        for (const pu of update.pollUpdates) {
          const pk = pu.pollUpdateMessageKey || {};
          if (pk.fromMe) continue;
          const voter = pk.participant || (key.remoteJid.endsWith('@g.us') ? null : key.remoteJid);
          if (!voter) continue;
          for (const opt of pu.vote?.selectedOptions || []) {
            try { await routePollVote(sock, jid, voter, key.id, opt.toString(), send); }
            catch (e) { console.log('⚠️ poll error:', e.message); }
          }
        }
      }
    } catch (e) { console.log('⚠️ poll update error:', e.message); }
  });

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    const { db } = await import('../core/store.js');
    if (db.group(id).welcome && (action === 'add' || action === 'remove')) {
      const names = participants.map((p) => '@' + p.split('@')[0]).join(' ');
      const txt = action === 'add' ? `Selamat datang ${names}. Ketik !menu untuk melihat perintah.` : `Sampai jumpa ${names}.`;
      await send(id, txt, { mentions: participants });
    }
  });

  return { sock, send, status, download: (m) => downloadMediaMessage(m, 'buffer', {}) };
}
