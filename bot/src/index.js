import { startBot } from './wa/client.js';
import { handleMessage, parseCmd } from './wa/handler.js';
import { tryAnswer } from './commands/game.js';
import { rpgDigit } from './commands/rpgchat.js';
import { reloadDynamic } from './commands/index.js';
import { matchCase } from './core/dynamic.js';
import { startPanel } from './panel.js';

console.log('🚀 WA Bot Full starting...');
console.log(`🔌 Plugin dinamis: ${await reloadDynamic()} aktif`);

const ctx = {};
// Ketukan tombol/list interaktif -> aksi RPG.
const RPG_TAP = {
  'rpg:serang': ['serang', []], 'rpg:skill': ['skill', []], 'rpg:heal': ['heal', []], 'rpg:kabur': ['kabur', []],
  'rpg:utara': ['jalan', ['utara']], 'rpg:selatan': ['jalan', ['selatan']],
  'rpg:timur': ['jalan', ['timur']], 'rpg:barat': ['jalan', ['barat']],
  'chess:new': ['chess', ['new']], 'chess:hint': ['chess', ['hint']], 'chess:resign': ['chess', ['resign']],
};
const { sock, send, status } = await startBot(async (s, m, snd) => {
  ctx.sock = s;
  const jid = m.key.remoteJid;
  const sender = jid.endsWith('@g.us') ? (m.key.participant || jid) : jid;
  const { extractTap } = await import('./wa/polls.js');
  const tapId = extractTap(m);
  if (tapId && RPG_TAP[tapId]) {
    try {
      const { runRpgAction } = await import('./wa/rpgActions.js');
      const [cmd, args] = RPG_TAP[tapId];
      await runRpgAction(s, jid, sender, cmd, args, snd, m.pushName || 'teman');
      return;
    } catch (e) { console.log('⚠️ tap error:', e.message); }
  }
  const text =
    m.message?.conversation ||
    m.message?.extendedTextMessage?.text || '';
  if (text && !/^[!./]/.test(text.trim())) {
    const hit = await tryAnswer({ jid, sender, pushName: m.pushName || 'teman', text, send: snd }).catch(() => false);
    if (hit) return;
    // mode peta RPG: balas 1 angka / huruf arah
    const rpg = await rpgDigit({ jid, sender, pushName: m.pushName || 'teman', text, send: snd, sock: s }).catch(() => false);
    if (rpg) return;
    // case kustom (cocok sebagian, tanpa prefix)
    const c = matchCase(text.trim());
    if (c) { await snd(jid, c.response).catch(() => {}); return; }
  }
  await handleMessage({ sock: s }, m, snd);
});
ctx.sock = sock;
ctx.send = send;
ctx.status = status;
startPanel(() => ctx);

console.log('✅ Handler siap. Ketik !menu di WA.');
