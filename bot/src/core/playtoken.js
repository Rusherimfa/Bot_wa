// Token identitas pemain: perintah chat -> game web inline.
// Disimpan di Postgres (dipakai lintas proses bot+arena) atau memori bila tanpa DB.
import { randomBytes } from 'crypto';

const mem = new Map();
let pool = null;

async function pg() {
  if (!process.env.DATABASE_URL) return null;
  try {
    if (!pool) {
      const { default: Pg } = await import('pg');
      pool = new Pg.Pool({ connectionString: process.env.DATABASE_URL });
      pool.on('error', () => {});
      await pool.query('CREATE TABLE IF NOT EXISTS play_tokens(token TEXT PRIMARY KEY, jid TEXT, exp TIMESTAMPTZ)');
    }
    return pool;
  } catch {
    return null;
  }
}

export async function createPlayToken(jid) {
  const token = randomBytes(8).toString('hex');
  const exp = new Date(Date.now() + 3600 * 1000);
  const p = await pg();
  if (p) {
    try {
      await p.query('DELETE FROM play_tokens WHERE exp <= now()').catch(() => {});
      await p.query('INSERT INTO play_tokens(token,jid,exp) VALUES($1,$2,$3)', [token, jid, exp]); return token;
    }
    catch { /* fallback memori */ }
  }
  mem.set(token, { jid, exp: exp.getTime() });
  return token;
}

export async function resolvePlayToken(token) {
  if (!token || typeof token !== 'string') return null;
  const t = token.trim();
  const p = await pg();
  if (p) {
    try {
      const { rows } = await pool.query('SELECT jid FROM play_tokens WHERE token=$1 AND exp > now()', [t]);
      if (rows.length) return rows[0].jid;
      return null;
    } catch { /* fallback memori */ }
  }
  const v = mem.get(t);
  if (!v) return null;
  if (v.exp < Date.now()) { mem.delete(t); return null; }
  return v.jid;
}
