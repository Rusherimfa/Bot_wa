// Build catur.html (fallback statis + engine CDN) & catur-inline.html (engine bundel).
import fs from 'fs';

const P = JSON.parse(fs.readFileSync('/tmp/pieces.json', 'utf8'));
const svg = (inner) => '<svg viewBox="0 0 45 45" width="100%" height="100%">' + inner + '</svg>';
const PIECES = {};
for (const [k, v] of Object.entries(P)) PIECES[k] = svg(v);

const order = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
let cells = '';
for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
  const light = (r + f) % 2 === 0;
  let piece = '';
  if (r === 0 || r === 1 || r === 6 || r === 7) {
    const t = r < 2 ? (r === 0 ? order[f] : 'p') : (r === 7 ? order[f] : 'p');
    const w = r > 4;
    piece = '<span class="piece">' + PIECES[t + (w ? 'W' : 'B')] + '</span>';
  }
  cells += '<div class="sq ' + (light ? 'light' : 'dark') + '"><div class="ov"></div>' + piece + '</div>';
}

const gameJS = `const PIECES=${JSON.stringify(PIECES)};
const DEFMODE='__MODE__';
let game=new Chess(),sel=null,legal=[],flipped=false,over=false,hideSq=null,animating=false,hotseat=(DEFMODE==='hotseat');
function sqXY(sq){const f='abcdefgh'.indexOf(sq[0]),r=8-parseInt(sq[1],10);return flipped?{x:7-f,y:7-r}:{x:f,y:r};}
function animateMove(from,to,pieceKey,done){
  const b=document.getElementById('board');
  const cell=b.clientWidth/8;
  hideSq=to;animating=true;draw();
  const o=document.createElement('div');
  const p0=sqXY(from),p1=sqXY(to);
  o.style.cssText='position:absolute;z-index:5;width:'+(cell*0.88)+'px;height:'+(cell*0.88)+'px;left:'+(p0.x*cell+cell*0.06)+'px;top:'+(p0.y*cell+cell*0.06)+'px;transition:left .32s ease,top .32s ease;filter:drop-shadow(0 3px 3px rgba(0,0,0,.5));pointer-events:none;';
  o.innerHTML=PIECES[pieceKey];
  b.appendChild(o);
  requestAnimationFrame(()=>{requestAnimationFrame(()=>{o.style.left=(p1.x*cell+cell*0.06)+'px';o.style.top=(p1.y*cell+cell*0.06)+'px';});});
  setTimeout(()=>{if(o.parentNode)o.parentNode.removeChild(o);hideSq=null;animating=false;draw();if(done)done();},360);
}
function sqName(r,f){const a='abcdefgh';return flipped?a[7-f]+(r+1):a[f]+(8-r);}
function draw(){
  const b=document.getElementById('board');b.innerHTML='';
  const bd=game.board();const last=game.history({verbose:true}).slice(-1)[0];
  const lm=last?[last.from,last.to]:[];
  let chk=null;
  if(game.inCheck()){outer:for(let r=0;r<8;r++)for(let f=0;f<8;f++){const p=bd[r][f];if(p&&p.type==='k'&&p.color===game.turn()){chk=sqName(r,f);break outer;}}}
  for(let r=0;r<8;r++)for(let f=0;f<8;f++){
    const sq=sqName(r,f);const d=document.createElement('div');
    const light=(r+f)%2===0;
    d.className='sq '+(light?'light':'dark');
    if(lm.includes(sq))d.classList.add('lastmove');
    if(sq===chk)d.classList.add('checksq');
    if(sq===sel)d.classList.add('selected');
    d.innerHTML='<div class="ov"></div>';
    const pr=flipped?bd[7-r][7-f]:bd[r][f];
    if(pr&&sq!==hideSq){const s=document.createElement('span');s.className='piece';s.innerHTML=PIECES[pr.type+(pr.color==='w'?'W':'B')];d.appendChild(s);}
    if(legal.includes(sq)){const dot=document.createElement('div');dot.className='dot';d.appendChild(dot);}
    d.onclick=()=>tap(sq);
    b.appendChild(d);
  }
  let st='Giliran: '+(game.turn()==='w'?'Putih':'Hitam')+(hotseat?'':(game.turn()==='w'?' (kamu)':' (bot mikir...)'));
  if(game.isCheckmate())st='SKAKMAT. Menang: '+(game.turn()==='w'?'Hitam':'Putih');
  else if(game.isDraw()||game.isStalemate())st='Remis.';
  else if(game.inCheck())st+=' (SKAK)';
  document.getElementById('status').textContent=over?'Permainan selesai.':st;
}
function tap(sq){
  if(over||animating)return;
  if(!hotseat&&game.turn()!=='w')return;
  const p=game.get(sq);
  if(sel&&legal.includes(sq)){
    const pc=game.get(sel);const pk=pc.type+(pc.color==='w'?'W':'B');const from=sel;
    game.move({from:sel,to:sq,promotion:'q'});sel=null;legal=[];
    if(hotseat){animateMove(from,sq,pk,function(){draw();});}
    else animateMove(from,sq,pk,function(){setTimeout(botMove,250);});
    return;
  }
  if(p&&(hotseat||p.color==='w')){sel=sq;legal=game.moves({square:sq,verbose:true}).map(m=>m.to);}
  else{sel=null;legal=[];}
  draw();
}
const VAL={p:1,n:3,b:3,r:5,q:9,k:0};
function botMove(){
  if(over)return;
  const moves=game.moves({verbose:true});
  if(!moves.length){draw();return;}
  let best=moves[0],bs=-1e9;
  for(const m of moves){
    let s=(m.captured?VAL[m.captured]*10:0)+Math.random()*2;
    let moved=false;
    try{game.move(m.san);moved=true;if(game.isAttacked(m.to,game.turn()))s-=VAL[m.piece]*8;}catch(e){}
    finally{if(moved){try{game.undo();}catch(e){}}}
    if(s>bs){bs=s;best=m;}
  }
  const mover=game.turn();
  const bpc=best.piece+(mover==='w'?'W':'B');
  const bfrom=best.from;
  try{game.move(best.san);}catch(e){try{game.move(moves[0].san);}catch(e2){return;}}
  if(game.isGameOver()){over=true;
    if(game.isCheckmate()&&game.turn()==='b'&&!hotseat)document.getElementById('status').textContent='Kamu menang!';
  }
  draw();
}
document.getElementById('new').onclick=()=>{game=new Chess();sel=null;legal=[];over=false;draw();};
document.getElementById('flip').onclick=()=>{flipped=!flipped;draw();};
document.getElementById('mode').onclick=(e)=>{hotseat=!hotseat;e.target.textContent=hotseat?'Lawan: 2 Pemain':'Lawan: Bot';game=new Chess();sel=null;legal=[];over=false;draw();};
if(hotseat){document.getElementById('mode').textContent='Lawan: 2 Pemain';}
draw();`;

const css = `:root{--felt:#14231a;--ivory:#efe7d8;--walnut:#7c4a32;--walnut-dark:#5e3722;--brass:#c7a452;--warn:#c25b4a}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none}
body{margin:0;background:var(--felt);color:var(--ivory);font-family:system-ui,sans-serif;text-align:center;padding:10px}
#status{margin:8px;font-weight:700;min-height:22px}
#board{width:100%;max-width:480px;margin:auto;aspect-ratio:1/1;display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);border:3px solid var(--walnut-dark);border-radius:6px;overflow:hidden;position:relative}
.sq{position:relative;display:flex;align-items:center;justify-content:center}
.sq.light{background:var(--ivory)}.sq.dark{background:var(--walnut)}
.sq .ov{position:absolute;inset:0}
.sq.lastmove .ov{background:rgba(199,164,82,.28)}
.sq.checksq .ov{background:rgba(194,91,74,.55)}
.sq.selected .ov{box-shadow:inset 0 0 0 3px var(--brass)}
.sq .piece{position:relative;z-index:2;width:88%;height:88%;pointer-events:none;filter:drop-shadow(0 2px 2px rgba(0,0,0,.4))}
.sq .dot{position:absolute;width:26%;height:26%;border-radius:50%;background:rgba(199,164,82,.6);z-index:1}
.row{display:flex;gap:8px;justify-content:center;margin:10px;flex-wrap:wrap}
button{background:var(--walnut);color:#fff;border:0;border-radius:10px;padding:10px 14px;font-weight:700}
#msg{font-size:13px;min-height:18px}`;

const page = '<!DOCTYPE html>\n<html lang="id">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">\n' +
  '<title>Catur - WA Bot Full</title>\n<style>\n' + css + '\n</style>\n</head>\n<body>\n' +
  '<h2 style="margin:6px">CATUR</h2>\n<div id="status">Ketuk bidak lalu kotak tujuan.</div>\n' +
  '<div id="board">' + cells + '</div>\n' +
'<div class="row"><button id="new">Game Baru</button><button id="mode">Lawan: Bot</button><button id="flip">Balik Papan</button></div>\n' +
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/chess.js/1.0.0/chess.min.js"></script>\n' +
  '<script>' + gameJS + '</script>\n</body>\n</html>\n';

fs.writeFileSync('src/web/catur.html', page);
let eng = fs.readFileSync('node_modules/chess.js/dist/esm/chess.js', 'utf8');
eng = eng.replace(/^export \{[^}]*\};?\s*$/m, '') + '\nwindow.Chess=Chess;';
fs.writeFileSync('src/web/catur-inline.html',
  page.replace(/<script src="https:\/\/cdnjs[^>]*><\/script>/, '<script>' + eng + '</script>'));
console.log('rebuilt OK, inline bytes:', fs.statSync('src/web/catur-inline.html').size);
