// Kartu promo bergambar untuk !arena / !snake / !kuiz.
// sharp + SVG text (tanpa font eksternal).
import sharp from 'sharp';

function card({ title, lines, accent = '#f59e0b' }) {
  const W = 800, H = 450;
  const rows = lines.map((t, i) =>
    `<text x="60" y="${200 + i * 44}" font-family="sans-serif" font-size="30" fill="#e2e8f0">${t}</text>`
  ).join('');
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#18181b"/><stop offset="1" stop-color="#0a0a0b"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="0" y="0" width="14" height="${H}" fill="${accent}"/>
    <text x="60" y="100" font-family="sans-serif" font-size="58" font-weight="bold" fill="#ffffff">${title}</text>
    ${rows}
    <rect x="60" y="${H - 96}" width="340" height="56" rx="12" fill="${accent}"/>
    <text x="230" y="${H - 58}" font-family="sans-serif" font-size="28" font-weight="bold" text-anchor="middle" fill="#000000">KETUK LINK DI BAWAH</text>
  </svg>`;
  return sharp({ create: { width: W, height: H, channels: 3, background: '#0a0a0b' } })
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
    .jpeg({ quality: 82 })
    .toBuffer();
}

export const arenaCard = () => card({
  title: 'RPG PVP ARENA',
  lines: ['3 class: Warrior - Mage - Archer', '2-6 pemain, 5 kill pertama menang', 'Naik level, skill, bom, killfeed'],
});

export const snakeCard = () => card({
  title: 'SNAKE', accent: '#4ade80',
  lines: ['Main ular di HP', 'Kirim skor, masuk !rank', 'Kontrol: tombol + geser layar'],
});

export const kuizCard = () => card({
  title: 'KUIS KILAT', accent: '#3b82f6',
  lines: ['15 soal, 60 detik', 'Skor masuk !rank', 'Jawab secepat mungkin'],
});

export const bomberCard = () => card({
  title: 'NEKO PARK', accent: '#db2777',
  lines: ['Bomber PvP real-time', 'Tombol: gerak, lompat, bom', 'Emoji + chat global, 2-6 pemain'],
});
