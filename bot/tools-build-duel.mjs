// Embed set bidak SVG ke catur-duel.html (sekali jalan saat berubah).
import fs from 'fs';
const P = JSON.parse(fs.readFileSync('/tmp/pieces.json', 'utf8'));
const svg = (inner) => '<svg viewBox="0 0 45 45" width="100%" height="100%">' + inner + '</svg>';
const PIECES = {};
for (const [k, v] of Object.entries(P)) PIECES[k] = svg(v);
const f = 'arena/public/catur-duel.html';
let html = fs.readFileSync(f, 'utf8');
if (!html.includes('const PIECES=__PIECES__;')) {
  console.log('sudah terbangun, lewati');
} else {
  html = html.replace('const PIECES=__PIECES__;', 'const PIECES=' + JSON.stringify(PIECES) + ';');
  fs.writeFileSync(f, html);
  console.log('catur-duel.html terbangun, bytes:', html.length);
}
