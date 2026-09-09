// Store: Postgres jika DATABASE_URL ada, fallback JSON file di ./data/db.json.
// Cache: Redis jika REDIS_URL ada, fallback Map memory + TTL.
// Sengaja tanpa Prisma runtime agar tetap jalan di Termux/laptop tanpa build.
import fs from 'fs';
import path from 'path';

const DATA_DIR = new URL('../../data/', import.meta.url).pathname;
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJson() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { users: {}, scores: [], groups: {}, products: [], orders: [], notes: {}, matches: [] };
  }
}
let json = loadJson();
function saveJson() {
  fs.writeFileSync(DB_FILE, JSON.stringify(json, null, 2));
}

// --- Postgres opsional ---
let pgPool = null;
if (process.env.DATABASE_URL) {
  const { default: pg } = await import('pg').catch(() => ({ default: null }));
  if (pg) {
    pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    pgPool.on('error', (e) => console.log('⚠️ pg error:', e.message));
    // auto-migrate minimal
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (jid TEXT PRIMARY KEY, name TEXT, xp INT DEFAULT 0, level INT DEFAULT 1, balance INT DEFAULT 0);
      CREATE TABLE IF NOT EXISTS scores (id SERIAL PRIMARY KEY, jid TEXT, game TEXT, points INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE IF NOT EXISTS group_settings (jid TEXT PRIMARY KEY, welcome BOOLEAN DEFAULT false, antilink BOOLEAN DEFAULT false);
      CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT, price INT, stock INT DEFAULT 0);
      CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, customer TEXT, items JSONB, total INT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE IF NOT EXISTS messages_log (id SERIAL PRIMARY KEY, jid TEXT, sender TEXT, body TEXT, created_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE IF NOT EXISTS broadcasts (id SERIAL PRIMARY KEY, targets JSONB, body TEXT, run_at TIMESTAMPTZ, sent BOOLEAN DEFAULT false);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS matches (id SERIAL PRIMARY KEY, jid TEXT, game TEXT, p1 TEXT, p2 TEXT, winner TEXT, created_at TIMESTAMPTZ DEFAULT now());
    `).catch((e) => console.log('⚠️ migrate:', e.message));
    // pg = sumber utama, json = cache baca + fallback offline.
    // Boot: pg -> json (editan panel terlihat bot). Bila pg masih kosong tapi
    // json ada isi (migrasi dari mode lama): json -> pg sekali, majukan sequence.
    try {
      const [g, p, o] = await Promise.all([
        pgPool.query('SELECT * FROM group_settings'),
        pgPool.query('SELECT * FROM products ORDER BY id'),
        pgPool.query('SELECT * FROM orders ORDER BY id'),
      ]);
      const pgEmpty = !g.rows.length && !p.rows.length && !o.rows.length;
      const jsonFull = Object.keys(json.groups).length || json.products.length || json.orders.length;
      if (pgEmpty && jsonFull) {
        for (const [jid, s] of Object.entries(json.groups))
          await pgPool.query(`INSERT INTO group_settings (jid,welcome,antilink) VALUES ($1,$2,$3) ON CONFLICT (jid) DO NOTHING`, [jid, !!s.welcome, !!s.antilink]);
        for (const pr of json.products)
          await pgPool.query(`INSERT INTO products (name,price,stock) VALUES ($1,$2,$3)`, [pr.name, pr.price, pr.stock]);
        for (const or of json.orders)
          await pgPool.query(`INSERT INTO orders (customer,items,total,status) VALUES ($1,$2::jsonb,$3,$4)`, [or.customer, JSON.stringify(or.items || []), or.total || 0, or.status || 'pending']);
        const [np, no] = await Promise.all([
          pgPool.query('SELECT * FROM products ORDER BY id'),
          pgPool.query('SELECT * FROM orders ORDER BY id'),
        ]);
        json.products = np.rows; json.orders = no.rows.map((r) => ({ ...r, items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items }));
        console.log('✅ JSON lama dimigrasi ke Postgres');
      } else {
        json.groups = Object.fromEntries(g.rows.map((r) => [r.jid, { welcome: !!r.welcome, antilink: !!r.antilink, antispam: false }]));
        json.products = p.rows;
        json.orders = o.rows.map((r) => ({ ...r, items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items }));
      }
      saveJson();
    } catch (e) { console.log('⚠️ sync pg<->json:', e.message); }
    console.log('✅ Postgres connected');
  }
}

export const db = {
  usePg: !!pgPool,
  save() { saveJson(); },
  // users
  async addXp(jid, name, xp) {
    if (pgPool) {
      await pgPool.query(
        `INSERT INTO users (jid,name,xp,level) VALUES ($1,$2,$3,1)
         ON CONFLICT (jid) DO UPDATE SET xp = users.xp + $3, name=$2`,
        [jid, name, xp]
      );
      const { rows } = await pgPool.query('SELECT * FROM users WHERE jid=$1', [jid]);
      return rows[0];
    }
    const u = json.users[jid] || { jid, name, xp: 0, level: 1, balance: 0 };
    u.xp += xp; u.name = name;
    u.level = 1 + Math.floor(u.xp / 500);
    json.users[jid] = u; saveJson();
    return u;
  },
  async topScores(limit = 10) {
    if (pgPool) {
      const { rows } = await pgPool.query(
        `SELECT jid, SUM(points) s FROM scores GROUP BY jid ORDER BY s DESC LIMIT $1`, [limit]
      );
      return rows;
    }
    const map = {};
    for (const s of json.scores) map[s.jid] = (map[s.jid] || 0) + s.points;
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit)
      .map(([jid, s]) => ({ jid, s }));
  },
  async topScoresByGame(game, limit = 10) {
    if (pgPool) {
      const { rows } = await pgPool.query(
        `SELECT jid, SUM(points) s FROM scores WHERE game=$1 GROUP BY jid ORDER BY s DESC LIMIT $2`, [game, limit]
      );
      return rows;
    }
    const map = {};
    for (const s of json.scores.filter((x) => x.game === game)) map[s.jid] = (map[s.jid] || 0) + s.points;
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit)
      .map(([jid, s]) => ({ jid, s }));
  },
  async addScore(jid, game, points) {
    if (pgPool) { await pgPool.query('INSERT INTO scores (jid,game,points) VALUES ($1,$2,$3)', [jid, game, points]); return; }
    json.scores.push({ jid, game, points, at: Date.now() }); saveJson();
  },
  group(jid) {
    return json.groups[jid] || { welcome: false, antilink: false, antispam: false };
  },
  async saveGroup(jid, v) {
    json.groups[jid] = v; saveJson();
    if (pgPool) await pgPool.query(
      `INSERT INTO group_settings (jid,welcome,antilink) VALUES ($1,$2,$3)
       ON CONFLICT (jid) DO UPDATE SET welcome=$2, antilink=$3`,
      [jid, !!v.welcome, !!v.antilink]).catch((e) => console.log('⚠️ saveGroup:', e.message));
  },
  get products() { return json.products; },
  get orders() { return json.orders; },
  async addProduct(p) {
    if (pgPool) {
      const { rows } = await pgPool.query(
        'INSERT INTO products (name,price,stock) VALUES ($1,$2,$3) RETURNING *',
        [p.name, p.price, p.stock || 0]);
      json.products.push(rows[0]); saveJson();
      return rows[0];
    }
    p.id = Date.now(); json.products.push(p); saveJson(); return p;
  },
  async setStock(id, stock) {
    if (pgPool) {
      await pgPool.query('UPDATE products SET stock=$1 WHERE id=$2', [stock, id]);
      const pr = json.products.find((x) => String(x.id) === String(id));
      if (pr) pr.stock = stock; saveJson();
      return;
    }
    const pr = json.products.find((x) => String(x.id) === String(id));
    if (pr) pr.stock = stock; saveJson();
  },
  async addOrder(o) {
    if (pgPool) {
      const { rows } = await pgPool.query(
        'INSERT INTO orders (customer,items,total) VALUES ($1,$2::jsonb,$3) RETURNING *',
        [o.customer, JSON.stringify(o.items || []), o.total || 0]);
      const row = { ...rows[0], items: typeof rows[0].items === 'string' ? JSON.parse(rows[0].items) : rows[0].items };
      json.orders.push(row); saveJson();
      return row;
    }
    o.id = Date.now(); o.status = 'pending'; json.orders.push(o); saveJson(); return o;
  },
  async getOrder(id) {
    if (pgPool) {
      const { rows } = await pgPool.query('SELECT * FROM orders WHERE id=$1', [id]);
      if (!rows.length) return null;
      const r = rows[0];
      return { ...r, items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items };
    }
    return json.orders.find((x) => String(x.id) === String(id));
  },
  async addMatch({ jid, game, p1, p2, winner }) {
    if (pgPool) {
      await pgPool.query('INSERT INTO matches (jid,game,p1,p2,winner) VALUES ($1,$2,$3,$4,$5)', [jid, game, p1, p2, winner]);
      return;
    }
    json.matches = json.matches || [];
    json.matches.push({ jid, game, p1, p2, winner, at: Date.now() }); saveJson();
  },
};

// --- Cache (Redis / memory) ---
const mem = new Map();
let redisCli = null;
if (process.env.REDIS_URL) {
  const { createClient } = await import('redis').catch(() => ({ createClient: null }));
  if (createClient) {
    redisCli = createClient({ url: process.env.REDIS_URL });
    redisCli.on('error', (e) => console.log('⚠️ redis:', e.message));
    await redisCli.connect().then(() => console.log('✅ Redis connected')).catch(() => { redisCli = null; });
  }
}
export const cache = {
  async get(k) {
    if (redisCli) return redisCli.get(k);
    const v = mem.get(k);
    if (!v) return null;
    if (v.exp < Date.now()) { mem.delete(k); return null; }
    return v.val;
  },
  async set(k, val, ttlSec = 120) {
    if (redisCli) return redisCli.set(k, val, { EX: ttlSec });
    mem.set(k, { val, exp: Date.now() + ttlSec * 1000 });
  },
  async del(k) {
    if (redisCli) return redisCli.del(k);
    mem.delete(k);
  },
};
