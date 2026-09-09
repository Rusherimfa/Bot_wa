import { general } from './general.js';
import { group } from './group.js';
import { game } from './game.js';
import { rpgchat } from './rpgchat.js';
import { chessCmd } from './chess.js';
import { media } from './media.js';
import { ai } from './ai.js';
import { store } from './store.js';
import { util } from './util.js';
import { system } from './system.js';
import { loadPlugins } from '../core/dynamic.js';

const baseCommands = [...general, ...group, ...game, ...rpgchat, ...chessCmd, ...media, ...ai, ...store, ...util, ...system];

// Plugin dinamis (data/plugins/*.js), bisa di-reload tanpa restart via !reloadplugin.
export async function reloadDynamic() {
  const fresh = await loadPlugins();
  for (let i = allCommands.length - 1; i >= 0; i--) {
    if (allCommands[i].__file) allCommands.splice(i, 1);
  }
  for (const d of fresh) allCommands.push(d);
  return fresh.length;
}
export const allCommands = [...baseCommands];

// Kategori untuk !menu <kategori>. Diurut sesuai urutan tampil.
export const categories = [
  { id: 'game', title: 'GAME', cmds: [...game, ...chessCmd] },
  { id: 'rpg', title: 'RPG CHAT (main di chat)', cmds: rpgchat },
  { id: 'grup', title: 'GRUP', cmds: group },
  { id: 'media', title: 'MEDIA', cmds: media },
  { id: 'ai', title: 'AI', cmds: ai },
  { id: 'toko', title: 'TOKO', cmds: store },
  { id: 'util', title: 'UTILITAS', cmds: util },
  { id: 'sistem', title: 'SISTEM (plugin/case/owner)', cmds: system },
  { id: 'umum', title: 'UMUM', cmds: general },
];
