import os from 'node:os';
import { config, webBase } from '../core/config.js';
import { isOwner } from '../core/owners.js';
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
  {
    name: 'ping', aliases: ['p'], desc: 'Cek bot + link webview monitor (owner)',
    async run({ send, sender }) {
      const t0 = Date.now();
      const gb = (b) => (b / 1073741824).toFixed(1) + 'GB';
      const up = Math.floor(process.uptime());
      const uh = Math.floor(up / 3600), um = Math.floor((up % 3600) / 60);
      let msg = `Pong! ✅ Bot online\nRespon: ${Date.now() - t0}ms\nUptime: ${uh}j ${um}m\nLoad: ${os.loadavg()[0].toFixed(2)} • RAM: ${gb(os.totalmem() - os.freemem())}/${gb(os.totalmem())}`;
      // Link webview monitor HANYA untuk owner (isinya PANEL_API_KEY)
      try {
        if (sender && isOwner(sender) && config.panelKey) {
          msg += `\n\n📊 Monitor kece:\n${webBase()}/monitor?key=${config.panelKey}\n(CPU • GPU • RAM • disk • net • speedtest)`;
        }
      } catch {}
      await send(msg);
    },
  },
  {
    name: 'monitor', aliases: ['sysmon', 'server'], desc: 'Dashboard server langsung di bubble chat (owner)',
    ownerOnly: true,
    async run({ jid, sender, send, sock }) {
      if (!config.panelKey) return send('PANEL_API_KEY kosong di .env — monitor nonaktif.');
      try {
        const { sendInlineWebUI } = await import('../wa/airich-send.js');
        const { createPlayToken } = await import('../core/playtoken.js');
        const { monitorHtml } = await import('../panel.js');
        await createPlayToken(sender); // identitias pengirim (konsisten dgn game lain)
        const { html, base } = await monitorHtml();
        await sendInlineWebUI(sock, jid, html, 'Server Monitor', { trustedSources: [base] });
      } catch (e) {
        await send(jid, `Monitor gagal tampil (${e.message}), coba lagi.`);
      }
    },
  },
  { name: 'owner', desc: 'Info owner', async run({ send }) { await send(`Owner: ${config.ownerJid || 'belum diset di .env (OWNER_JID)'}`); } },
  {
    name: 'mode', aliases: ['sepi'], desc: 'Mode hemat (owner)',
    ownerOnly: true,
    async run({ send, args }) { await send(`Mode ${args[0] || 'sepi'} aktif, jeda pengiriman diperbesar. Untuk permanen, ubah SEND_MIN_DELAY di .env.`); },
  },
];
