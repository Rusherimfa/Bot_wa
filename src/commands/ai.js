import { aiChat } from '../services/ai.js';
import { cache } from '../core/store.js';

export const ai = [
  {
    name: 'ai', aliases: ['tanya', 'gpt'], desc: '!ai <teks>',
    async run({ jid, sender, raw, send }) {
      if (!raw) return send(jid, 'Gunakan: !ai apa itu fotosintesis?');
      const prev = await cache.get(`ai:${sender}`);
      const ctx = prev ? JSON.parse(prev) : [];
      await send(jid, 'Menyiapkan jawaban. Mohon tunggu...');
      const ans = await aiChat(raw, ctx);
      const next = [...ctx, { role: 'user', content: raw }, { role: 'assistant', content: ans }].slice(-10);
      await cache.set(`ai:${sender}`, JSON.stringify(next), 3600);
      await send(jid, ans.slice(0, 3000));
    },
  },
  {
    name: 'ringkas', desc: 'Ringkas teks panjang',
    async run({ raw, send }) {
      if (!raw) return send('Gunakan: !ringkas <teks panjang>');
      const ans = await aiChat('Ringkas dalam 5 poin bahasa Indonesia:\n' + raw.slice(0, 2000));
      await send(ans.slice(0, 3000));
    },
  },
  {
    name: 'resetai', desc: 'Hapus memori AI',
    async run({ sender, send }) {
      await cache.del(`ai:${sender}`);
      await send('Riwayat percakapan AI dihapus.');
    },
  },
];
