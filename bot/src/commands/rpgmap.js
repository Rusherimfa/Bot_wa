// Renderer peta RPG -> PNG (sharp, tanpa font eksternal).
// Dunia logis 3x3 (lihat rpgchat.js MAP), tiap sel digambar 3x3 tile.
import sharp from 'sharp';

const T = 44; // px per tile visual
const TERRAIN = {
  Kota: { base: [120, 113, 108], dot: [250, 204, 21] },
  Hutan: { base: [34, 100, 60], dot: [22, 70, 40] },
  Gunung: { base: [100, 100, 110], dot: [70, 70, 80] },
  Danau: { base: [40, 110, 180], dot: [120, 190, 240] },
  'Gua Bos': { base: [60, 30, 80], dot: [150, 50, 180] },
  Ladang: { base: [130, 160, 70], dot: [100, 130, 50] },
  Reruntuhan: { base: [130, 95, 60], dot: [95, 65, 40] },
};
const LOGIC = [
  ['Gunung', 'Hutan', 'Gua Bos'],
  ['Danau', 'Kota', 'Hutan'],
  ['Hutan', 'Ladang', 'Reruntuhan'],
];

function px(buf, W, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= W) return;
  const i = (y * W + x) * 3;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
}
function rect(buf, W, x0, y0, w, h, [r, g, b]) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(buf, W, x, y, r, g, b);
}

export async function renderMap(logicX, logicY, hasEnemy) {
  const N = 9; // 9x9 tile visual
  const W = N * T;
  const buf = Buffer.alloc(W * W * 3);
  for (let ly = 0; ly < 3; ly++) for (let lx = 0; lx < 3; lx++) {
    const t = TERRAIN[LOGIC[ly][lx]] || TERRAIN.Hutan;
    for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) {
      const ox = (lx * 3 + tx) * T, oy = (ly * 3 + ty) * T;
      rect(buf, W, ox, oy, T, T, t.base);
      // tekstur titik deterministik
      for (let d = 0; d < 14; d++) {
        const dx = ox + ((tx * 37 + ty * 53 + d * 29) % T);
        const dy = oy + ((tx * 17 + ty * 41 + d * 31) % T);
        rect(buf, W, dx, dy, 3, 3, t.dot);
      }
      // garis grid halus
      rect(buf, W, ox, oy, T, 2, [0, 0, 0]);
      rect(buf, W, ox, oy, 2, T, [0, 0, 0]);
    }
  }
  // posisi pemain di tengah sel logisnya
  const pcx = (logicX * 3 + 1) * T + T / 2;
  const pcy = (logicY * 3 + 1) * T + T / 2;
  // penanda musuh (pojok sel pemain bila encounter)
  if (hasEnemy) {
    const ex = pcx + T, ey = pcy - T;
    rect(buf, W, Math.round(ex - 12), Math.round(ey - 12), 24, 24, [220, 40, 40]);
    rect(buf, W, Math.round(ex - 8), Math.round(ey - 8), 16, 16, [120, 10, 10]);
  }
  // pemain: kotak putih + bingkai hitam
  rect(buf, W, Math.round(pcx - 13), Math.round(pcy - 13), 26, 26, [0, 0, 0]);
  rect(buf, W, Math.round(pcx - 10), Math.round(pcy - 10), 20, 20, [250, 250, 250]);
  rect(buf, W, Math.round(pcx - 4), Math.round(pcy - 4), 8, 8, [22, 163, 74]);
  return sharp(buf, { raw: { width: W, height: W, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();
}
