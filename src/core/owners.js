// Owner: OWNER_JID env selalu owner + daftar di data/owners.json.
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

const FILE = new URL('../../data/owners.json', import.meta.url).pathname;

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

export function listOwners() {
  const all = [...load()];
  if (config.ownerJid && !all.includes(config.ownerJid)) all.unshift(config.ownerJid);
  return all;
}

export function isOwner(jid) {
  if (!jid) return false;
  const norm = (s) => String(s).split('@')[0].replace(/\D/g, '');
  const n = norm(jid);
  return listOwners().some((o) => norm(o) === n);
}

export function addOwner(jid) {
  const arr = load();
  const norm = String(jid).split('@')[0].replace(/\D/g, '') + '@s.whatsapp.net';
  if (!arr.includes(norm)) arr.push(norm);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(arr, null, 2));
  return norm;
}

export function delOwner(jid) {
  const norm = String(jid).split('@')[0].replace(/\D/g, '');
  const arr = load().filter((o) => String(o).split('@')[0].replace(/\D/g, '') !== norm);
  fs.writeFileSync(FILE, JSON.stringify(arr, null, 2));
  return arr;
}
