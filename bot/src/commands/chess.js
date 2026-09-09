// Catur di chat: papan sebagai gambar tiap langkah, jalan pakai notasi.
// Mode: vs bot (greedy) atau hotseat grup. State di cache, skor ke !rank.
import { Chess } from 'chess.js';
import sharp from 'sharp';

// Palet ala plugin Danzz
const LIGHT = '#efe7d8', DARK = '#7c4a32', LAST = 'rgba(199,164,82,0.55)', CHECK = 'rgba(194,91,74,0.6)';
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
export const CHESS_BTNS = [
  { title: 'Baru', id: 'chess:new' },
  { title: 'Petunjuk', id: 'chess:hint' },
  { title: 'Menyerah', id: 'chess:resign' },
];

export async function renderBoard(chess) {
  const S = 60, W = S * 8;
  let cells = '';
  const board = chess.board();
  const last = chess.history({ verbose: true }).slice(-1)[0];
  const lastSq = last ? [last.from, last.to] : [];
  // kotak raja yang skak
  let checkSq = null;
  if (chess.inCheck()) {
    outer: for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === 'k' && p.color === chess.turn()) { checkSq = 'abcdefgh'[f] + (8 - r); break outer; }
    }
  }
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = 'abcdefgh'[f] + (8 - r);
    const base = (r + f) % 2 === 0 ? LIGHT : DARK;
    cells += `<rect x="${f * S}" y="${r * S}" width="${S}" height="${S}" fill="${base}"/>`;
    if (lastSq.includes(sq)) cells += `<rect x="${f * S}" y="${r * S}" width="${S}" height="${S}" fill="${LAST}"/>`;
    if (sq === checkSq) cells += `<rect x="${f * S}" y="${r * S}" width="${S}" height="${S}" fill="${CHECK}"/>`;
    const p = board[r][f];
    if (p) {
      const fill = p.color === 'w' ? '#f7f2e7' : '#1b120b';
      const stroke = p.color === 'w' ? '#1b120b' : '#f7f2e7';
      cells += `<text x="${f * S + S / 2}" y="${r * S + S - 8}" font-family="sans-serif" font-size="46" text-anchor="middle" fill="${fill}" stroke="${stroke}" stroke-width="1.2">${GLYPH[p.type]}</text>`;
    }
    if (f === 0) cells += `<text x="4" y="${r * S + 14}" font-family="sans-serif" font-size="11" fill="${(r + f) % 2 === 0 ? DARK : LIGHT}">${8 - r}</text>`;
    if (r === 7) cells += `<text x="${f * S + S - 12}" y="${r * S + S - 4}" font-family="sans-serif" font-size="11" fill="${(r + f) % 2 === 0 ? DARK : LIGHT}">${'abcdefgh'[f]}</text>`;
  }
  const svg = `<svg width="${W}" height="${W}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${W}" fill="${LIGHT}"/>${cells}<rect x="0" y="0" width="${W}" height="${W}" fill="none" stroke="#5e3722" stroke-width="6"/></svg>`;
  return sharp({ create: { width: W, height: W, channels: 3, background: LIGHT } })
    .composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 82 }).toBuffer();
}

function greedyMove(chess) {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;
  let best = null, bestScore = -1e9;
  for (const m of moves) {
    let s = (m.captured ? VAL[m.captured] * 10 : 0) + (m.promotion ? 9 : 0) + Math.random() * 2;
    // hindari melangkah ke petak diserang (kasar); undo wajib jalan via finally
    // agar papan tidak rusak bila evaluasi lempar error
    let moved = false;
    try {
      chess.move(m.san);
      moved = true;
      const danger = chess.isAttacked(m.to, chess.turn());
      if (danger) s -= VAL[m.piece] * 8;
    } catch { /* abaikan, pakai skor dasar */ }
    finally { if (moved) { try { chess.undo(); } catch { /* abaikan */ } } }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

// Langkah bot yang aman: greedy dulu, fallback langkah legal pertama.
function botMoveSafe(chess) {
  try {
    const bm = greedyMove(chess);
    if (bm) { chess.move(bm.san); return true; }
  } catch { /* jatuh ke fallback */ }
  try {
    const ms = chess.moves({ verbose: true });
    if (ms.length) { chess.move(ms[0].san); return true; }
  } catch { /* abaikan */ }
  return false;
}

const key = (jid) => `chess:${jid}`;
// duel: tantangan per target + game per pasangan + pointer per pemain
const ckey = (jid, target) => `chesschal:${jid}:${target}`;
const fkey = (jid, challenger) => `chesschalf:${jid}:${challenger}`;
const gkey = (jid, a, b) => `chessgame:${jid}:${[a, b].sort().join('|')}`;
const mykey = (jid, sender) => `chessmy:${jid}:${sender}`;

async function duelCleanup(cache, jid, st) {
  await cache.del(gkey(jid, st.white, st.black));
  await cache.del(mykey(jid, st.white));
  await cache.del(mykey(jid, st.black));
}

async function duelFinish(cache, db, jid, st, winner, reason) {
  const loser = winner === st.white ? st.black : st.white;
  const wname = winner.split('@')[0];
  await db.addXp(winner, wname, 80);
  await db.addScore(winner, 'chess', 40);
  await db.addXp(loser, loser.split('@')[0], 20);
  await db.addMatch({ jid, game: 'chess', p1: st.white, p2: st.black, winner });
  await duelCleanup(cache, jid, st);
  return `Duel selesai (${reason}). Pemenang: @${wname} (+80 XP, +40 poin).`;
}

export const chessCmd = [
  {
    name: 'chess', aliases: ['catur', 'c'], desc: '!chess new|duel @tag|jalan|resign (catur di chat)',
    async run({ jid, sender, pushName, args, send, sock, isGroup, m }) {
      const { cache, db } = await import('../core/store.js');
      const sub = (args[0] || '').toLowerCase();
      const show = async (chess, extra = '', interactive = true) => {
        if (interactive) {
          const { inlineGame, sendInlineWebUI } = await import('../wa/airich-send.js');
          const { createPlayToken } = await import('../core/playtoken.js');
          try {
            await sendInlineWebUI(sock, jid, await inlineGame('catur-inline.html', { token: await createPlayToken(sender) }), 'Catur');
            return;
          } catch (e) { console.log('ℹ️ catur inline gagal:', e.message); }
        }
        // fallback: gambar papan
        const { chessHtml } = await import('./chesshtml.js');
        const { aiRich } = await import('../wa/airich.js');
        const { webBase } = await import('../core/config.js');
        const { config } = await import('../core/config.js');
        let img;
        try {
          img = await aiRich(chessHtml(chess), { width: 640, height: 680 });
        } catch {
          img = await renderBoard(chess); // fallback sharp bila Chrome sibuk
        }
        let status = `Giliran: ${chess.turn() === 'w' ? 'Putih' : 'Hitam'}`;
        if (chess.isCheckmate()) status = `SKAKMAT. Pemenang: ${chess.turn() === 'w' ? 'Hitam' : 'Putih'}`;
        else if (chess.isStalemate()) status = 'Remis (stalemate).';
        else if (chess.isDraw()) status = 'Remis.';
        else if (chess.inCheck()) status += ' (SKAK).';
        const last = chess.history().slice(-1)[0];
        const caption = `*CATUR*${last ? ` — langkah: ${last}` : ''}\n${status}\n${extra}\nKetuk bidak di papan untuk jalan`;
        try {
          const { richBubble } = await import('../wa/rich.js');
          await richBubble(sock, jid, img, caption, CHESS_BTNS);
        } catch {
          await sock.sendMessage(jid, { image: img, caption });
        }
      };

      if (sub === 'new' || sub === 'mulai') {
        const mode = (args[1] || 'bot').toLowerCase() === '2p' ? 'hotseat' : 'bot';
        const chess = new Chess();
        await cache.set(key(jid), JSON.stringify({ fen: chess.fen(), mode, white: sender }), 3600);
        await show(chess, mode === 'bot'
          ? 'Kamu Putih, bot Hitam. Ketuk bidak di papan untuk jalan.'
          : 'Mode 2 pemain (main bareng satu layar). Putih jalan dulu, gantian ketuk.');
        return;
      }
      if (sub === 'resign' || sub === 'nyerah2') {
        // duel aktif milik pengirim? lawan menang otomatis
        const myg = await cache.get(mykey(jid, sender));
        if (myg) {
          const dst = JSON.parse(myg);
          const foe = sender === dst.white ? dst.black : dst.white;
          const t = await duelFinish(cache, db, jid, dst, foe, `@${sender.split('@')[0]} menyerah`);
          await sock.sendMessage(jid, { text: t, mentions: [dst.white, dst.black] });
          return;
        }
        await cache.del(key(jid));
        await send(jid, 'Permainan catur dihentikan.');
        return;
      }
      if (sub === 'hint' || sub === 'petunjuk') {
        const raw0 = await cache.get(key(jid));
        if (!raw0) return send(jid, 'Belum ada permainan. Mulai dengan !chess new');
        const chess0 = new Chess(JSON.parse(raw0).fen);
        if (chess0.isGameOver()) return send(jid, 'Permainan sudah selesai.');
        const bm = greedyMove(chess0);
        if (!bm) return send(jid, 'Tidak ada langkah.');
        return send(jid, `Petunjuk untuk ${chess0.turn() === 'w' ? 'Putih' : 'Hitam'}: ketik !chess ${bm.san}`);
      }
      if (sub === 'help' || sub === 'bantuan') {
        return send(jid, '*CATUR*\n!chess new — papan vs bot (ketuk bidak di papan)\n!chess new 2p — papan duel 2 pemain (main bareng satu layar)\n!chess duel @tag — tantang teman, terima dengan !terima\n!chess resign — berhenti\n!exit — keluar duel/game');
      }
      if (sub === 'duel') {
        if (!isGroup) return send(jid, 'Duel catur khusus grup.');
        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!target) return send(jid, 'Gunakan: !chess duel @teman');
        if (target === sender) return send(jid, 'Tidak bisa duel diri sendiri.');
        if (await cache.get(mykey(jid, sender))) return send(jid, 'Kamu masih punya duel berjalan.');
        if (await cache.get(mykey(jid, target))) return send(jid, 'Dia masih punya duel berjalan.');
        if (await cache.get(ckey(jid, target))) return send(jid, 'Dia masih punya tantangan lain.');
        if (await cache.get(fkey(jid, sender))) return send(jid, 'Kamu masih punya tantangan terkirim. Batalkan dengan !exit.');
        await cache.set(ckey(jid, target), JSON.stringify({ p1: sender, p2: target }), 300);
        await cache.set(fkey(jid, sender), JSON.stringify({ p1: sender, p2: target }), 300);
        await sock.sendMessage(jid, {
          text: `Tantangan catur untuk @${target.split('@')[0]} dari @${sender.split('@')[0]}. Balas !terima dalam 5 menit. Warna diacak.`,
          mentions: [sender, target],
        });
        return;
      }
      // duel aktif milik pengirim: semua langkah lewat papan duel HTML
      const myg = await cache.get(mykey(jid, sender));
      if (myg) {
        return send(jid, 'Duel berjalan di papan duel. Buka papan yang dikirim bot lalu ketuk bidak untuk jalan.');
      }
      const raw = await cache.get(key(jid));
      if (!raw) return send(jid, 'Belum ada permainan. Mulai dengan !chess new');
      // langkah hanya lewat papan HTML — bukan lewat balasan teks
      return send(jid, 'Buka papan catur yang dikirim bot lalu ketuk bidak untuk jalan. Ketik !chess new untuk papan baru.');
    },
  },
  {
    name: 'skorchess', aliases: ['skorcatur', 'chessrank'], desc: 'Papan skor catur',
    async run({ sender, send }) {
      const { db } = await import('../core/store.js');
      const rows = await db.topScoresByGame('chess', 10);
      if (!rows.length) return send('Belum ada skor catur. Mainkan !chess new atau duel dengan !chess duel @tag.');
      const mine = rows.find((r) => String(r.jid) === String(sender));
      await send('*SKOR CATUR*\n' + rows.map((r, i) => `${i + 1}. @${String(r.jid).split('@')[0]} — ${r.s} poin`).join('\n') +
        (mine ? `\n\nSkor kamu: ${mine.s} poin.` : ''));
    },
  },
  {
    name: 'exit', aliases: ['keluar', 'stop'], desc: 'Keluar dari duel/game catur aktif',
    async run({ jid, sender, send, sock }) {
      const { cache, db } = await import('../core/store.js');
      // duel aktif? lawan menang otomatis
      const myg = await cache.get(mykey(jid, sender));
      if (myg) {
        const dst = JSON.parse(myg);
        const foe = sender === dst.white ? dst.black : dst.white;
        const t = await duelFinish(cache, db, jid, dst, foe, `@${sender.split('@')[0]} keluar dari duel`);
        await sock.sendMessage(jid, { text: t, mentions: [dst.white, dst.black] });
        return;
      }
      // tantangan catur yang melibatkan pengirim (sebagai target maupun penantang)? batalkan
      const chal = await cache.get(ckey(jid, sender));
      if (chal) {
        await cache.del(ckey(jid, sender));
        await send(jid, 'Tantangan catur dibatalkan.');
        return;
      }
      const sentChal = await cache.get(fkey(jid, sender));
      if (sentChal) {
        const { p2 } = JSON.parse(sentChal);
        await cache.del(fkey(jid, sender));
        await cache.del(ckey(jid, p2));
        await send(jid, 'Tantangan catur yang kamu kirim dibatalkan.');
        return;
      }
      // game solo? hapus
      const raw = await cache.get(key(jid));
      if (raw) {
        await cache.del(key(jid));
        await send(jid, 'Permainan catur dihentikan.');
        return;
      }
      await send(jid, 'Tidak ada permainan catur yang sedang berjalan.');
    },
  },
];
