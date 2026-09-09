// Anti-ban queue: delay acak + rate-limit per JID + global.
// Gratis tapi aman: jangan kirim > maxPerMinute, jeda 3-8 detik.
import { config } from './config.js';

const q = [];
let busy = false;
const perMin = new Map(); // jid -> [timestamps]

function allowed(jid) {
  const now = Date.now();
  const arr = (perMin.get(jid) || []).filter((t) => now - t < 60000);
  perMin.set(jid, arr);
  return arr.length < config.maxPerMinute;
}
const rnd = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function enqueue(jid, fn) {
  return new Promise((resolve, reject) => {
    q.push({ jid, fn, resolve, reject });
    pump();
  });
}

async function pump() {
  if (busy || !q.length) return;
  busy = true;
  const job = q.shift();
  if (!allowed(job.jid)) {
    // tunda 60 detik biar tidak kena rate-limit WA
    console.log('⏳ rate-limit, tunda 60s untuk', job.jid);
    q.unshift(job);
    busy = false;
    setTimeout(pump, 60000);
    return;
  }
  try {
    await sleep(rnd(config.sendMin, config.sendMax) / 4); // ringan tapi tetap ada jeda
    const res = await job.fn();
    perMin.get(job.jid).push(Date.now());
    job.resolve(res);
  } catch (e) {
    job.reject(e);
  }
  busy = false;
  if (q.length) setTimeout(pump, 500);
}
