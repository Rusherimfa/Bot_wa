import axios from 'axios';

export const util = [
  {
    name: 'cuaca', desc: '!cuaca <kota>',
    async run({ args, raw, send }) {
      const kota = raw || 'Samarinda';
      try {
        const { data } = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(kota)}&count=1`, { timeout: 10000 });
        const loc = data?.results?.[0];
        if (!loc) return send('Kota tidak ditemukan.');
        const w = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code`, { timeout: 10000 });
        await send(`*Cuaca ${loc.name}*\nSuhu: ${w.data.current.temperature_2m}C`);
      } catch { await send('Data cuaca gagal diambil.'); }
    },
  },
  {
    name: 'sholat', desc: '!sholat <kota>',
    async run({ raw, send }) {
      try {
        const { data } = await axios.get(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(raw || 'Samarinda')}&country=Indonesia&method=20`, { timeout: 10000 });
        const t = data.data.timings;
        await send(`*Jadwal Sholat*\nSubuh: ${t.Fajr}\nDzuhur: ${t.Dhuhr}\nAshar: ${t.Asr}\nMaghrib: ${t.Maghrib}\nIsya: ${t.Isha}`);
      } catch { await send('Jadwal sholat gagal diambil.'); }
    },
  },
  {
    name: 'translate', aliases: ['tr'], desc: '!tr en|Halo',
    async run({ raw, send }) {
      const [lang, ...rest] = raw.split('|');
      if (!rest.length) return send('Format: !tr en|Halo apa kabar');
      try {
        const { data } = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(rest.join('|'))}&langpair=id|${lang.trim()}`, { timeout: 10000 });
        await send(`${data.responseData.translatedText}`);
      } catch { await send('Terjemahan gagal.'); }
    },
  },
  {
    name: 'qr', desc: '!qr <teks> -> gambar QR',
    async run({ raw, send, sock, jid }) {
      if (!raw) return send('Gunakan: !qr halo');
      await sock.sendMessage(jid, { image: { url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(raw)}` }, caption: raw });
    },
  },
  {
    name: 'kalk', aliases: ['kalkulator', 'calc'], desc: '!kalk 2+2*3',
    async run({ raw, send }) {
      if (!/^[0-9+\-*/(). %^]+$/.test(raw || '')) return send('Hanya angka dan operator yang didukung.');
      try { await send(`${raw} = ${Function(`return (${raw})`)()}`); }
      catch { await send('Ekspresi tidak valid.'); }
    },
  },
  {
    name: 'note', desc: '!note simpan|isi | !note list',
    async run({ raw, sender, send }) {
      const { cache } = await import('../core/store.js');
      if (raw.startsWith('list')) {
        const v = await cache.get(`note:${sender}`);
        return send(v ? `*Catatan*\n${v}` : 'Belum ada catatan.');
      }
      await cache.set(`note:${sender}`, raw.replace(/^simpan\|?/, ''), 86400 * 30);
      await send('Catatan disimpan.');
    },
  },
  {
    name: 'jadwal', desc: 'Waktu sekarang (WITA)',
    async run({ send }) {
      await send(`${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })} WITA`);
    },
  },
];
