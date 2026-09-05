// Plugin dinamis (file JS di data/plugins) + cases kustom (data/cases.json).
// Plugin: export const <apa saja> = { name, aliases?, desc?, run }.
// Cases: cocok teks masuk (tanpa prefix) -> balas response. Dicek setelah kuis/RPG.
import fs from 'fs';
import path from 'path';

const DIR = new URL('../../data/plugins/', import.meta.url).pathname;
const CASES_FILE = new URL('../../data/cases.json', import.meta.url).pathname;
fs.mkdirSync(DIR, { recursive: true });

export async function loadPlugins() {
  const out = [];
  let files = [];
  try { files = fs.readdirSync(DIR).filter((f) => f.endsWith('.js')); } catch { return out; }
  for (const f of files) {
    try {
      const mod = await import(`../../data/plugins/${f}?t=${Date.now()}`);
      const defs = Object.values(mod).filter((v) => v && typeof v.run === 'function' && v.name);
      for (const d of defs) out.push({ ...d, __file: f });
    } catch (e) { console.log(`⚠️ plugin ${f} gagal dimuat:`, e.message); }
  }
  return out;
}

export async function addPlugin(name, code) {
  const safe = String(name).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!safe) throw new Error('nama tidak valid');
  if (/require\(|process\.exit|child_process|exec\(|eval\(/.test(code)) throw new Error('kode mengandung pola berbahaya');
  const file = path.join(DIR, safe + '.js');
  fs.writeFileSync(file, code);
  // validasi: bisa diimport + punya command beneran
  try {
    const mod = await import(`../../data/plugins/${safe}.js?t=${Date.now()}`);
    const ok = Object.values(mod).some((v) => v && typeof v.run === 'function' && v.name);
    if (!ok) throw new Error('tidak ada command (butuh export { name, run })');
  } catch (e) {
    fs.unlinkSync(file);
    throw new Error('gagal dimuat: ' + e.message);
  }
  return safe;
}

export function delPlugin(name) {
  const safe = String(name).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const file = path.join(DIR, safe + '.js');
  if (!fs.existsSync(file)) throw new Error('plugin tidak ada');
  fs.unlinkSync(file);
  return safe;
}

export function getPlugin(name) {
  const safe = String(name).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const file = path.join(DIR, safe + '.js');
  if (!fs.existsSync(file)) throw new Error('plugin tidak ada');
  return fs.readFileSync(file, 'utf8').slice(0, 1500);
}

// ---- cases ----
function loadCases() {
  try {
    const j = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'));
    return Array.isArray(j) ? j : [];
  } catch { return []; }
}
function saveCases(arr) {
  fs.mkdirSync(path.dirname(CASES_FILE), { recursive: true });
  fs.writeFileSync(CASES_FILE, JSON.stringify(arr, null, 2));
}
export const listCases = loadCases;
export function addCase(pattern, response) {
  const arr = loadCases();
  const id = arr.length ? Math.max(...arr.map((c) => c.id)) + 1 : 1;
  arr.push({ id, pattern, response });
  saveCases(arr);
  return id;
}
export function delCase(id) {
  const arr = loadCases().filter((c) => String(c.id) !== String(id));
  saveCases(arr);
  return arr;
}
export function matchCase(text) {
  const t = text.toLowerCase();
  return loadCases().find((c) => c.pattern && t.includes(c.pattern.toLowerCase())) || null;
}
