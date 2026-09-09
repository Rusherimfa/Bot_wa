// RPG Chat — petualangan + duel PvP turn-based, 100% di dalam chat WA.
// State di cache (hilang bila bot restart), XP permanen di Postgres.
const CLS = {
  warrior: { hp: 120, mp: 40, atk: [12, 20], skill: { name: 'Tebasan Berat', dmg: [25, 40], mp: 15 } },
  mage: { hp: 80, mp: 100, atk: [10, 18], skill: { name: 'Ledakan Api', dmg: [28, 45], mp: 30 } },
  archer: { hp: 95, mp: 60, atk: [11, 22], skill: { name: 'Hujan Panah', dmg: [22, 38], mp: 25 } },
};
// Peta 3x3: [y][x]
const MAP = [
  ['Gunung', 'Hutan', 'Gua Bos'],
  ['Danau', 'Kota', 'Hutan'],
  ['Hutan', 'Ladang', 'Reruntuhan'],
];
const MONSTER = [
  { name: 'Slime', hp: [25, 40], atk: [5, 12], xp: 30, gold: [5, 15] },
  { name: 'Goblin', hp: [40, 60], atk: [8, 16], xp: 50, gold: [10, 25] },
  { name: 'Serigala', hp: [55, 80], atk: [12, 22], xp: 80, gold: [15, 35] },
  { name: 'Golem', hp: [90, 130], atk: [18, 30], xp: 130, gold: [30, 60] },
  { name: 'Naga Muda', hp: [140, 200], atk: [25, 42], xp: 220, gold: [60, 120] },
];
const BOSS = { name: 'RAJA IBLIS', hp: [280, 280], atk: [30, 50], xp: 500, gold: [200, 300] };

const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const bar = (cur, max, n = 10) => {
  const f = Math.max(0, Math.min(n, Math.round((cur / max) * n)));
  return '[' + '#'.repeat(f) + '-'.repeat(n - f) + ']';
};
const key = (jid, sender) => `rpgc:${jid}:${sender}`;
const dkey = (jid) => `duel:${jid}`;

async function loadChar(jid, sender) {
  const { cache } = await import('../core/store.js');
  const v = await cache.get(key(jid, sender));
  return v ? JSON.parse(v) : null;
}
async function saveChar(jid, sender, c) {
  const { cache } = await import('../core/store.js');
  await cache.set(key(jid, sender), JSON.stringify(c), 7200);
}
function statText(c) {
  return `*${c.name}* (Lv${c.level} ${c.cls})\nNyawa: ${bar(c.hp, c.maxHp)} ${c.hp}/${c.maxHp}\nMana: ${bar(c.mp, c.maxMp)} ${c.mp}/${c.maxMp}\nGold: ${c.gold} | Potion: ${c.potion}\nLokasi: ${c.loc}`;
}
function spawnMonster(level, boss = false) {
  const base = boss ? BOSS : pick(MONSTER.filter((m, i) => i <= Math.min(4, Math.floor(level / 2) + 1)));
  const hp = R(base.hp[0], base.hp[1]) + level * 6;
  return { name: base.name, hp, maxHp: hp, atk: base.atk, xp: base.xp, gold: R(base.gold[0], base.gold[1]), boss };
}

// Giliran musuh otomatis setelah aksi pemain. Return teks + status.
async function enemyTurn(c, send, jid, pushName) {
  const e = c.enemy;
  const dmg = R(e.atk[0], e.atk[1]);
  c.hp -= dmg;
  let t = `\n${e.name} menyerang. Kamu -${dmg} nyawa.`;
  if (c.hp <= 0) {
    c.hp = 0;
    const lost = Math.floor(c.gold * 0.1);
    c.gold -= lost;
    c.x = 1; c.y = 1; c.loc = 'Kota'; c.enemy = null;
    c.hp = c.maxHp; c.mp = c.maxMp;
    t += `\n\nKamu tumbang. Bangkit di Kota, gold -${lost}.`;
    await saveChar(jid, c._sender, c);
    return { text: t, over: true };
  }
  await saveChar(jid, c._sender, c);
  return { text: t, over: false };
}

async function victory(c, send, jid, sender, pushName) {
  const e = c.enemy;
  c.enemy = null;
  c.xp += e.xp; c.gold += e.gold;
  const nl = 1 + Math.floor(c.xp / 200);
  let t = `\n\n${e.name} dikalahkan. +${e.xp} XP, +${e.gold} gold.`;
  if (nl > c.level) {
    c.level = nl;
    const st = CLS[c.cls];
    c.maxHp += 15; c.maxMp += 5; c.hp = c.maxHp; c.mp = c.maxMp;
    t += `\nNaik ke level ${nl}. Nyawa dan mana pulih penuh.`;
  } else {
    c.hp = Math.min(c.maxHp, c.hp + 10);
  }
  const { db } = await import('../core/store.js');
  await db.addXp(sender, pushName, e.xp);
  await db.addScore(sender, 'rpgchat', Math.min(50, Math.floor(e.xp / 5)));
  c._sender = sender;
  await saveChar(jid, sender, c);
  return t;
}

async function doAttack(c, jid, sender, pushName) {
  const st = CLS[c.cls];
  const dmg = R(st.atk[0], st.atk[1]) + (c.level - 1) * 2;
  c.enemy.hp -= dmg;
  let t = `Kamu menyerang. ${c.enemy.name} -${dmg} nyawa (${Math.max(0, c.enemy.hp)}/${c.enemy.maxHp}).`;
  if (c.enemy.hp <= 0) {
    t += await victory(c, null, jid, sender, pushName);
    return { text: t, over: true };
  }
  c._sender = sender;
  const r = await enemyTurn(c, null, jid, pushName);
  return { text: t + r.text + `\n${statText(c)}`, over: r.over };
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

// Selesaikan 1 battle otomatis. Return {log, tail}. Dipakai !auto dan !oto.
async function autoBattle(c, jid, sender, pushName) {
  const log = [`Auto-battle melawan ${c.enemy.name} dimulai.`];
  let guard = 0;
  while (c.enemy && c.hp > 0 && guard++ < 30) {
    if (c.hp < c.maxHp * 0.35 && c.potion > 0) {
      c.potion--; c.hp = Math.min(c.maxHp, c.hp + 50);
      log.push(`Minum potion (${c.hp}/${c.maxHp}).`);
    } else if (c.mp >= CLS[c.cls].skill.mp && Math.random() < 0.4) {
      const st = CLS[c.cls];
      c.mp -= st.skill.mp;
      const dmg = R(st.skill.dmg[0], st.skill.dmg[1]) + (c.level - 1) * 2;
      c.enemy.hp -= dmg;
      log.push(`${st.skill.name}, musuh -${dmg}.`);
    } else {
      const st = CLS[c.cls];
      const dmg = R(st.atk[0], st.atk[1]) + (c.level - 1) * 2;
      c.enemy.hp -= dmg;
      log.push(`Serang, musuh -${dmg}.`);
    }
    if (c.enemy.hp <= 0) break;
    const dmg = R(c.enemy.atk[0], c.enemy.atk[1]);
    c.hp -= dmg;
    log.push(`${c.enemy.name} membalas -${dmg}.`);
  }
  let tail = '';
  if (c.enemy && c.enemy.hp <= 0) {
    tail = 'Menang.' + await victory(c, null, jid, sender, pushName);
  } else if (c.hp <= 0) {
    c.hp = c.maxHp; c.mp = c.maxMp; c.x = 1; c.y = 1; c.loc = 'Kota'; c.enemy = null;
    c._sender = sender;
    await saveChar(jid, sender, c);
    tail = 'Kamu tumbang dan bangkit di Kota.';
  } else {
    c._sender = sender;
    await saveChar(jid, sender, c);
    tail = 'Battle terlalu lama, berhenti aman.';
  }
  return { log, tail };
}

export const rpgchat = [
  {
    name: 'dunia', aliases: ['mulai', 'start2'], desc: '!dunia main RPG langsung di chat',
    async run({ jid, sender, pushName, args, send, sock }) {
      try {
        const { inlineGame, sendInlineWebUI } = await import('../wa/airich-send.js');
        await sendInlineWebUI(sock, jid, await inlineGame('rpggame.html'), 'RPG Adventure');
        return;
      } catch (e) {
        await send(jid, `Gagal memuat game: ${e.message}`);
      }
    },
  },
  {
    name: 'karakter', aliases: ['char', 'profil'], desc: 'Lihat status karakter',
    async run({ jid, sender, send }) {
      const c = await loadChar(jid, sender);
      if (!c) return send(jid, 'Belum punya karakter. Ketik !dunia <class> dulu.');
      await send(jid, statText(c));
    },
  },
  {
    name: 'jalan', aliases: ['go', 'move'], desc: '!jalan <utara|selatan|timur|barat>',
    async run({ jid, sender, args, send, sock }) {
      const c = await loadChar(jid, sender);
      if (!c) return send(jid, 'Ketik !dunia <class> dulu.');
      if (c.enemy) return send(jid, `Sedang bertarung melawan ${c.enemy.name}. Selesaikan dulu (!serang / !kabur).`);
      const d = (args[0] || '').toLowerCase();
      const dx = { timur: 1, barat: -1 }[d] || 0;
      const dy = { selatan: 1, utara: -1 }[d] || 0;
      if (!dx && !dy) return send(jid, 'Arah: utara, selatan, timur, barat.\nPeta:\nGunung | Hutan | Gua Bos\nDanau | Kota | Hutan\nHutan | Ladang | Reruntuhan');
      const nx = c.x + dx, ny = c.y + dy;
      if (nx < 0 || nx > 2 || ny < 0 || ny > 2) return send(jid, 'Ujung dunia. Putar balik.');
      c.x = nx; c.y = ny; c.loc = MAP[ny][nx]; c._sender = sender;
      let t = `Berjalan ke *${c.loc}*.`;
      // Gua Bos butuh level 3
      if (c.loc === 'Gua Bos' && c.level < 3) {
        c.x = 1; c.y = 0; c.loc = 'Hutan';
        t += '\nGua Bos terkunci. Kembali saat level 3.';
      } else if (c.loc === 'Kota') {
        c.hp = c.maxHp; c.mp = c.maxMp;
        t += '\nIstirahat di Kota. Nyawa dan mana pulih.';
      } else if (c.loc === 'Gua Bos' || Math.random() < 0.45) {
        c.enemy = spawnMonster(c.level, c.loc === 'Gua Bos');
        t += `\n\nSeekor *${c.enemy.name}* muncul (nyawa ${c.enemy.hp}).\n!serang, !skill, !heal, atau !kabur.`;
      }
      await saveChar(jid, sender, c);
      await send(jid, t + `\n${statText(c)}`);
      await rpgTurnEnd(sock, jid, sender);
    },
  },
  {
    name: 'serang', aliases: ['attack', 'hit'], desc: 'Serang musuh / lawan duel',
    async run({ jid, sender, pushName, send, sock }) {
      // duel dulu
      const { cache } = await import('../core/store.js');
      const dv = await cache.get(dkey(jid));
      if (dv) {
        const d = JSON.parse(dv);
        if (d.started && (sender === d.p1 || sender === d.p2)) {
          if (d.turn !== sender) return send(jid, 'Bukan giliranmu. Tunggu lawan.');
          return duelStrike(jid, d, sender, false, send, sock);
        }
      }
      const c = await loadChar(jid, sender);
      if (!c) return send(jid, 'Ketik !dunia <class> dulu.');
      if (!c.enemy) return send(jid, 'Tidak ada musuh. Jelajahi dengan !jalan.');
      if (c.auto) return send(jid, 'Mode auto aktif. Matikan dengan !auto off.');
      const r = await doAttack(c, jid, sender, pushName);
      await send(jid, r.text);
      await rpgTurnEnd(sock, jid, sender);
    },
  },
  {
    name: 'skill', desc: 'Skill class (pakai mana)',
    async run({ jid, sender, pushName, send, sock }) {
      const { cache } = await import('../core/store.js');
      const dv = await cache.get(dkey(jid));
      if (dv) {
        const d = JSON.parse(dv);
        if (d.started && (sender === d.p1 || sender === d.p2)) {
          if (d.turn !== sender) return send(jid, 'Bukan giliranmu. Tunggu lawan.');
          return duelStrike(jid, d, sender, true, send, sock);
        }
      }
      const c = await loadChar(jid, sender);
      if (!c) return send(jid, 'Ketik !dunia <class> dulu.');
      if (!c.enemy) return send(jid, 'Tidak ada musuh.');
      const st = CLS[c.cls];
      if (c.mp < st.skill.mp) return send(jid, `Mana kurang (butuh ${st.skill.mp}).`);
      c.mp -= st.skill.mp;
      const dmg = R(st.skill.dmg[0], st.skill.dmg[1]) + (c.level - 1) * 2;
      c.enemy.hp -= dmg;
      let t = `${st.skill.name}. ${c.enemy.name} -${dmg} nyawa.`;
      if (c.enemy.hp <= 0) {
        t += await victory(c, null, jid, sender, pushName);
        await send(jid, t);
        await rpgTurnEnd(sock, jid, sender);
        return;
      }
      c._sender = sender;
      const r = await enemyTurn(c, null, jid, pushName);
      await send(jid, t + r.text + `\n${statText(c)}`);
      await rpgTurnEnd(sock, jid, sender);
    },
  },
  {
    name: 'heal', aliases: ['pakai'], desc: 'Minum potion (+50 nyawa)',
    async run({ jid, sender, args, send, sock }) {
      const { cache } = await import('../core/store.js');
      const dv = await cache.get(dkey(jid));
      if (dv) {
        const d = JSON.parse(dv);
        if (d.started && (sender === d.p1 || sender === d.p2)) {
          if (d.turn !== sender) return send(jid, 'Bukan giliranmu. Tunggu lawan.');
          const c = await loadChar(jid, sender);
          if (!c || c.potion < 1) return send(jid, 'Potion habis. Kehilangan giliran.');
          c.potion--; c._sender = sender;
          await saveChar(jid, sender, c);
          d.hp[sender] = Math.min(200, d.hp[sender] + 50);
          d.turn = sender === d.p1 ? d.p2 : d.p1;
          await cache.set(dkey(jid), JSON.stringify(d), 1800);
          const foeId = sender === d.p1 ? d.p2 : d.p1;
          await sock.sendMessage(jid, { text: `@${sender.split('@')[0]} minum potion (+50). Giliran @${foeId.split('@')[0]}.`, mentions: [sender, foeId] });
          return;
        }
      }
      const c = await loadChar(jid, sender);
      if (!c) return send(jid, 'Ketik !dunia <class> dulu.');
      if ((args[0] || '').toLowerCase() !== 'potion' && c.potion < 1 && args.length) { /* abaikan */ }
      if (c.potion < 1) return send(jid, 'Potion habis. Beli dengan !beli potion (30 gold).');
      if (c.hp >= c.maxHp) return send(jid, 'Nyawa sudah penuh.');
      c.potion--;
      c.hp = Math.min(c.maxHp, c.hp + 50);
      c._sender = sender;
      let t = `Minum potion. Nyawa ${c.hp}/${c.maxHp}. Sisa potion: ${c.potion}.`;
      if (c.enemy) {
        const r = await enemyTurn(c, null, jid, sender);
        t += r.text + `\n${statText(c)}`;
      } else {
        await saveChar(jid, sender, c);
      }
      await send(jid, t);
      await rpgTurnEnd(sock, jid, sender);
    },
  },
  {
    name: 'kabur', aliases: ['lari', 'flee'], desc: 'Kabur dari battle (50%)',
    async run({ jid, sender, send, sock }) {
      const c = await loadChar(jid, sender);
      if (!c || !c.enemy) return send(jid, 'Tidak ada yang perlu dikaburi.');
      if (c.enemy.boss || Math.random() > 0.5) {
        const dmg = R(5, 15);
        c.hp -= dmg; c._sender = sender;
        if (c.hp <= 0) { c.hp = c.maxHp; c.mp = c.maxMp; c.x = 1; c.y = 1; c.loc = 'Kota'; c.enemy = null; }
        await saveChar(jid, sender, c);
        await send(jid, `Gagal kabur. Terkena ${dmg} damage.\n${statText(c)}`);
        await rpgTurnEnd(sock, jid, sender);
        return;
      }
      c.enemy = null; c._sender = sender;
      await saveChar(jid, sender, c);
      await send(jid, 'Berhasil kabur.');
      await rpgTurnEnd(sock, jid, sender);
    },
  },
  {
    name: 'tas', aliases: ['inventory', 'inv2'], desc: 'Lihat isi tas',
    async run({ jid, sender, send }) {
      const c = await loadChar(jid, sender);
      if (!c) return send(jid, 'Ketik !dunia <class> dulu.');
      await send(jid, `*TAS*\nPotion x${c.potion} (pakai: !heal)\nGold: ${c.gold}\nBeli potion: !beli potion (30 gold)`);
    },
  },
  {
    name: 'beli', aliases: ['buy', 'shop2'], desc: '!beli potion (30 gold)',
    async run({ jid, sender, args, send }) {
      const c = await loadChar(jid, sender);
      if (!c) return send(jid, 'Ketik !dunia <class> dulu.');
      if ((args[0] || '').toLowerCase() !== 'potion') return send(jid, 'Yang dijual: potion (30 gold). Ketik !beli potion');
      if (c.gold < 30) return send(jid, `Gold kurang (${c.gold}/30). Kalahkan monster untuk dapat gold.`);
      c.gold -= 30; c.potion++; c._sender = sender;
      await saveChar(jid, sender, c);
      await send(jid, `Membeli 1 potion. Sisa gold ${c.gold}, potion ${c.potion}.`);
    },
  },
  {
    name: 'auto', desc: '!auto on/off bertarung otomatis',
    async run({ jid, sender, pushName, args, send }) {
      const c = await loadChar(jid, sender);
      if (!c) return send(jid, 'Ketik !dunia <class> dulu.');
      const on = (args[0] || '').toLowerCase() !== 'off';
      c.auto = on; c._sender = sender;
      await saveChar(jid, sender, c);
      if (!on || !c.enemy) return send(jid, `Mode auto: ${on ? 'AKTIF' : 'NONAKTIF'}.`);
      const { log, tail } = await autoBattle(c, jid, sender, pushName);
      await send(jid, log.slice(0, 12).join('\n') + `\n...\n${tail}\n${statText(c)}`);
    },
  },
  {
    name: 'oto', aliases: ['autoplay', 'nonton'], desc: '!oto petualangan otomatis, tinggal tonton',
    async run({ jid, sender, pushName, send, sock }) {
      const FLAVOR = {
        Kota: 'kota yang ramai. Orang berlalu-lalang, aroma roti bakar tercium.',
        Hutan: 'hutan lebat. Ranting berderak di kejauhan.',
        Danau: 'danau tenang berkilau. Angin sepoi-sepoi.',
        Gunung: 'lereng gunung berangin. Jalur menanjak curam.',
        Ladang: 'ladang luas menghijau. Petani melambai.',
        Reruntuhan: 'reruntuhan batu tua. Lumut menutup ukiran aneh.',
        'Gua Bos': 'gua gelap bergema. Sesuatu yang besar bernapas di dalam.',
      };
      let c = await loadChar(jid, sender);
      if (!c) {
        const st0 = CLS.warrior;
        c = {
          name: pushName, cls: 'warrior', level: 1, xp: 0, gold: 50, potion: 1,
          hp: st0.hp, maxHp: st0.hp, mp: st0.mp, maxMp: st0.mp,
          x: 1, y: 1, loc: 'Kota', enemy: null, auto: false, _sender: sender,
        };
        await saveChar(jid, sender, c);
      }
      if (c.enemy) return send(jid, 'Selesaikan battle dulu (!auto on untuk otomatis).');
      await send(jid, 'Mode tonton dimulai: 5 langkah otomatis. Duduk manis, tanpa gambar, murni cerita.');
      const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const DNAMES = { '1,0': 'timur', '-1,0': 'barat', '0,1': 'selatan', '0,-1': 'utara' };
      for (let i = 0; i < 5; i++) {
        c = await loadChar(jid, sender);
        if (!c || c.enemy) break;
        const valid = DIRS.map(([dx, dy]) => [c.x + dx, c.y + dy])
          .filter(([nx, ny]) => nx >= 0 && nx <= 2 && ny >= 0 && ny <= 2);
        const [tx, ty] = valid[Math.floor(Math.random() * valid.length)];
        const dx = tx - c.x, dy = ty - c.y;
        const nx = c.x + dx, ny = c.y + dy;
        c.x = nx; c.y = ny; c.loc = MAP[ny][nx]; c._sender = sender;
        let t = `Langkah ${i + 1}: berjalan ke ${DNAMES[dx + ',' + dy]}, tiba di *${c.loc}* — ${FLAVOR[c.loc] || ''}`;
        if (c.loc === 'Gua Bos' && c.level < 3) {
          c.x = 1; c.y = 0; c.loc = 'Hutan';
          t += '\nGerbang gua menolakmu. "Kembali saat level 3," bisik suara tua. Kamu mundur ke Hutan.';
        } else if (c.loc === 'Kota') {
          c.hp = c.maxHp; c.mp = c.maxMp;
          t += '\nMampir ke penginapan. Luka sembuh, mana pulih penuh.';
        } else if (c.loc === 'Gua Bos' || Math.random() < 0.5) {
          c.enemy = spawnMonster(c.level, c.loc === 'Gua Bos');
          t += `\nTiba-tiba! Seekor *${c.enemy.name}* (nyawa ${c.enemy.hp}) melompat dari semak!`;
        } else {
          t += '\nPerjalanan tenang. Tidak ada musuh terlihat.';
        }
        await saveChar(jid, sender, c);
        await send(jid, t);
        if (c.enemy) {
          const snap = { ...c.enemy };
          const { log, tail } = await autoBattle(c, jid, sender, pushName);
          // kartu hasil battle: musuh tampil dengan nyawa terakhir
          try {
            const after = await loadChar(jid, sender);
            const dead = !after.enemy;
            const disp = { ...after, enemy: { ...snap, hp: dead ? 0 : after.enemy.hp } };
            const { battleHtml } = await import('./battlehtml.js');
            const { aiRich } = await import('../wa/airich.js');
            const img = await aiRich(battleHtml(disp, log.slice(-2)), { width: 660, height: 480 });
            await sock.sendMessage(jid, { image: img, caption: tail.split('.')[0] + '.' });
          } catch { /* tanpa kartu bila Chrome sibuk */ }
          await send(jid, 'Pertarungan!\n' + log.slice(0, 10).join('\n') + `\n...\n${tail}`);
        }
        if (i < 4) await sleepMs(8000);
      }
      const fin = await loadChar(jid, sender);
      await send(jid, `Tontonan selesai.\n${fin ? statText(fin) : ''}\nKetik !oto lagi untuk lanjut.`);
    },
  },
  {
    name: 'duel', desc: '!duel @tag ajak PvP (grup)',
    groupOnly: true,
    async run({ jid, sender, m, send }) {
      const { cache } = await import('../core/store.js');
      if (await cache.get(dkey(jid))) return send(jid, 'Sudah ada duel berjalan di grup ini.');
      const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) return send(jid, 'Gunakan: !duel @teman');
      if (target === sender) return send(jid, 'Tidak bisa duel diri sendiri.');
      const a = await loadChar(jid, sender);
      const b = await loadChar(jid, target);
      if (!a || !b) return send(jid, 'Dua-duanya wajib punya karakter (!dunia <class>) dulu.');
      if (a.enemy || b.enemy) return send(jid, 'Selesaikan battle PvE dulu sebelum duel.');
      await cache.set(dkey(jid), JSON.stringify({ p1: sender, p2: target, started: false }), 120);
      await send(jid, `Tantangan duel untuk @${target.split('@')[0]}. Ketik !terima dalam 120 detik.`, { mentions: [target] });
    },
  },
  {
    name: 'terima', aliases: ['accept'], desc: 'Terima tantangan duel', groupOnly: true,
    async run({ jid, sender, send, sock }) {
      const { cache } = await import('../core/store.js');
      const v = await cache.get(dkey(jid));
      if (v) {
        const d = JSON.parse(v);
        if (sender !== d.p2) return send(jid, 'Tantangan ini bukan untukmu.');
        const a = await loadChar(jid, d.p1);
        const b = await loadChar(jid, d.p2);
        d.started = true; d.turn = d.p1;
        d.hp = { [d.p1]: a.hp, [d.p2]: b.hp };
        d.mp = { [d.p1]: a.mp, [d.p2]: b.mp };
        await cache.set(dkey(jid), JSON.stringify(d), 1800);
        await send(jid, `Duel dimulai. @${d.p1.split('@')[0]} jalan dulu: !serang, !skill, atau !heal.`, { mentions: [d.p1, d.p2] });
        if (sock) await sendRpgButtons(sock, jid, true);
        return;
      }
      // tantangan catur?
      const { Chess } = await import('chess.js');
      const chal = await cache.get(`chesschal:${jid}:${sender}`);
      if (!chal) return send(jid, 'Tidak ada tantangan duel.');
      const { p1, p2 } = JSON.parse(chal);
      const white = Math.random() < 0.5 ? p1 : p2;
      const black = white === p1 ? p2 : p1;
      const chess = new Chess();
      const st = { fen: chess.fen(), white, black, mode: 'duel' };
      const gk = `chessgame:${jid}:${[white, black].sort().join('|')}`;
      await cache.set(gk, JSON.stringify(st), 10800);
      await cache.set(`chessmy:${jid}:${white}`, JSON.stringify(st), 10800);
      await cache.set(`chessmy:${jid}:${black}`, JSON.stringify(st), 10800);
      await cache.del(`chesschal:${jid}:${sender}`);
      await cache.del(`chesschalf:${jid}:${p1}`);
      await sock.sendMessage(jid, {
        text: `Duel catur dimulai. @${white.split('@')[0]} pegang Putih, @${black.split('@')[0]} pegang Hitam. Papan duel dikirim di bawah — main bareng satu layar, gantian ketuk.`,
        mentions: [white, black],
      });
      try {
        const { inlineGame, sendInlineWebUI } = await import('../wa/airich-send.js');
        const { createPlayToken } = await import('../core/playtoken.js');
        await sendInlineWebUI(sock, jid, await inlineGame('catur-inline.html', { token: await createPlayToken(sender), mode: 'hotseat' }), 'Duel Catur');
      } catch { /* abaikan bila render sibuk */ }
    },
  },
  {
    name: 'tolak', aliases: ['decline'], desc: 'Tolak duel', groupOnly: true,
    async run({ jid, sender, send }) {
      const { cache } = await import('../core/store.js');
      const v = await cache.get(dkey(jid));
      if (v) {
        const d = JSON.parse(v);
        if (sender !== d.p2 && sender !== d.p1) return send(jid, 'Bukan duelmu.');
        await cache.del(dkey(jid));
        await send(jid, 'Duel dibatalkan.');
        return;
      }
      const chal = await cache.get(`chesschal:${jid}:${sender}`);
      if (chal) {
        const { p1 } = JSON.parse(chal);
        await cache.del(`chesschal:${jid}:${sender}`);
        await cache.del(`chesschalf:${jid}:${p1}`);
        await send(jid, `@${sender.split('@')[0]} menolak tantangan catur @${p1.split('@')[0]}.`, { mentions: [sender, p1] });
        return;
      }
      return send(jid, 'Tidak ada tantangan duel.');
    },
  },
  {
    name: 'menyerah', aliases: ['surrender', 'ff'], desc: 'Menyerah duel', groupOnly: true,
    async run({ jid, sender, send }) {
      const { cache } = await import('../core/store.js');
      const v = await cache.get(dkey(jid));
      if (!v) return send(jid, 'Tidak ada duel berjalan.');
      const d = JSON.parse(v);
      if (!d.started || (sender !== d.p1 && sender !== d.p2)) return send(jid, 'Kamu tidak ikut duel ini.');
      const winner = sender === d.p1 ? d.p2 : d.p1;
      await cache.del(dkey(jid));
      await duelReward(jid, winner, sender);
      await send(jid, `@${sender.split('@')[0]} menyerah. Pemenang: @${winner.split('@')[0]}.`, { mentions: [sender, winner] });
    },
  },
];

async function duelStrike(jid, d, sender, useSkill, send, sock) {
  const { cache, db } = await import('../core/store.js');
  const me = await loadChar(jid, sender);
  const foeId = sender === d.p1 ? d.p2 : d.p1;
  const foe = await loadChar(jid, foeId);
  const st = CLS[me.cls];
  let dmg, label;
  if (useSkill) {
    if (d.mp[sender] < st.skill.mp) { await send(jid, `Mana kurang (butuh ${st.skill.mp}).`); return; }
    d.mp[sender] -= st.skill.mp;
    dmg = R(st.skill.dmg[0], st.skill.dmg[1]) + (me.level - 1) * 2;
    label = st.skill.name;
  } else {
    dmg = R(st.atk[0], st.atk[1]) + (me.level - 1) * 2;
    label = 'Serangan';
  }
  d.hp[foeId] -= dmg;
  let t = `${label} @${sender.split('@')[0]}: @${foeId.split('@')[0]} -${dmg} (sisa ${Math.max(0, d.hp[foeId])}).`;
  if (d.hp[foeId] <= 0) {
    await cache.del(dkey(jid));
    await duelReward(jid, sender, foeId);
    await sock.sendMessage(jid, { text: t + `\nDuel selesai. Pemenang: @${sender.split('@')[0]} (+50 gold, +60 XP).`, mentions: [sender, foeId] });
    return;
  }
  d.turn = foeId;
  await cache.set(dkey(jid), JSON.stringify(d), 1800);
  await sock.sendMessage(jid, { text: t + `\nGiliran @${foeId.split('@')[0]}: !serang, !skill, atau !heal (!heal pakai potion karaktermu).`, mentions: [sender, foeId] });
  await sendRpgButtons(sock, jid, true);
}

async function duelReward(jid, winner, loser) {  const { db } = await import('../core/store.js');
  const w = await loadChar(jid, winner);
  if (w) {
    w.gold += 50; w._sender = winner;
    await saveChar(jid, winner, w);
    const nm = w.name || 'pemenang';
    await db.addXp(winner, nm, 60);
    await db.addScore(winner, 'rpgchat', 20);
  }
  const l = await loadChar(jid, loser);
  if (l) {
    l.gold = Math.max(0, l.gold - 20); l._sender = loser;
    await saveChar(jid, loser, l);
  }
}

// ===== Mode gambar + angka (main tanpa ketik perintah, tanpa browser) =====
export { loadChar, saveChar, statText, CLS };

const DIGIT_MENU_BATTLE = 'Ketuk pilihan di polling, atau balas angka: 1 Serang, 2 Skill, 3 Heal, 4 Kabur.';
const DIGIT_MENU_MAP = 'Ketuk pilihan di polling, atau balas angka: 1 Utara, 2 Selatan, 3 Timur, 4 Barat.';

// Kontrol ketuk: tombol klasik (bukan native, bukan polling).
// Dipakai alur duel (teks); alur PvE membawa tombol di gambar via richBubble.
export async function sendRpgButtons(sock, jid, inBattle) {
  const { richClassicButtons } = await import('../wa/rich.js');
  try {
    await richClassicButtons(
      sock, jid,
      inBattle ? 'Pilih aksi (balas 4 = Kabur).' : 'Pilih arah (balas 4 / B = Barat).',
      inBattle ? BTN_BATTLE3 : BTN_MAP3);
  } catch (e) { console.log('ℹ️ tombol klasik ditolak:', e.message); }
}

export const BTN_BATTLE3 = [
  { title: 'Serang', id: 'rpg:serang' },
  { title: 'Skill', id: 'rpg:skill' },
  { title: 'Heal', id: 'rpg:heal' },
];
export const BTN_MAP3 = [
  { title: 'Utara', id: 'rpg:utara' },
  { title: 'Selatan', id: 'rpg:selatan' },
  { title: 'Timur', id: 'rpg:timur' },
];

export async function sendMapImage(jid, c, sock, extra = '') {
  const { renderMap } = await import('./rpgmap.js');
  const { richBubble } = await import('../wa/rich.js');
  const img = await renderMap(c.x, c.y, !!c.enemy);
  const note = c.enemy ? ' (balas 4 = Kabur)' : ' (balas 4 / B = Barat)';
  const caption = `*${c.loc}*${c.enemy ? ` — ${c.enemy.name} menghadang` : ''}${extra ? '\n' + extra : ''}\n${note}`;
  try {
    await richBubble(sock, jid, img, caption, c.enemy ? BTN_BATTLE3 : BTN_MAP3);
  } catch {
    await sock.sendMessage(jid, { image: img, caption });
  }
  return true;
}

// Penutup tiap giliran PvE: kartu battle / peta + TOMBOL dalam 1 bubble.
export async function rpgTurnEnd(sock, jid, sender) {
  try {
    const c = await loadChar(jid, sender);
    if (!c || !sock) return;
    const { richBubble } = await import('../wa/rich.js');
    if (c.enemy) {
      try {
        const { battleHtml } = await import('./battlehtml.js');
        const { aiRich } = await import('../wa/airich.js');
        const img = await aiRich(battleHtml(c), { width: 660, height: 420 });
        await richBubble(sock, jid, img, `${c.enemy.name} menghadang (balas 4 = Kabur).`, BTN_BATTLE3);
      } catch { /* tanpa kartu bila Chrome sibuk */ }
    } else {
      await sendMapImage(jid, c, sock);
    }
  } catch (e) { console.log('ℹ️ turn end gagal:', e.message); }
}

// Balas 1 angka / huruf arah sebagai pengganti perintah. Return true bila ditangani.
export async function rpgDigit({ jid, sender, pushName, text, send, sock }) {
  const t = text.trim().toLowerCase();
  const word2dir = { u: 'utara', s: 'selatan', t: 'timur', b: 'barat', utara: 'utara', selatan: 'selatan', timur: 'timur', barat: 'barat' };
  const isDigit = /^[1234]$/.test(t);
  const isWord = !!word2dir[t];
  if (!isDigit && !isWord) return false;
  const c = await loadChar(jid, sender);
  if (!c) return false;
  const run = async (name, args = []) => {
    const cmd = rpgchat.find((x) => x.name === name);
    if (!cmd) return;
    await cmd.run({ jid, sender, pushName, args, raw: args.join(' '), m: { message: {} }, sock, send });
  };
  if (c.enemy) {
    if (isWord) return false; // saat battle hanya angka
    if (t === '1') await run('serang');
    else if (t === '2') await run('skill');
    else if (t === '3') await run('heal');
    else await run('kabur');
    return true; // run tujuan sudah mengirim kartu/peta + polling via rpgTurnEnd
  }
  // jelajah (gambar peta dari run jalan sudah membawa daftar pilihan)
  const dir = isDigit ? { 1: 'utara', 2: 'selatan', 3: 'timur', 4: 'barat' }[t] : word2dir[t];
  await run('jalan', [dir]);
  return true;
}
