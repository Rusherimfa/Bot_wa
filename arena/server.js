import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { Chess } from 'chess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3001;
// Bot API untuk klaim skor ke !rank (opsional, tetap jalan tanpanya)
const WA_API = process.env.ARENA_WA_API || 'http://127.0.0.1:3000/api/wa/score';
const WA_KEY = process.env.ARENA_WA_KEY || '';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
// CORS: wajib agar fetch/XHR dari WebUI di dalam chat WA tidak diblokir browser
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// roomId -> { players: Map, bombs: [], projectiles: [], startedAt }
let activeRooms = new Map();

app.get('/api/rooms', (req, res) => {
  const rooms = [...activeRooms.entries()].map(([id, r]) => ({
    id, players: r.players.size, startedAt: r.startedAt
  }));
  res.json(rooms);
});

// Diagnostik sandbox WebUI: pixel 1x1 + JSONP (tanpa XHR/fetch/WebSocket)
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
app.get('/api/pixel', (req, res) => {
  res.type('png').send(PIXEL);
});
app.get('/api/jsonp', (req, res) => {
  const cb = String(req.query.callback || 'cb').replace(/[^A-Za-z0-9_]/g, '').slice(0, 20) || 'cb';
  res.type('js').send(`${cb}(${JSON.stringify({ ok: true, t: Date.now() })});`);
});

app.post('/api/wa/arena', (req, res) => {
  const roomId = (req.body.roomId || Math.random().toString(36).slice(2, 6)).toUpperCase();
  if (!activeRooms.has(roomId)) {
    activeRooms.set(roomId, { players: new Map(), bombs: [], projectiles: [], startedAt: Date.now() });
  }
  const host = `${req.protocol}://${req.get('host')}`;
  const link = `${host}/?room=${roomId}`;
  res.json({ roomId, link, message: `RPG PvP buka: ${link} (2-6 player, ketik !arena ${roomId} di WA)` });
});

// --- Game constants
const TILE = 32;
const MAP_W = 25;
const MAP_H = 15;
const GRAVITY = 0.6;
const JUMP_V = -11;
const SPEED = 3.5;
const BOMB_COOLDOWN = 1200;
const BOMB_TIMER = 2000;
const BOMB_RADIUS = 88;
const KILLS_TO_WIN = 5;
const MAX_PLAYERS = 6;

// --- RPG classes
export const CLASSES = {
  warrior: {
    name: 'Warrior', icon: 'W', hp: 120, speed: 3.5,
    atk: { name: 'Tebasan', cd: 450, cost: 0, range: 48, dmg: 34 },
    skill: { name: 'Dash Strike', cd: 6000, cost: 25, desc: 'Dash + 20 dmg' },
  },
  mage: {
    name: 'Mage', icon: 'M', hp: 80, speed: 3.2,
    atk: { name: 'Fireball', cd: 700, cost: 20, range: 460, dmg: 26, projSpeed: 7 },
    skill: { name: 'Frost Nova', cd: 9000, cost: 35, desc: 'AoE 22 dmg + slow' },
  },
  archer: {
    name: 'Archer', icon: 'A', hp: 90, speed: 3.8,
    atk: { name: 'Panah', cd: 400, cost: 8, range: 520, dmg: 16, projSpeed: 11 },
    skill: { name: 'Triple Shot', cd: 7000, cost: 30, desc: '3 panah sekaligus' },
  },
};

function makeMap() {
  const m = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(0));
  for (let y = MAP_H - 2; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) m[y][x] = 1;
  const plats = [[8, 10, 9], [4, 7, 6], [15, 7, 8], [11, 4, 5]];
  for (const [x, y, w] of plats) for (let i = 0; i < w; i++) m[y][x + i] = 1;
  for (let y = 0; y < MAP_H; y++) { m[y][0] = 1; m[y][MAP_W - 1] = 1; }
  return m;
}
const baseMap = makeMap();
const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#a855f7', '#ec4899'];

function getSpawn() {
  const spawns = [{ x: 2, y: 11 }, { x: 22, y: 11 }, { x: 6, y: 5 }, { x: 16, y: 5 }, { x: 12, y: 11 }, { x: 12, y: 3 }];
  const idx = Math.floor(Math.random() * spawns.length);
  return spawns[idx];
}

function newRoom() {
  return { players: new Map(), bombs: [], projectiles: [], startedAt: Date.now() };
}

function pubPlayer(p) {
  // kirim ke client: sembunyikan timestamp internal yg tidak perlu? biarkan, client butuh cd.
  return p;
}

function damage(roomId, target, dmg, attacker, cause) {
  const roomObj = activeRooms.get(roomId);
  if (!roomObj || !target.alive) return;
  target.hp -= dmg;
  if (target.hp <= 0) {
    target.alive = false; target.hp = 0; target.deaths++;
    if (attacker && attacker.id !== target.id) {
      attacker.kills++;
      gainXp(roomId, attacker, 100);
      io.to(roomId).emit('log', `${attacker.name} (${attacker.cls}) mengalahkan ${target.name} [${cause}]`);
    } else {
      io.to(roomId).emit('log', `${target.name} tumbang (${cause})`);
    }
    setTimeout(() => respawn(roomId, target), 2500);
    checkMatchEnd(roomId);
  }
}

function gainXp(roomId, p, amount) {
  p.xp += amount;
  const nl = 1 + Math.floor(p.xp / 200);
  if (nl > p.level) {
    p.level = nl;
    p.maxHp += 15;
    p.hp = p.maxHp;
    io.to(roomId).emit('fx', { type: 'levelup', x: p.x + p.w / 2, y: p.y });
    io.to(roomId).emit('log', `${p.name} naik ke level ${p.level}.`);
  }
}

function respawn(roomId, p) {
  const roomObj = activeRooms.get(roomId);
  if (!roomObj || p.alive) return;
  const s = getSpawn();
  p.x = s.x * TILE; p.y = s.y * TILE; p.vx = 0; p.vy = 0;
  p.hp = p.maxHp; p.mp = p.maxMp; p.alive = true;
  io.to(roomId).emit('log', `${p.name} respawn.`);
  io.to(roomId).emit('roomState', {
    players: [...roomObj.players.values()].map(pubPlayer),
    bombs: roomObj.bombs, projectiles: roomObj.projectiles,
  });
}

function checkMatchEnd(roomId) {
  const roomObj = activeRooms.get(roomId);
  if (!roomObj) return;
  const win = [...roomObj.players.values()].find((p) => p.kills >= KILLS_TO_WIN);
  if (!win) return;
  const table = [...roomObj.players.values()]
    .map((p) => ({ name: p.name, cls: p.cls, kills: p.kills, deaths: p.deaths, level: p.level }))
    .sort((a, b) => b.kills - a.kills);
  io.to(roomId).emit('matchEnd', { winner: win.name, cls: win.cls, table });
  io.to(roomId).emit('log', `Match selesai. Pemenang: ${win.name}. Skor diklaim ke !rank bila nomor WA diisi.`);
  submitScores(roomObj);
  // reset match baru
  for (const p of roomObj.players.values()) {
    p.kills = 0; p.deaths = 0; p.xp = 0; p.level = 1;
    p.maxHp = CLASSES[p.cls].hp; p.hp = p.maxHp; p.mp = p.maxMp;
    if (!p.alive) { const s = getSpawn(); p.x = s.x * TILE; p.y = s.y * TILE; p.alive = true; }
  }
}

async function submitScores(roomObj) {
  if (!WA_KEY) return;
  for (const p of roomObj.players.values()) {
    if (!p.wa || !p.kills) continue;
    try {
      await fetch(WA_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: WA_KEY, nomor: p.wa, game: 'rpgpvp', points: Math.min(100, p.kills * 10 + p.level * 5) }),
      });
    } catch { /* bot offline, abaikan */ }
  }
}

function fireProjectile(roomId, owner, kind, dmg, speed, dy = 0) {
  const roomObj = activeRooms.get(roomId);
  if (!roomObj) return;
  roomObj.projectiles.push({
    id: Math.random().toString(36).slice(2),
    x: owner.x + owner.w / 2, y: owner.y + owner.h / 2 - 4,
    vx: owner.dir * speed, vy: dy,
    r: kind === 'fire' ? 7 : 4,
    dmg, owner: owner.id, ownerName: owner.name, kind, life: 120,
  });
  io.to(roomId).emit('fx', {
    type: kind === 'fire' ? 'fireball' : 'arrow',
    x: owner.x + owner.w / 2, y: owner.y, dir: owner.dir,
  });
}

io.on('connection', (socket) => {
  let roomId = socket.handshake.query.room || 'LOBBY';
  let player = null;

  socket.on('join', ({ name, room, cls, wa }) => {
    roomId = (room || 'LOBBY').toUpperCase().slice(0, 8);
    if (!activeRooms.has(roomId)) activeRooms.set(roomId, newRoom());
    const roomObj = activeRooms.get(roomId);
    if (roomObj.players.size >= MAX_PLAYERS) {
      socket.emit('errorMsg', `Room penuh (${MAX_PLAYERS} max)`);
      return;
    }
    const c = CLASSES[cls] ? cls : 'warrior';
    const spawn = getSpawn();
    player = {
      id: socket.id,
      name: (name || 'Player').slice(0, 12) || 'Player',
      cls: c,
      wa: String(wa || '').replace(/\D/g, '').slice(0, 15),
      x: spawn.x * TILE, y: spawn.y * TILE,
      vx: 0, vy: 0, w: 22, h: 30, dir: 1,
      maxHp: CLASSES[c].hp, hp: CLASSES[c].hp,
      maxMp: 100, mp: 100,
      level: 1, xp: 0,
      kills: 0, deaths: 0, alive: true,
      color: COLORS[roomObj.players.size % COLORS.length],
      lastAtk: 0, lastSkill: 0, lastBomb: 0,
      slowUntil: 0, onGround: false,
    };
    roomObj.players.set(socket.id, player);
    socket.join(roomId);
    socket.emit('joined', { id: socket.id, roomId, map: baseMap, player, classes: CLASSES });
    io.to(roomId).emit('roomState', {
      players: [...roomObj.players.values()].map(pubPlayer),
      bombs: roomObj.bombs, projectiles: roomObj.projectiles,
    });
    io.to(roomId).emit('log', `${player.name} masuk sebagai ${CLASSES[c].name}.`);
  });

  socket.on('input', (data) => {
    const roomObj = activeRooms.get(roomId);
    if (!roomObj || !player || !player.alive) return;
    const p = roomObj.players.get(socket.id);
    if (!p) return;
    const now = Date.now();
    const slowed = now < p.slowUntil;
    const spd = CLASSES[p.cls].speed * (slowed ? 0.55 : 1);
    if (data.left) { p.vx = -spd; p.dir = -1; }
    else if (data.right) { p.vx = spd; p.dir = 1; }
    else p.vx = 0;
    if (data.jump && p.onGround) p.vy = JUMP_V;

    const C = CLASSES[p.cls];
    // --- serangan dasar ---
    if (data.attack && now - p.lastAtk > C.atk.cd && p.mp >= C.atk.cost) {
      p.lastAtk = now; p.mp -= C.atk.cost;
      if (p.cls === 'warrior') {
        for (const [oid, other] of roomObj.players) {
          if (oid === socket.id || !other.alive) continue;
          const dx = (other.x + other.w / 2) - (p.x + p.w / 2);
          const dy = (other.y + other.h / 2) - (p.y + p.h / 2);
          const facing = Math.sign(dx) === p.dir || Math.abs(dx) < 20;
          if (Math.hypot(dx, dy) < C.atk.range && facing && Math.abs(dy) < 34) {
            gainXp(roomId, p, 10);
            damage(roomId, other, C.atk.dmg, p, C.atk.name);
            io.to(roomId).emit('fx', { type: 'slash', x: other.x + other.w / 2, y: other.y + other.h / 2, dir: p.dir });
          }
        }
        io.to(roomId).emit('fx', { type: 'sword', x: p.x + p.w / 2 + p.dir * 18, y: p.y + p.h / 2 });
      } else {
        fireProjectile(roomId, p, p.cls === 'mage' ? 'fire' : 'arrow', C.atk.dmg, C.atk.projSpeed);
      }
    }

    // --- skill khusus class ---
    if (data.skill && now - p.lastSkill > C.skill.cd && p.mp >= C.skill.cost) {
      p.lastSkill = now; p.mp -= C.skill.cost;
      if (p.cls === 'warrior') {
        p.vx = p.dir * 11; p.vy = -4;
        for (const [oid, other] of roomObj.players) {
          if (oid === socket.id || !other.alive) continue;
          const dx = (other.x + other.w / 2) - (p.x + p.w / 2);
          if (Math.abs(dx) < 70 && Math.abs(other.y - p.y) < 40) {
            gainXp(roomId, p, 10);
            damage(roomId, other, 20, p, C.skill.name);
          }
        }
        io.to(roomId).emit('fx', { type: 'dash', x: p.x + p.w / 2, y: p.y + p.h / 2, dir: p.dir });
      } else if (p.cls === 'mage') {
        for (const [oid, other] of roomObj.players) {
          if (oid === socket.id || !other.alive) continue;
          const d = Math.hypot((other.x - p.x), (other.y - p.y));
          if (d < 115) {
            other.slowUntil = now + 3000;
            gainXp(roomId, p, 10);
            damage(roomId, other, 22, p, C.skill.name);
          }
        }
        io.to(roomId).emit('fx', { type: 'frost', x: p.x + p.w / 2, y: p.y + p.h / 2 });
      } else {
        fireProjectile(roomId, p, 'arrow', 14, C.atk.projSpeed, -1.5);
        fireProjectile(roomId, p, 'arrow', 14, C.atk.projSpeed, 0);
        fireProjectile(roomId, p, 'arrow', 14, C.atk.projSpeed, 1.5);
      }
    }

    // --- bom (semua class) ---
    if (data.bomb && now - p.lastBomb > BOMB_COOLDOWN) {
      p.lastBomb = now;
      const bomb = {
        id: Math.random().toString(36).slice(2),
        x: p.x + p.w / 2 - 8, y: p.y + p.h / 2 - 8,
        owner: p.id, ownerName: p.name, at: now,
      };
      roomObj.bombs.push(bomb);
      io.to(roomId).emit('fx', { type: 'bombPlace', x: bomb.x, y: bomb.y });
      setTimeout(() => explode(bomb, roomId), BOMB_TIMER);
    }
  });

  function explode(bomb, rId) {
    const roomObj = activeRooms.get(rId);
    if (!roomObj) return;
    roomObj.bombs = roomObj.bombs.filter((b) => b.id !== bomb.id);
    io.to(rId).emit('fx', { type: 'explode', x: bomb.x + 8, y: bomb.y + 8, r: BOMB_RADIUS });
    for (const [oid, other] of roomObj.players) {
      if (!other.alive) continue;
      const dx = (other.x + other.w / 2) - (bomb.x + 8);
      const dy = (other.y + other.h / 2) - (bomb.y + 8);
      if (Math.hypot(dx, dy) < BOMB_RADIUS) {
        const owner = roomObj.players.get(bomb.owner);
        damage(rId, other, 55, owner && owner.id !== other.id ? owner : null, 'Bom');
      }
    }
    io.to(rId).emit('roomState', {
      players: [...roomObj.players.values()].map(pubPlayer),
      bombs: roomObj.bombs, projectiles: roomObj.projectiles,
    });
  }

  // chat global + emoji (mode Neko Park)
  socket.on('chat', ({ text }) => {
    const roomObj = activeRooms.get(roomId);
    if (!roomObj || !player) return;
    const clean = String(text || '').slice(0, 60);
    if (!clean.trim()) return;
    io.to(roomId).emit('chat', { name: player.name, text: clean });
    io.to(roomId).emit('log', `${player.name}: ${clean}`);
  });

  socket.on('emoji', ({ e }) => {
    const roomObj = activeRooms.get(roomId);
    if (!roomObj || !player || !player.alive) return;
    const allowed = ['👋', '❤️', '😂', '😡', '🎉', '✨'];
    if (!allowed.includes(e)) return;
    io.to(roomId).emit('fx', { type: 'emoji', e, x: player.x + player.w / 2, y: player.y - 10 });
  });

  socket.on('disconnect', () => {    const roomObj = activeRooms.get(roomId);
    if (roomObj && player) {
      roomObj.players.delete(socket.id);
      io.to(roomId).emit('log', `${player.name} keluar`);
      io.to(roomId).emit('roomState', {
        players: [...roomObj.players.values()].map(pubPlayer),
        bombs: roomObj.bombs, projectiles: roomObj.projectiles,
      });
      if (roomObj.players.size === 0) {
        setTimeout(() => { if (activeRooms.get(roomId)?.players.size === 0) activeRooms.delete(roomId); }, 60000);
      }
    }
  });
});

// global physics 60fps
setInterval(() => {
  for (const [rid, room] of activeRooms) {
    let changed = false;
    // mana regen
    for (const p of room.players.values()) {
      if (!p.alive) continue;
      p.mp = Math.min(p.maxMp, p.mp + 8 / 60);
      // gravity
      p.vy += GRAVITY;
      const nx = p.x + p.vx;
      const ny = p.y + p.vy;
      if (!collides(nx, p.y, p.w, p.h)) p.x = nx;
      else p.vx = 0;
      if (!collides(p.x, ny, p.w, p.h)) { p.y = ny; p.onGround = false; }
      else { if (p.vy > 0) p.onGround = true; p.vy = 0; }
      p.x = Math.max(TILE, Math.min(MAP_W * TILE - TILE - p.w, p.x));
      if (p.y > MAP_H * TILE + 100) {
        p.alive = false; p.hp = 0; p.deaths++;
        io.to(rid).emit('log', `${p.name} jatuh ke jurang.`);
        setTimeout(() => respawn(rid, p), 2000);
      }
      changed = true;
    }
    // projectiles
    if (room.projectiles.length) {
      const keep = [];
      for (const pr of room.projectiles) {
        pr.life--;
        pr.x += pr.vx; pr.y += pr.vy; pr.vy += 0.02;
        let dead = pr.life <= 0;
        if (!dead && collides(pr.x - 3, pr.y - 3, 6, 6)) {
          dead = true;
          io.to(rid).emit('fx', { type: 'hit', x: pr.x, y: pr.y });
        }
        if (!dead) {
          for (const [oid, other] of room.players) {
            if (oid === pr.owner || !other.alive) continue;
            const cx = other.x + other.w / 2, cy = other.y + other.h / 2;
            if (Math.hypot(pr.x - cx, pr.y - cy) < pr.r + 12) {
              const owner = room.players.get(pr.owner);
              if (owner) gainXp(rid, owner, 10);
              damage(rid, other, pr.dmg, owner && owner.id !== other.id ? owner : null, pr.kind === 'fire' ? 'Fireball' : 'Panah');
              io.to(rid).emit('fx', { type: 'hit', x: pr.x, y: pr.y });
              dead = true;
              break;
            }
          }
        }
        if (!dead) keep.push(pr);
      }
      if (keep.length !== room.projectiles.length) { room.projectiles = keep; changed = true; }
      else if (keep.length) changed = true;
    }
    if (changed) io.to(rid).emit('tick', {
      players: [...room.players.values()].map(pubPlayer),
      bombs: room.bombs, projectiles: room.projectiles,
    });
  }
}, 1000 / 60);

function collides(x, y, w, h) {
  const x1 = Math.floor(x / TILE), y1 = Math.floor(y / TILE);
  const x2 = Math.floor((x + w) / TILE), y2 = Math.floor((y + h) / TILE);
  for (let ty = y1; ty <= y2; ty++) for (let tx = x1; tx <= x2; tx++) {
    if (ty < 0 || ty >= MAP_H || tx < 0 || tx >= MAP_W) continue;
    if (baseMap[ty][tx] === 1) {
      const rx = tx * TILE, ry = ty * TILE;
      if (x + w > rx && x < rx + TILE && y + h > ry && y < ry + TILE) return true;
    }
  }
  return false;
}

/* ================= RPG WEbUI MULTIPLAYER (namespace /rpg) =================
   Top-down MMORPG-lite: D-pad, BASIC/1/2/3, tas, duel, monster, skor token. */
const rpg = io.of('/rpg');
const RW = 1600, RH = 1200;
const TOWN = { x: 60, y: 60, w: 260, h: 220 };
const POND = { x: 1150, y: 800, r: 150 };
const HOUSES = [
  { x: 420, y: 120, w: 140, h: 110 },
  { x: 900, y: 300, w: 150, h: 120 },
  { x: 300, y: 800, w: 160, h: 130 },
];
const MON_TYPES = [
  { kind: 'slime', hp: 45, dmg: 7, xp: 25, speed: 1.7, color: '#4ade80' },
  { kind: 'goblin', hp: 90, dmg: 13, xp: 55, speed: 2.1, color: '#a16207' },
  { kind: 'golem', hp: 180, dmg: 24, xp: 120, speed: 1.4, color: '#71717a' },
];
const rpgRooms = new Map(); // roomId -> { players: Map, monsters: [], projs: [], startedAt }
const rpgColors = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#a855f7', '#ec4899'];

function rpgRoom(id) {
  if (!rpgRooms.has(id)) rpgRooms.set(id, { players: new Map(), monsters: [], projs: [], startedAt: Date.now() });
  return rpgRooms.get(id);
}
const inRect = (x, y, r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
const inTown = (p) => inRect(p.x, p.y, TOWN);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

async function rpgSubmit(token, points) {
  if (!WA_KEY || !token || token === '__PTOK__') return;
  try {
    await fetch(WA_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: WA_KEY, token, game: 'rpgpvp', points: Math.min(100, points) }),
    });
  } catch { /* abaikan */ }
}

function rpgGainXp(roomId, p, amount) {
  p.xp += amount;
  const nl = 1 + Math.floor(p.xp / 150);
  if (nl > p.level) {
    p.level = nl; p.maxHp += 12; p.hp = p.maxHp;
    rpg.to(roomId).emit('fx', { type: 'levelup', x: p.x, y: p.y });
    rpg.to(roomId).emit('feed', `${p.name} naik level ${nl}!`);
  }
}

function rpgDamage(roomId, target, dmg, attacker, cause) {
  const room = rpgRooms.get(roomId);
  if (!room || !target.alive) return;
  if (inTown(target)) return; // kota zona aman
  if (target.duelWith && attacker && attacker.id !== target.duelWith) return; // duel privat
  target.hp -= dmg;
  rpg.to(roomId).emit('fx', { type: 'hit', x: target.x, y: target.y });
  if (target.hp > 0) return;
  target.hp = 0; target.alive = false; target.deaths++;
  if (attacker && attacker.id !== target.id && attacker.alive !== undefined) {
    attacker.kills++;
    rpgGainXp(roomId, attacker, target.isMonster ? target.xp : 100);
    rpg.to(roomId).emit('feed', `${attacker.name} mengalahkan ${target.name} [${cause}]`);
    if (target.duelWith === attacker.id || attacker.duelWith === target.id) {
      rpg.to(roomId).emit('duelEnd', { winner: attacker.name, loser: target.name });
      rpg.to(roomId).emit('feed', `DUEL dimenangkan ${attacker.name}!`);
      rpgSubmit(attacker.token, 60);
      attacker.duelWith = null; target.duelWith = null;
    }
  } else {
    rpg.to(roomId).emit('feed', `${target.name} tumbang (${cause})`);
  }
  setTimeout(() => rpgRespawn(roomId, target.id), 3000);
}

function rpgRespawn(roomId, pid) {
  const room = rpgRooms.get(roomId);
  const p = room?.players.get(pid);
  if (!room || !p || p.alive) return;
  p.x = TOWN.x + 40 + Math.random() * (TOWN.w - 80);
  p.y = TOWN.y + 40 + Math.random() * (TOWN.h - 80);
  p.hp = p.maxHp; p.mp = p.maxMp; p.alive = true;
}

function rpgSpawnMonster(room) {
  const t = MON_TYPES[Math.floor(Math.random() * MON_TYPES.length)];
  room.monsters.push({
    id: 'm' + Math.random().toString(36).slice(2, 8),
    kind: t.kind, x: 200 + Math.random() * (RW - 400), y: 350 + Math.random() * (RH - 450),
    hp: t.hp, maxHp: t.hp, dmg: t.dmg, xp: t.xp, speed: t.speed, color: t.color,
    alive: true, lastAtk: 0, wx: 0, wy: 0, wt: 0,
  });
}

rpg.on('connection', (socket) => {
  let roomId = 'LOBBY';
  let me = null;

  socket.on('join', ({ name, room: roomName, cls, token }) => {
    roomId = String(roomName || 'LOBBY').toUpperCase().slice(0, 8);
    const room = rpgRoom(roomId);
    if (room.players.size >= 6) { socket.emit('errorMsg', 'Room penuh (6 max)'); return; }
    const c = CLASSES[cls] ? cls : 'warrior';
    me = {
      id: socket.id, name: String(name || 'Player').slice(0, 12) || 'Player',
      cls: c, token: String(token || ''), color: rpgColors[room.players.size % rpgColors.length],
      x: TOWN.x + 40 + Math.random() * 180, y: TOWN.y + 40 + Math.random() * 120,
      dir: 1, maxHp: CLASSES[c].hp, hp: CLASSES[c].hp, maxMp: 100, mp: 100,
      level: 1, xp: 0, kills: 0, deaths: 0, potions: 2, alive: true,
      lari: false, lastAtk: 0, lastS1: 0, lastS2: 0, lastS3: 0, duelWith: null,
    };
    room.players.set(socket.id, me);
    socket.join(roomId);
    socket.emit('joined', { id: socket.id, roomId, classes: CLASSES, world: { w: RW, h: RH, town: TOWN, pond: POND, houses: HOUSES } });
    rpg.to(roomId).emit('feed', `${me.name} masuk sebagai ${CLASSES[c].name}.`);
    while (room.monsters.filter((m) => m.alive).length < 5) rpgSpawnMonster(room);
  });

  socket.on('input', (d = {}) => {
    const room = rpgRooms.get(roomId);
    const p = me && room?.players.get(socket.id);
    if (!p || !p.alive) return;
    let dx = Number(d.dx) || 0, dy = Number(d.dy) || 0;
    const len = Math.hypot(dx, dy) || 1;
    if (dx || dy) { dx /= len; dy /= len; p.dir = dx < 0 ? -1 : dx > 0 ? 1 : p.dir; }
    if (typeof d.lari === 'boolean') p.lari = d.lari;
    const slowed = Date.now() < p.slowUntil || Math.hypot(p.x - POND.x, p.y - POND.y) < POND.r;
    const spd = CLASSES[p.cls].speed * (p.lari ? 1.6 : 1) * (slowed ? 0.55 : 1);
    let nx = Math.max(16, Math.min(RW - 16, p.x + dx * spd));
    let ny = Math.max(16, Math.min(RH - 16, p.y + dy * spd));
    for (const h of HOUSES) {
      if (nx > h.x - 12 && nx < h.x + h.w + 12 && ny > h.y - 12 && ny < h.y + h.h + 12) { nx = p.x; ny = p.y; break; }
    }
    p.x = nx; p.y = ny;
  });

  function targetsInRange(p, range) {
    const room = rpgRooms.get(roomId);
    const out = [];
    for (const o of room.players.values()) {
      if (o.id === p.id || !o.alive) continue;
      if (dist(p, o) <= range) out.push(o);
    }
    for (const m of room.monsters) {
      if (!m.alive) continue;
      if (Math.hypot(p.x - m.x, p.y - m.y) <= range) out.push(Object.assign(m, { isMonster: true }));
    }
    return out;
  }

  socket.on('act', (d = {}) => {
    const room = rpgRooms.get(roomId);
    const p = me && room?.players.get(socket.id);
    if (!p || !p.alive) return;
    const now = Date.now();
    const C = CLASSES[p.cls];
    const kind = d.kind;
    if (kind === 'basic' && now - p.lastAtk > C.atk.cd) {
      p.lastAtk = now;
      rpg.to(roomId).emit('fx', { type: 'swing', x: p.x, y: p.y, dir: p.dir });
      for (const t of targetsInRange(p, C.atk.range)) {
        rpgGainXp(roomId, p, 5);
        if (t.isMonster) {
          t.hp -= C.atk.dmg;
          rpg.to(roomId).emit('fx', { type: 'hit', x: t.x, y: t.y });
          if (t.hp <= 0) {
            t.alive = false; p.kills++;
            rpgGainXp(roomId, p, t.xp);
            if (Math.random() < 0.3) { p.potions++; rpg.to(roomId).emit('feed', `${p.name} dapat potion!`); }
            rpg.to(roomId).emit('feed', `${p.name} mengalahkan ${t.kind}.`);
            setTimeout(() => { t.hp = t.maxHp; t.alive = true; t.x = 200 + Math.random() * (RW - 400); t.y = 350 + Math.random() * (RH - 450); }, 8000);
          }
        } else rpgDamage(roomId, t, C.atk.dmg, p, C.atk.name);
      }
    } else if (kind === 's1' && now - p.lastS1 > C.skill.cd && p.mp >= C.skill.cost) {
      p.lastS1 = now; p.mp -= C.skill.cost;
      if (p.cls === 'warrior') {
        p.x = Math.max(16, Math.min(RW - 16, p.x + p.dir * 90));
        for (const t of targetsInRange(p, 70)) {
          if (t.isMonster) { t.hp -= 20; rpg.to(roomId).emit('fx', { type: 'hit', x: t.x, y: t.y }); if (t.hp <= 0) { t.alive = false; p.kills++; rpgGainXp(roomId, p, t.xp); setTimeout(() => { t.hp = t.maxHp; t.alive = true; }, 8000); } }
          else rpgDamage(roomId, t, 20, p, C.skill.name);
        }
        rpg.to(roomId).emit('fx', { type: 'dash', x: p.x, y: p.y, dir: p.dir });
      } else if (p.cls === 'mage') {
        for (const t of targetsInRange(p, 115)) {
          if (t.isMonster) { t.hp -= 22; if (t.hp <= 0) { t.alive = false; p.kills++; rpgGainXp(roomId, p, t.xp); setTimeout(() => { t.hp = t.maxHp; t.alive = true; }, 8000); } }
          else { t.slowUntil = now + 3000; rpgDamage(roomId, t, 22, p, C.skill.name); }
        }
        rpg.to(roomId).emit('fx', { type: 'frost', x: p.x, y: p.y });
      } else {
        for (const a of [-0.25, 0, 0.25]) {
          room.projs.push({ id: Math.random().toString(36).slice(2), x: p.x, y: p.y, vx: p.dir * 9 * Math.cos(a), vy: Math.sin(a) * 9, r: 4, dmg: 14, owner: p.id, ownerName: p.name, kind: 'arrow', life: 60 });
        }
        rpg.to(roomId).emit('fx', { type: 'shoot', x: p.x, y: p.y });
      }
    } else if (kind === 's2' && now - p.lastS2 > 10000 && p.mp >= 30) {
      p.lastS2 = now; p.mp -= 30;
      for (const t of targetsInRange(p, 95)) {
        if (t.isMonster) { t.hp -= 22; if (t.hp <= 0) { t.alive = false; p.kills++; rpgGainXp(roomId, p, t.xp); setTimeout(() => { t.hp = t.maxHp; t.alive = true; }, 8000); } }
        else rpgDamage(roomId, t, 22, p, 'Nova');
      }
      rpg.to(roomId).emit('fx', { type: 'nova', x: p.x, y: p.y });
    } else if (kind === 's3' && now - p.lastS3 > 12000 && p.mp >= 30) {
      p.lastS3 = now; p.mp -= 30;
      p.hp = Math.min(p.maxHp, p.hp + 40);
      rpg.to(roomId).emit('fx', { type: 'heal', x: p.x, y: p.y });
    } else if (kind === 'tas' && p.potions > 0 && p.hp < p.maxHp) {
      p.potions--; p.hp = Math.min(p.maxHp, p.hp + 60);
      rpg.to(roomId).emit('fx', { type: 'heal', x: p.x, y: p.y });
    }
  });

  socket.on('chat', ({ text }) => {
    const room = rpgRooms.get(roomId);
    if (!room || !me) return;
    const clean = String(text || '').slice(0, 60).trim();
    if (!clean) return;
    rpg.to(roomId).emit('chat', { name: me.name, text: clean });
  });

  socket.on('challenge', ({ to }) => {
    const room = rpgRooms.get(roomId);
    const target = room?.players.get(to);
    if (!room || !me || !target || to === socket.id) return;
    if (me.duelWith || target.duelWith) { socket.emit('errorMsg', 'Salah satu sedang duel.'); return; }
    target.duelOfferFrom = socket.id;
    socket.to(to).emit('duelOffer', { from: socket.id, name: me.name });
  });

  socket.on('accept', ({ from }) => {
    const room = rpgRooms.get(roomId);
    const a = room?.players.get(from);
    const b = me && room?.players.get(socket.id);
    if (!a || !b || b.duelOfferFrom !== from) return;
    a.duelWith = socket.id; b.duelWith = from;
    delete b.duelOfferFrom;
    rpg.to(roomId).emit('duelStart', { a: a.name, b: b.name });
    rpg.to(roomId).emit('feed', `DUEL: ${a.name} vs ${b.name}!`);
    setTimeout(() => {
      if (a.duelWith === socket.id && b.duelWith === from) {
        a.duelWith = null; b.duelWith = null;
        rpg.to(roomId).emit('duelEnd', { winner: null, loser: null, draw: true });
      }
    }, 90000);
  });

  socket.on('decline', ({ from }) => {
    const room = rpgRooms.get(roomId);
    const target = me && room?.players.get(socket.id);
    if (target) delete target.duelOfferFrom;
    if (room?.players.get(from)) {
      socket.to(from).emit('feed', `${me?.name || '?'} menolak duel.`);
    }
  });

  socket.on('recall', () => {
    const room = rpgRooms.get(roomId);
    const p = me && room?.players.get(socket.id);
    if (!p || !p.alive) return;
    if (Date.now() - (p.lastRecall || 0) < 30000) { socket.emit('errorMsg', 'Recall cooldown 30 detik.'); return; }
    p.lastRecall = Date.now();
    p.x = TOWN.x + TOWN.w / 2; p.y = TOWN.y + TOWN.h / 2;
    rpg.to(roomId).emit('fx', { type: 'heal', x: p.x, y: p.y });
  });

  socket.on('disconnect', () => {
    const room = rpgRooms.get(roomId);
    if (room && me) {
      room.players.delete(socket.id);
      if (me.kills > 0) rpgSubmit(me.token, me.kills * 10);
      rpg.to(roomId).emit('feed', `${me.name} keluar (${me.kills}K/${me.deaths}D).`);
      if (room.players.size === 0) setTimeout(() => { if (rpgRooms.get(roomId)?.players.size === 0) rpgRooms.delete(roomId); }, 60000);
    }
  });
});

// RPG tick 20Hz: regen, monster AI, proyektil, broadcast
setInterval(() => {
  for (const [rid, room] of rpgRooms) {
    let changed = false;
    for (const p of room.players.values()) {
      if (!p.alive) continue;
      p.mp = Math.min(p.maxMp, p.mp + 6 / 20);
      if (inTown(p)) p.hp = Math.min(p.maxHp, p.hp + 5 / 20);
      changed = true;
    }
    for (const m of room.monsters) {
      if (!m.alive) continue;
      let best = null, bd = 320;
      for (const p of room.players.values()) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) {
        const dx = (best.x - m.x) / (bd || 1), dy = (best.y - m.y) / (bd || 1);
        m.x = Math.max(16, Math.min(RW - 16, m.x + dx * m.speed));
        m.y = Math.max(16, Math.min(RH - 16, m.y + dy * m.speed));
        if (bd < 36 && Date.now() - m.lastAtk > 900) {
          m.lastAtk = Date.now();
          rpgDamage(rid, best, m.dmg, null, m.kind);
        }
      } else if (Date.now() > m.wt) {
        m.wx = m.x + (Math.random() - 0.5) * 120;
        m.wy = m.y + (Math.random() - 0.5) * 120;
        m.wt = Date.now() + 2500;
      } else {
        m.x += Math.sign(m.wx - m.x) * 0.5;
        m.y += Math.sign(m.wy - m.y) * 0.5;
      }
      changed = true;
    }
    if (room.projs.length) {
      const keep = [];
      for (const pr of room.projs) {
        pr.life--; pr.x += pr.vx; pr.y += pr.vy;
        let dead = pr.life <= 0 || pr.x < 0 || pr.x > RW || pr.y < 0 || pr.y > RH;
        if (!dead) {
          for (const o of room.players.values()) {
            if (o.id === pr.owner || !o.alive) continue;
            if (Math.hypot(pr.x - o.x, pr.y - o.y) < pr.r + 12) {
              const owner = room.players.get(pr.owner);
              if (owner) rpgGainXp(rid, owner, 5);
              rpgDamage(rid, o, pr.dmg, owner && owner.id !== o.id ? owner : null, 'Panah');
              rpg.to(rid).emit('fx', { type: 'hit', x: pr.x, y: pr.y });
              dead = true; break;
            }
          }
          if (!dead) for (const mo of room.monsters) {
            if (!mo.alive) continue;
            if (Math.hypot(pr.x - mo.x, pr.y - mo.y) < pr.r + 12) {
              mo.hp -= pr.dmg;
              rpg.to(rid).emit('fx', { type: 'hit', x: pr.x, y: pr.y });
              if (mo.hp <= 0) {
                mo.alive = false;
                const owner = room.players.get(pr.owner);
                if (owner) { owner.kills++; rpgGainXp(rid, owner, mo.xp); }
                rpg.to(rid).emit('feed', `${room.players.get(pr.owner)?.name || '?'} menembak ${mo.kind}.`);
                setTimeout(() => { mo.hp = mo.maxHp; mo.alive = true; }, 8000);
              }
              dead = true; break;
            }
          }
        }
        if (!dead) keep.push(pr);
      }
      room.projs = keep; changed = true;
    }
    if (changed || room.players.size) {
      rpg.to(rid).emit('state', {
        players: [...room.players.values()].map((p) => ({
          id: p.id, name: p.name, cls: p.cls, color: p.color, x: Math.round(p.x), y: Math.round(p.y),
          dir: p.dir, hp: Math.round(p.hp), maxHp: p.maxHp, mp: Math.round(p.mp), maxMp: p.maxMp,
          level: p.level, kills: p.kills, deaths: p.deaths, alive: p.alive,
          potions: p.potions, duelWith: p.duelWith,
          cd: { atk: 0, s1: Math.max(0, p.lastS1 + CLASSES[p.cls].skill.cd - Date.now()), s2: Math.max(0, p.lastS2 + 10000 - Date.now()), s3: Math.max(0, p.lastS3 + 12000 - Date.now()) },
        })),
        monsters: room.monsters.filter((m) => m.alive).map((m) => ({ id: m.id, kind: m.kind, x: Math.round(m.x), y: Math.round(m.y), hp: Math.round(m.hp), maxHp: m.maxHp, color: m.color })),
        projs: room.projs,
      });
    }
  }
}, 1000 / 20);

app.get('/rpg', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rpg.html')));

/* ============ CATUR DUEL real-time (namespace /chess) ============
   join {room,name,side,token} -> state broadcast; move tervalidasi server. */
const ch = io.of('/chess');
const chessRooms = new Map(); // roomId -> { game, white:{...}, black:{...}, status, winner }

function chessState(room) {
  const g = room.game;
  const last = g.history({ verbose: true }).slice(-1)[0];
  return {
    fen: g.fen(), turn: g.turn(),
    lastMove: last ? { from: last.from, to: last.to } : null,
    inCheck: g.inCheck(), over: g.isGameOver(),
    checkmate: g.isCheckmate(), draw: !g.isCheckmate() && g.isDraw(),
    white: room.white ? { name: room.white.name } : null,
    black: room.black ? { name: room.black.name } : null,
    status: room.status, winner: room.winner || null,
  };
}

async function chessSubmit(token, points) {
  if (!WA_KEY || !token || token === '__PTOK__') return;
  try {
    await fetch(WA_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: WA_KEY, token, game: 'chess', points: Math.min(40, points) }),
    });
  } catch { /* abaikan */ }
}

ch.on('connection', (socket) => {
  let roomId = null;

  socket.on('join', ({ room: roomName, name, side, token }) => {
    roomId = String(roomName || 'LOBBY').toUpperCase().slice(0, 8);
    if (!chessRooms.has(roomId)) {
      chessRooms.set(roomId, { game: new Chess(), white: null, black: null, status: 'waiting', winner: null });
    }
    const room = chessRooms.get(roomId);
    const nm = String(name || 'Player').slice(0, 12) || 'Player';
    const tk = String(token || '');
    const slot = side === 'w' ? 'white' : side === 'b' ? 'black' : null;
    if (slot) {
      const cur = room[slot];
      if (!cur || (tk && cur.token === tk)) {
        room[slot] = { name: nm, token: tk, socket: socket.id };
        if (room.white && room.black) room.status = 'playing';
      } else {
        socket.emit('errorMsg', 'Sisi sudah diambil pemain lain.');
      }
    }
    socket.join(roomId);
    socket.emit('joined', { id: socket.id, roomId, side: room.white?.socket === socket.id ? 'w' : room.black?.socket === socket.id ? 'b' : null });
    ch.to(roomId).emit('state', chessState(room));
  });

  socket.on('select', ({ square }) => {
    const room = roomId && chessRooms.get(roomId);
    if (!room) return;
    const g = room.game;
    const side = room.white?.socket === socket.id ? 'w' : room.black?.socket === socket.id ? 'b' : null;
    if (!side || g.turn() !== side || g.isGameOver()) { socket.emit('legal', { moves: [] }); return; }
    try {
      const ms = g.moves({ square, verbose: true }).filter((m) => m.color === side).map((m) => m.to);
      socket.emit('legal', { moves: ms });
    } catch { socket.emit('legal', { moves: [] }); }
  });

  socket.on('move', ({ from, to, promotion }) => {    const room = roomId && chessRooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    const g = room.game;
    if (g.isGameOver()) return;
    const side = room.white?.socket === socket.id ? 'w' : room.black?.socket === socket.id ? 'b' : null;
    if (!side || g.turn() !== side) { socket.emit('errorMsg', 'Bukan giliranmu.'); return; }
    let mv = null;
    try { mv = g.move({ from, to, promotion: promotion || 'q' }); } catch { mv = null; }
    if (!mv) { socket.emit('errorMsg', 'Langkah ilegal.'); return; }
    if (g.isGameOver()) {
      room.status = 'over';
      if (g.isCheckmate()) {
        const winner = g.turn() === 'w' ? room.black : room.white;
        const loser = g.turn() === 'w' ? room.white : room.black;
        room.winner = winner?.name || null;
        if (winner?.token) chessSubmit(winner.token, 40);
        if (loser?.token) chessSubmit(loser.token, 10);
      }
    }
    ch.to(roomId).emit('state', chessState(room));
  });

  socket.on('disconnect', () => {
    if (!roomId) return;
    const room = chessRooms.get(roomId);
    if (!room) return;
    if (room.white?.socket === socket.id) room.white.socket = null;
    if (room.black?.socket === socket.id) room.black.socket = null;
    if (!room.white?.socket && !room.black?.socket) {
      setTimeout(() => {
        const r = chessRooms.get(roomId);
        if (r && !r.white?.socket && !r.black?.socket) chessRooms.delete(roomId);
      }, 60000);
    }
  });
});
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, () => {
  console.log(`RPG PvP Arena: http://localhost:${PORT}/`);
  console.log(`WA hook: POST http://localhost:${PORT}/api/wa/arena`);
  console.log(`WA score: ${WA_KEY ? 'aktif' : 'nonaktif (isi ARENA_WA_KEY)'}`);
});
