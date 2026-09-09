export const group = [
  {
    name: 'tagall', aliases: ['tag'], desc: 'Tag semua member', groupOnly: true, adminOnly: true,
    async run({ sock, jid, args, send }) {
      const meta = await sock.groupMetadata(jid);
      const members = meta.participants.map((p) => p.id);
      await sock.sendMessage(jid, { text: `*PENGUMUMAN*\n${args.join(' ') || 'Mohon perhatiannya.'}\n` + members.map((m) => '@' + m.split('@')[0]).join(' '), mentions: members });
    },
  },
  {
    name: 'kick', desc: 'Keluarkan member (reply/tag)', groupOnly: true, adminOnly: true,
    async run({ sock, jid, m, send }) {
      const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        || m.message?.extendedTextMessage?.contextInfo?.participant;
      if (!target) return send(jid, 'Gunakan: !kick @tag');
      await sock.groupParticipantsUpdate(jid, [target], 'remove');
      await send(jid, 'Anggota dikeluarkan dari grup.');
    },
  },
  {
    name: 'welcome', desc: '!welcome on/off', groupOnly: true, adminOnly: true,
    async run({ jid, args, send }) {
      const { db } = await import('../core/store.js');
      const g = db.group(jid); g.welcome = args[0] === 'on'; await db.saveGroup(jid, g);
      await send(jid, `Pesan selamat datang: ${g.welcome ? 'AKTIF' : 'NONAKTIF'}`);
    },
  },
  {
    name: 'antilink', desc: '!antilink on/off', groupOnly: true, adminOnly: true,
    async run({ jid, args, send }) {
      const { db } = await import('../core/store.js');
      const g = db.group(jid); g.antilink = args[0] === 'on'; await db.saveGroup(jid, g);
      await send(jid, `Antilink: ${g.antilink ? 'AKTIF' : 'NONAKTIF'}`);
    },
  },
  {
    name: 'vote', desc: '!vote <topik> | !cekvote | !delvote', groupOnly: true,
    async run({ jid, args, raw, sender, send }) {
      const { cache } = await import('../core/store.js');
      const key = `vote:${jid}`;
      if (args[0] === undefined || raw.startsWith('<')) return send(jid, 'Gunakan: !vote makan apa?');
      const sub = args[0]?.toLowerCase();
      if (sub === 'cek' || args[0] === undefined) { /* fallthrough */ }
      if (raw === '' || sub === 'cekvote') {
        const v = await cache.get(key);
        if (!v) return send(jid, 'Belum ada voting. Buat dengan: !vote makan apa?');
        const o = JSON.parse(v);
        return send(jid, `*VOTING*\n${o.topic}\nSetuju: ${o.up.length} | Tidak: ${o.down.length}\nBalas dengan !vote up atau !vote down`);
      }
      if (sub === 'delvote' || sub === 'del') { await cache.del(key); return send(jid, 'Voting dihapus.'); }
      if (sub === 'up' || sub === 'down') {
        const v = await cache.get(key);
        if (!v) return send(jid, 'Belum ada voting.');
        const o = JSON.parse(v);
        o.up = o.up.filter((x) => x !== sender); o.down = o.down.filter((x) => x !== sender);
        (sub === 'up' ? o.up : o.down).push(sender);
        await cache.set(key, JSON.stringify(o), 3600);
        return send(jid, `Suara tercatat: ${sub === 'up' ? 'setuju' : 'tidak'}. Total setuju ${o.up.length}, tidak ${o.down.length}.`);
      }
      await cache.set(key, JSON.stringify({ topic: raw, up: [], down: [] }), 3600);
      await send(jid, `*VOTING BARU*\n${raw}\nBalas dengan !vote up atau !vote down`);
    },
  },
  {
    name: 'cekvote', desc: 'Lihat voting', groupOnly: true,
    async run(h) { h.args = ['cekvote']; h.raw = 'cekvote'; const v = group.find((c) => c.name === 'vote'); await v.run(h); },
  },
  {
    name: 'afk', desc: '!afk <alasan>',
    async run({ jid, sender, args, send }) {
      const { cache } = await import('../core/store.js');
      await cache.set(`afk:${sender}`, args.join(' ') || 'AFK', 43200);
      await send(jid, 'Status AFK diaktifkan.');
    },
  },
  {
    name: 'group', desc: '!group open/close', groupOnly: true, adminOnly: true,
    async run({ sock, jid, args, send }) {
      await sock.groupSettingUpdate(jid, args[0] === 'close' ? 'announcement' : 'not_announcement');
      await send(jid, `Grup ${args[0] === 'close' ? 'ditutup. Hanya admin yang bisa mengirim pesan.' : 'dibuka kembali.'}`);
    },
  },
];
