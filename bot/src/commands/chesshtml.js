// Papan catur HTML memakai CSS persis plugin Danzz (AIRich).
// Dirender jadi gambar via aiRich() -> terlihat identik di WA.
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

const CSS = `
:root{
--felt:#14231a;--felt-2:#1b2f22;--ivory:#efe7d8;--walnut:#7c4a32;--walnut-dark:#5e3722;
--brass:#c7a452;--brass-dim:#8a7038;--cream:#f3eee3;--sage:#9fb3a0;--warn:#c25b4a;
--white-piece:#f7f2e7;--black-piece:#1b120b;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--felt);display:flex;align-items:center;justify-content:center;min-height:100vh}
#wrap{width:600px;padding:16px}
#board{width:100%;aspect-ratio:1/1;display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);border:3px solid var(--walnut-dark);border-radius:6px;overflow:hidden;box-shadow:0 14px 30px -14px rgba(0,0,0,.6)}
.sq{position:relative;display:flex;align-items:center;justify-content:center}
.sq.light{background:var(--ivory)}
.sq.dark{background:var(--walnut)}
.sq .ov{position:absolute;inset:0}
.sq.lastmove .ov{background:rgba(199,164,82,.28)}
.sq.checksq .ov{background:rgba(194,91,74,.55)}
.sq.selected .ov{box-shadow:inset 0 0 0 3px var(--brass)}
.sq .piece{position:relative;z-index:2;font-size:52px;line-height:1;font-family:"Segoe UI Symbol","DejaVu Sans",Arial,sans-serif;pointer-events:none}
.sq .piece.wpc{color:var(--white-piece);text-shadow:0 1px 0 rgba(0,0,0,.55),0 0 3px rgba(0,0,0,.35)}
.sq .piece.bpc{color:var(--black-piece);text-shadow:0 1px 0 rgba(255,255,255,.18)}
`;

export function chessHtml(chess) {
  const board = chess.board();
  const last = chess.history({ verbose: true }).slice(-1)[0];
  const lastSq = last ? [last.from, last.to] : [];
  let checkSq = null;
  if (chess.inCheck()) {
    outer: for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === 'k' && p.color === chess.turn()) { checkSq = 'abcdefgh'[f] + (8 - r); break outer; }
    }
  }
  let cells = '';
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = 'abcdefgh'[f] + (8 - r);
    const cls = ['sq', (r + f) % 2 === 0 ? 'light' : 'dark'];
    if (lastSq.includes(sq)) cls.push('lastmove');
    if (sq === checkSq) cls.push('checksq');
    const p = board[r][f];
    const piece = p ? `<span class="piece ${p.color === 'w' ? 'wpc' : 'bpc'}">${GLYPH[p.type]}</span>` : '';
    cells += `<div class="${cls.join(' ')}"><div class="ov"></div>${piece}</div>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div id="wrap"><div id="board">${cells}</div></div></body></html>`;
}
