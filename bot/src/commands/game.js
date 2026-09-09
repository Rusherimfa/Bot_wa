// Game teks + RPG ringan. State di cache (Redis/memory), skor di db.
const TEBAK = [
  ['Buah berwarna merah, ada bijinya, namanya mirip merek HP terkenal?', 'apel'],
  ['Hewan dijuluki raja hutan?', 'singa'],
  ['Salat lima waktu termasuk rukun Islam keberapa?', 'dua'],
  ['Hewan berbelalai panjang?', 'gajah'],
];
const FAM = [{ q: 'Sebutkan buah berwarna merah?', a: ['apel', 'stroberi', 'semangka'] }];
const CAK = [['Benda apa yang makin dipotong makin panjang?', 'lubang']];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Animasi: kirim 1 pesan lalu edit beruntun (langsung via sock agar ritme pas).
async function animate(sock, jid, frames, stepMs = 650) {
  const first = await sock.sendMessage(jid, { text: frames[0] });
  for (let i = 1; i < frames.length; i++) {
    await sleep(stepMs);
    await sock.sendMessage(jid, { text: frames[i], edit: first.key });
  }
  return first.key;
}

export const game = [
  {
    name: 'game', aliases: ['games'], desc: 'List game',
    async run({ send }) {
      await send(`*GAME*
!tebakgambar, !tebakkata, !caklontong, !family100, !math, !tebakangka, !slot, !dadu, !suit (tanpa tag = lawan bot), !tictactoe @tag, !rpg, !daily, !inv, !rank
Jawab langsung tanpa prefix. !hint untuk bocoran, !nyerah untuk menyerah.`);
    },
  },
  {
    name: 'tebakgambar', aliases: ['tebakkata', 'caklontong'], desc: 'Kuis kata',
    async run({ jid, sender, send }) {
      const { cache } = await import('../core/store.js');
      const [q, a] = pick(TEBAK);
      await cache.set(`quiz:${jid}:${sender}`, a.toLowerCase(), 120);
      await send(jid, `*KUIS*\n${q}\nWaktu 120 detik, jawab langsung.`);
    },
  },
  {
    name: 'family100', desc: 'Family100',
    async run({ jid, sender, send }) {
      const { cache } = await import('../core/store.js');
      const f = pick(FAM);
      await cache.set(`quiz:${jid}:${sender}`, f.a[0], 120);
      await send(jid, `*FAMILY 100*\n${f.q}\nAda ${f.a.length} kemungkinan jawaban.`);
    },
  },
  {
    name: 'math', desc: '!math (duel cepat)',
    async run({ jid, sender, send }) {
      const { cache } = await import('../core/store.js');
      const a = 1 + Math.floor(Math.random() * 20), b = 1 + Math.floor(Math.random() * 20);
      await cache.set(`quiz:${jid}:${sender}`, String(a + b), 60);
      await send(jid, `*MATEMATIKA*\nBerapa ${a} + ${b}?\nWaktu 60 detik.`);
    },
  },
  {
    name: 'tebakangka', desc: 'Tebak 1-10',
    async run({ jid, sender, send }) {
      const { cache } = await import('../core/store.js');
      const n = 1 + Math.floor(Math.random() * 10);
      await cache.set(`quiz:${jid}:${sender}`, String(n), 60);
      await send(jid, `*TEBAK ANGKA*\nSaya memikirkan angka 1-10. Tebak.`);
    },
  },
  {
    name: 'slot', aliases: ['slots', 'mesinslot'], desc: 'Mesin slot 3x3 langsung di chat',
    async run({ jid, sender, pushName, send, sock }) {
      // Utama: UI bubble (mesin beneran). Gagal → animasi teks lawas.
      try {
        const { inlineGame, sendInlineWebUI } = await import('../wa/airich-send.js');
        const { createPlayToken } = await import('../core/playtoken.js');
        await sendInlineWebUI(sock, jid, await inlineGame('slot.html', { token: await createPlayToken(sender) }), 'Mesin Slot');
        await send(jid, 'Mesin slot terkirim di atas 🎰. Atur taruhan, SPIN, klaim koin jadi !rank.');
        return;
      } catch (e) {
        const { db } = await import('../core/store.js');
        const em = ['7', 'BAR', 'STAR'];
        const fin = [pick(em), pick(em), pick(em)];
        const frames = [`*SLOT*\n[ ? | ? | ? ]\nMemutar...`];
        for (let i = 0; i < 3; i++)
          frames.push(`*SLOT*\n[ ${pick(em)} | ${pick(em)} | ${pick(em)} ]\nMemutar...`);
        const win = fin[0] === fin[1] && fin[1] === fin[2];
        frames.push(`*SLOT*\n[ ${fin.join(' | ')} ]\n${win ? 'JACKPOT. +50 poin.' : 'Belum beruntung. +5 XP.'}`);
        await animate(sock, jid, frames, 600);
        if (win) await db.addScore(sender, 'slot', 50);
        await db.addXp(sender, pushName, win ? 50 : 5);
      }
    },
  },
  {
    name: 'dadu', desc: 'Kocok dadu',
    async run({ jid, send, sock }) {
      const faces = ['1', '2', '3', '4', '5', '6'];
      const fin = pick(faces);
      await animate(sock, jid, [
        `Melempar dadu...`,
        `Dadu berputar: ${pick(faces)}`,
        `Dadu berputar: ${pick(faces)}`,
        `Hasil dadu: *${fin}*`,
      ], 550);
    },
  },
  {
    name: 'suit', desc: 'Suit gunting-batu-kertas, tanpa tag = lawan bot',
    async run({ jid, sender, pushName, m, send, sock }) {
      const { cache, db } = await import('../core/store.js');
      const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) {
        // Lawan bot, dengan animasi hitung mundur
        const hands = ['gunting', 'batu', 'kertas'];
        const bot = pick(hands);
        await animate(sock, jid, [
          `Suit melawan bot. Siapkan pilihanmu...`,
          `Suit... 3`,
          `Suit... 2`,
          `Suit... 1`,
          `Bot keluar: *${bot}*. Balas dengan gunting, batu, atau kertas.`,
        ], 600);
        await cache.set(`suitbot:${jid}:${sender}`, bot, 60);
        return;
      }
      await cache.set(`suit:${jid}`, JSON.stringify({ p1: sender, p2: target, c1: null, c2: null }), 120);
      await send(jid, `Suit dimulai. Kirim pilihan: gunting, batu, atau kertas.`, { mentions: [sender, target] });
    },
  },
  {
    name: 'tictactoe', aliases: ['ttc'], desc: 'TicTacToe melawan teman (!tictactoe @tag)',
    async run({ jid, sender, m, send }) {
      const { cache } = await import('../core/store.js');
      const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) return send(jid, 'Gunakan: !tictactoe @teman');
      await cache.set(`ttc:${jid}`, JSON.stringify({ board: Array(9).fill(' '), p: [sender, target], turn: 0 }), 180);
      await send(jid, `TicTacToe dimulai.\nKetik !langkah 1-9\n1 2 3\n4 5 6\n7 8 9`, { mentions: [sender, target] });
    },
  },
  {
    name: 'rpg', desc: 'RPG: !rpg hunt | !inv | !daily',
    async run({ jid, sender, pushName, args, send, sock }) {
      const { db, cache } = await import('../core/store.js');
      const sub = (args[0] || 'hunt').toLowerCase();
      if (sub === 'daily') {
        const last = await cache.get(`daily:${sender}`);
        if (last) return send(jid, 'Hadiah harian sudah diklaim. Kembali besok.');
        await cache.set(`daily:${sender}`, '1', 86400);
        await db.addXp(sender, pushName, 100); await db.addScore(sender, 'daily', 20);
        return send(jid, 'Hadiah harian: +100 XP, +20 poin.');
      }
      if (sub === 'inv') {
        const u = await db.addXp(sender, pushName, 0);
        return send(jid, `*${pushName}*\nLevel ${u.level} | XP ${u.xp}`);
      }
      const win = Math.random() > 0.35;
      const xp = win ? 20 + Math.floor(Math.random() * 40) : 5;
      const monster = pick(['Goblin', 'Serigala Hutan', 'Bandit', 'Golem Batu']);
      await animate(sock, jid, [
        `Berburu di hutan...`,
        `Seekor *${monster}* muncul.`,
        `Bertarung...`,
        win ? `*MENANG* melawan ${monster}. +${xp} XP.` : `Kalah dari ${monster}. +${xp} XP hiburan.`,
      ], 700);
      await db.addXp(sender, pushName, xp);
      if (win) await db.addScore(sender, 'rpg', 10);
    },
  },
  { name: 'daily', desc: 'Klaim hadiah harian', async run(h) { h.args = ['daily']; await game.find((c) => c.name === 'rpg').run(h); } },
  { name: 'inv', desc: 'Lihat level dan XP', async run(h) { h.args = ['inv']; await game.find((c) => c.name === 'rpg').run(h); } },
  {
    name: 'rank', aliases: ['leaderboard'], desc: 'Peringkat global',
    async run({ send }) {
      const { db } = await import('../core/store.js');
      const top = await db.topScores(10);
      if (!top.length) return send('Belum ada skor. Mainkan !slot atau !rpg dulu.');
      await send('*LEADERBOARD*\n' + top.map((r, i) => `${i + 1}. @${String(r.jid).split('@')[0]} - ${r.s} poin`).join('\n'));
    },
  },
  {
    name: 'hint', desc: 'Bocoran jawaban', async run({ jid, sender, send }) {
      const { cache } = await import('../core/store.js');
      const a = await cache.get(`quiz:${jid}:${sender}`);
      if (!a) return send(jid, 'Tidak ada kuis aktif.');
      await send(jid, `Bocoran: berawalan "${a[0]}", ${a.length} huruf.`);
    },
  },
  {
    name: 'nyerah', aliases: ['giveup'], desc: 'Menyerah kuis', async run({ jid, sender, send }) {
      const { cache } = await import('../core/store.js');
      const a = await cache.get(`quiz:${jid}:${sender}`);
      if (!a) return send(jid, 'Tidak ada kuis aktif.');
      await cache.del(`quiz:${jid}:${sender}`);
      await send(jid, `Jawabannya: *${a}*`);
    },
  },
  // Jawaban langsung (dipanggil dari index.js bila bukan command)
  {
    name: '__answer__', async run() {},
  },
];

// Dipakai index.js untuk cek jawaban kuis/suit/ttc yang diketik tanpa prefix
export async function tryAnswer({ jid, sender, pushName, text, send }) {
  const { cache, db } = await import('../core/store.js');
  const t = text.trim().toLowerCase();
  // 0. suit melawan bot
  const bot = await cache.get(`suitbot:${jid}:${sender}`);
  if (bot && ['gunting', 'batu', 'kertas'].includes(t)) {
    await cache.del(`suitbot:${jid}:${sender}`);
    const beats = { gunting: 'kertas', batu: 'gunting', kertas: 'batu' };
    if (t === bot) { await send(jid, `Seri. Sama-sama ${bot}.`); }
    else if (beats[t] === bot) {
      await db.addScore(sender, 'suit', 15); await db.addXp(sender, pushName, 20);
      await send(jid, `Kamu menang. ${t} mengalahkan ${bot}. +15 poin.`);
    } else {
      await send(jid, `Kamu kalah. ${bot} mengalahkan ${t}.`);
    }
    return true;
  }
  // 1. kuis
  const quizKey = `quiz:${jid}:${sender}`;
  const ans = await cache.get(quizKey);
  if (ans && t.length < 30) {
    if (t === ans.toLowerCase()) {
      await cache.del(quizKey);
      await db.addScore(sender, 'quiz', 20); await db.addXp(sender, pushName, 30);
      await send(jid, `Benar. +20 poin, +30 XP.`);
    } else if (['hint'].includes(t)) return false;
    else if (t === ans.slice(0, 2).toLowerCase()) { /* hampir */ }
    return true;
  }
  return false;
}
