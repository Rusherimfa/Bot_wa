import { config } from '../core/config.js';
import { categories } from './index.js';

function menuKategori(cat) {
  const lines = cat.cmds
    .filter((c) => c.name !== '__answer__')
    .map((c) => `!${c.name}${c.aliases?.length ? ` (${c.aliases.map((a) => '!' + a).join(', ')})` : ''}\n  ${c.desc || ''}`);
  return `*${cat.title}*\n\n${lines.join('\n')}\n\nKetik !menu untuk kembali.`;
}

export const general = [
  {
    name: 'menu', aliases: ['help', 'start'], desc: 'Menu utama, !menu <kategori>',
    async run({ send, args }) {
      const key = (args[0] || '').toLowerCase();
      const cat = categories.find((c) => c.id === key);
      if (cat) { await send(menuKategori(cat)); return; }
      await send(`*${config.botName}*
Prefix: ${config.prefixes.join(' ')}

Pilih kategori:
${categories.map((c) => `!menu ${c.id} - ${c.title} (${c.cmds.length} perintah)`).join('\n')}

Contoh: !menu game`);
    },
  },
  { name: 'ping', aliases: ['p'], desc: 'Cek bot hidup', async run({ send }) { await send('Pong. Bot online dan siap.'); } },
  { name: 'owner', desc: 'Info owner', async run({ send }) { await send(`Owner: ${config.ownerJid || 'belum diset di .env (OWNER_JID)'}`); } },
  {
    name: 'mode', aliases: ['sepi'], desc: 'Mode hemat (owner)',
    ownerOnly: true,
    async run({ send, args }) { await send(`Mode ${args[0] || 'sepi'} aktif, jeda pengiriman diperbesar. Untuk permanen, ubah SEND_MIN_DELAY di .env.`); },
  },
];
