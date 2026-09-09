import { config } from '../core/config.js';
import { allCommands } from '../commands/index.js';

const cooldown = new Map();
const COOLDOWN_MS = 1500;

export function parseCmd(text) {
  const prefix = config.prefixes.find((p) => text.startsWith(p));
  if (!prefix) return null;
  const body = text.slice(prefix.length).trim();
  if (!body) return null;
  const [raw, ...args] = body.split(/\s+/);
  return { cmd: raw.toLowerCase(), args, text: args.join(' ') };
}

export async function handleMessage(ctx, m, send) {
  const { sock } = ctx;
  const jid = m.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  const sender = isGroup ? (m.key.participant || jid) : jid;
  const pushName = m.pushName || sender.split('@')[0];
  const text =
    m.message?.conversation ||
    m.message?.extendedTextMessage?.text ||
    m.message?.imageMessage?.caption ||
    m.message?.videoMessage?.caption || '';
  const t = (text || '').trim();

  // Antilink (grup): hapus pesan berisi link jika aktif
  if (isGroup && /https?:\/\/|wa\.me\//i.test(t)) {
    const { db } = await import('../core/store.js');
    if (db.group(jid).antilink && !t.startsWith('!')) {
      try {
        const meta = await sock.groupMetadata(jid);
        const me = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const isAdmin = meta.participants.find((p) => p.id === sender)?.admin;
        const botAdmin = meta.participants.find((p) => p.id === me)?.admin;
        if (!isAdmin && botAdmin) {
          await sock.sendMessage(jid, { delete: m.key });
          return;
        }
      } catch {}
    }
  }

  const parsed = parseCmd(t);
  if (!parsed) return;
  const { cmd, args } = parsed;

  // cooldown anti-spam
  const key = sender + ':' + cmd;
  if (Date.now() - (cooldown.get(key) || 0) < COOLDOWN_MS) return;
  cooldown.set(key, Date.now());

  const found = allCommands.find((c) => c.name === cmd || (c.aliases || []).includes(cmd));
  if (!found) return;

  if (found.ownerOnly) {
    const { isOwner } = await import('../core/owners.js');
    if (!isOwner(sender)) { console.log(`[owner-deny] cmd=${cmd} sender=${sender} jid=${jid}`); await send(jid, 'Perintah ini khusus owner.'); return; }
  }
  if (found.groupOnly && !isGroup) { await send(jid, 'Perintah ini khusus grup.'); return; }
  if (found.adminOnly && isGroup) {
    try {
      const meta = await sock.groupMetadata(jid);
      const p = meta.participants.find((x) => x.id === sender);
      if (!p?.admin) { await send(jid, 'Perintah ini khusus admin grup.'); return; }
    } catch {}
  }

  // send fleksibel: send(teks) -> balas ke chat ini; send(jid, teks, extra) -> kirim bebas.
  // Mencegah Baileys crash (extractUrlFromText(undefined)) bila command lupa jid.
  const reply = (a, b, extra = {}) => (b === undefined ? send(jid, a, extra) : send(a, b, extra));
  const helpers = { jid, sender, pushName, isGroup, args, raw: parsed.text, m, sock, send: reply };
  await found.run(helpers);
}
