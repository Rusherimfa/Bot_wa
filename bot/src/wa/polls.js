// Kontrol game via POLLING WhatsApp (terbukti tampil & bisa diketuk semua client).
// Alur: kirim poll -> catat hash opsi -> vote masuk via messages.update -> jalankan aksi.
import { createHash } from 'crypto';

const sha = (s) => createHash('sha256').update(s).digest().toString();

// ===== Interaktif native (butuh @sairidev/baileys-new, via rich.js) =====
// Daftar pilihan single-select: semua opsi muat dalam 1 pesan.
export async function sendRpgList(sock, jid, inBattle) {
  const rows = inBattle
    ? [
        { title: 'Serang', id: 'rpg:serang', description: 'Serangan dasar' },
        { title: 'Skill', id: 'rpg:skill', description: 'Jurus class (pakai mana)' },
        { title: 'Heal', id: 'rpg:heal', description: 'Minum potion +50' },
        { title: 'Kabur', id: 'rpg:kabur', description: 'Lari (50%)' },
      ]
    : [
        { title: 'Utara', id: 'rpg:utara', description: '' },
        { title: 'Selatan', id: 'rpg:selatan', description: '' },
        { title: 'Timur', id: 'rpg:timur', description: '' },
        { title: 'Barat', id: 'rpg:barat', description: '' },
      ];
  const { richButtons } = await import('./rich.js');
  await richButtons(sock, jid, inBattle ? 'Pilih aksi' : 'Pilih arah jalan', rows);
  return true;
}

// Tombol URL besar; webview=true -> buka di webview dalam WA.
export async function sendUrlButton(sock, jid, text, label, url, footer = 'WA Bot Full') {
  const { richUrl } = await import('./rich.js');
  await richUrl(sock, jid, text, label, url, footer, true);
  return true;
}

// Ekstrak ketukan tombol/list interaktif dari pesan masuk. Return id / null.
export function extractTap(m) {
  const msg = m.message || {};
  const b = msg.buttonsResponseMessage?.selectedButtonId;
  if (b) return b;
  try {
    const raw = msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson || '';
    if (raw) {
      const p = JSON.parse(raw);
      if (p?.id) return p.id;
      // single_select mengembalikan struktur lain -> cari pola id rpg:*
      const found = raw.match(/rpg:[a-z]+/);
      if (found) return found[0];
    }
  } catch { /* abaikan */ }
  const r = msg.listResponseMessage?.singleSelectReply?.selectedRowId;
  if (r) return r;
  const t = msg.templateButtonReplyMessage?.selectedId;
  if (t) return t;
  return null;
}

const POLL_BATTLE = [
  { label: 'Serang', cmd: 'serang', args: [] },
  { label: 'Skill', cmd: 'skill', args: [] },
  { label: 'Heal', cmd: 'heal', args: [] },
  { label: 'Kabur', cmd: 'kabur', args: [] },
];
const POLL_MAP = [
  { label: 'Utara', cmd: 'jalan', args: ['utara'] },
  { label: 'Selatan', cmd: 'jalan', args: ['selatan'] },
  { label: 'Timur', cmd: 'jalan', args: ['timur'] },
  { label: 'Barat', cmd: 'jalan', args: ['barat'] },
];

export async function sendRpgPoll(sock, jid, inBattle) {
  const opts = inBattle ? POLL_BATTLE : POLL_MAP;
  const title = inBattle ? 'Pilih aksi' : 'Pilih arah jalan';
  const sent = await sock.sendMessage(jid, {
    poll: { name: title, values: opts.map((o) => o.label), selectableCount: 1 },
  });
  const map = {};
  for (const o of opts) map[sha(o.label)] = { cmd: o.cmd, args: o.args };
  const { cache } = await import('../core/store.js');
  await cache.set(`poll:${sent.key.id}`, JSON.stringify(map), 600);
  return sent.key.id;
}

// Dipanggil dari messages.update. Return true bila vote diproses.
export async function routePollVote(sock, jid, voter, pollId, optHash, send) {
  const { cache } = await import('../core/store.js');
  const raw = await cache.get(`poll:${pollId}`);
  if (!raw) return false;
  const action = JSON.parse(raw)[String(optHash)];
  if (!action) return false;
  const now = Date.now();
  const cdKey = `pollcd:${pollId}:${voter}`;
  const last = await cache.get(cdKey);
  if (last && now - Number(last) < 2500) return true; // tahan spam, anggap diproses
  await cache.set(cdKey, String(now), 30);
  const { runRpgAction } = await import('./rpgActions.js');
  await runRpgAction(sock, jid, voter, action.cmd, action.args, send);
  return true;
}
