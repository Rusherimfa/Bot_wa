import { listOwners, addOwner, delOwner } from '../core/owners.js';
import { loadPlugins, addPlugin, delPlugin, getPlugin, listCases, addCase, delCase } from '../core/dynamic.js';

export const system = [
  {
    name: 'listplugin', aliases: ['plugins'], desc: 'Daftar plugin dinamis', ownerOnly: true,
    async run({ send }) {
      const all = await loadPlugins();
      if (!all.length) return send('Belum ada plugin. Tambah dengan !addplugin <nama> <kode>');
      await send('*PLUGIN*\n' + all.map((p) => `- ${p.name} (${p.__file})${p.desc ? ' — ' + p.desc : ''}`).join('\n'));
    },
  },
  {
    name: 'addplugin', desc: '!addplugin <nama> <kode js> (owner)', ownerOnly: true,
    async run({ args, raw, send }) {
      const name = args[0];
      const code = raw.slice((args[0] || '').length).trim();
      if (!name || !code) return send('Format: !addplugin sapaan export const sapaan = { name: "sapaan", run: async ({send}) => send("halo") }');
      try {
        const safe = await addPlugin(name, code);
        await send(`Plugin ${safe} ditambah. Muat ulang dengan !reloadplugin.`);
      } catch (e) { await send(`Gagal: ${e.message}`); }
    },
  },
  {
    name: 'delplugin', desc: '!delplugin <nama> (owner)', ownerOnly: true,
    async run({ args, send }) {
      try { await send(`Plugin ${delPlugin(args[0] || '')} dihapus. Muat ulang dengan !reloadplugin.`); }
      catch (e) { await send(`Gagal: ${e.message}`); }
    },
  },
  {
    name: 'getplugin', desc: '!getplugin <nama> (owner)', ownerOnly: true,
    async run({ args, send }) {
      try { await send('```js\n' + getPlugin(args[0] || '') + '\n```'); }
      catch (e) { await send(`Gagal: ${e.message}`); }
    },
  },
  {
    name: 'reloadplugin', aliases: ['reload'], desc: 'Muat ulang plugin (owner)', ownerOnly: true,
    async run({ send }) {
      const { reloadDynamic } = await import('../index.js');
      const n = await reloadDynamic();
      await send(`Plugin dimuat ulang. Aktif: ${n}.`);
    },
  },
  {
    name: 'listcase', aliases: ['cases'], desc: 'Daftar case kustom',
    async run({ send }) {
      const all = listCases();
      if (!all.length) return send('Belum ada case. Tambah dengan !addcase pola | balasan');
      await send('*CASE*\n' + all.map((c) => `#${c.id} "${c.pattern}" -> "${c.response.slice(0, 60)}"`).join('\n'));
    },
  },
  {
    name: 'addcase', desc: '!addcase <pola> | <balasan> (owner)', ownerOnly: true,
    async run({ raw, send }) {
      const [pattern, ...rest] = raw.split('|');
      const response = rest.join('|').trim();
      if (!pattern?.trim() || !response) return send('Format: !addcase selamat pagi | Selamat pagi juga!');
      const id = addCase(pattern.trim(), response);
      await send(`Case #${id} ditambah. Cocok otomatis bila ada yang mengetik "${pattern.trim()}" (tanpa prefix).`);
    },
  },
  {
    name: 'delcase', desc: '!delcase <id> (owner)', ownerOnly: true,
    async run({ args, send }) {
      delCase(args[0]);
      await send(`Case #${args[0]} dihapus (bila ada).`);
    },
  },
  {
    name: 'owners', aliases: ['ownerlist'], desc: 'Daftar owner',
    async run({ send }) {
      await send('*OWNER*\n' + listOwners().map((o) => '- ' + o.split('@')[0]).join('\n'));
    },
  },
  {
    name: 'addowner', desc: '!addowner <nomor> (owner)', ownerOnly: true,
    async run({ args, m, send }) {
      const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        || (args[0] ? args[0].replace(/\D/g, '') + '@s.whatsapp.net' : null);
      if (!target) return send('Gunakan: !addowner 628... atau !addowner @tag');
      await send(`Owner ditambah: ${addOwner(target).split('@')[0]}`);
    },
  },
  {
    name: 'delowner', desc: '!delowner <nomor> (owner)', ownerOnly: true,
    async run({ args, send }) {
      if (!args[0]) return send('Gunakan: !delowner 628...');
      delOwner(args[0]);
      await send('Owner dihapus (bila ada).');
    },
  },
];
