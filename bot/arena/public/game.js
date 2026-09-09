const c = document.getElementById('c');
const ctx = c.getContext('2d');
const TILE = 32;
const MAP_W = 25, MAP_H = 15;
let map = [];
let players = new Map();
let bombs = [];
let projectiles = [];
let me = null;
let myCls = 'warrior';
let roomId = 'LOBBY';
try { roomId = new URLSearchParams(location.search).get('room') || 'LOBBY'; } catch (e) {}
document.getElementById('roomId').textContent = roomId;
document.getElementById('roomIn').value = roomId === 'LOBBY' ? '' : roomId;
const socket = io({ query: { room: roomId } });
let keys = { left:false, right:false, jump:false };
let fxs = [];

// class pick
document.querySelectorAll('.clsBtn').forEach(b => b.onclick = () => {
  document.querySelectorAll('.clsBtn').forEach(x => x.classList.remove('sel'));
  b.classList.add('sel');
  myCls = b.dataset.c;
});

// join (tanpa kolom nomor — skor arena tidak diklaim otomatis)
document.getElementById('go').onclick = () => {
  const name = document.getElementById('name').value.trim() || 'Player' + Math.floor(Math.random()*99);
  const r = document.getElementById('roomIn').value.trim().toUpperCase() || 'LOBBY';
  try { if (typeof localStorage !== 'undefined') localStorage.setItem('arena_name', name); } catch (e) {}
  roomId = r;
  try { history.replaceState(null,'','?room='+roomId); } catch (e) {}
  document.getElementById('roomId').textContent = roomId;
  socket.emit('join', { name, room: roomId, cls: myCls, wa: '' });
  document.getElementById('join').style.display = 'none';
  document.getElementById('status').textContent = 'joined as ' + name;
};
let saved = null;
try { if (typeof localStorage !== 'undefined') saved = localStorage.getItem('arena_name'); } catch (e) {}
if (saved) document.getElementById('name').value = saved;

socket.on('connect', ()=> document.getElementById('status').textContent='connected');
socket.on('joined', d=>{
  me = d.id; map = d.map;
  resize();
});
function syncList(list, arr){ return new Map(arr.map(p=>[p.id,p])); }
socket.on('roomState', d=>{
  players = syncList(players, d.players);
  bombs = d.bombs || [];
  projectiles = d.projectiles || [];
  renderPlayers();
});
socket.on('tick', d=>{
  for (const p of d.players) {
    const cur = players.get(p.id);
    if (cur) Object.assign(cur, p);
    else players.set(p.id, p);
  }
  for (const id of [...players.keys()]) {
    if (!d.players.find(p=>p.id===id)) players.delete(id);
  }
  bombs = d.bombs || [];
  projectiles = d.projectiles || [];
});
socket.on('fx', f=>{
  f.t = performance.now();
  fxs.push(f);
  if (fxs.length>60) fxs.shift();
  if (f.type==='explode'||f.type==='frost') shake=8;
});
socket.on('log', msg=>{
  const el = document.getElementById('log');
  const div = document.createElement('div'); div.className='log'; div.textContent = msg;
  el.appendChild(div); el.scrollTop = el.scrollHeight;
});
socket.on('matchEnd', d=>{
  const b = document.getElementById('banner');
  b.style.display = 'block';
  b.textContent = 'Pemenang: ' + d.winner + ' (' + d.table.map(t=>`${t.name} ${t.kills}K`).join(' · ') + ')';
  setTimeout(()=> b.style.display='none', 8000);
});
socket.on('errorMsg', m=> alert(m));

document.getElementById('copy').onclick = ()=>{
  try {
    if (navigator.clipboard) navigator.clipboard.writeText(location.href);
  } catch (e) {}
  const b=document.getElementById('copy'); const t=b.textContent; b.textContent='Copied!'; setTimeout(()=>b.textContent=t,1200);
};

// input: J/SPACE serang, K skill, B bom
const keyMap = { ArrowLeft:'left', a:'left', ArrowRight:'right', d:'right', w:'jump', ArrowUp:'jump' };
addEventListener('keydown', e=>{
  const k = keyMap[e.key.toLowerCase()];
  if (k){ keys[k]=true; e.preventDefault(); }
  const lk = e.key.toLowerCase();
  if (lk==='b') send({bomb:true});
  if (lk==='j' || e.code==='Space'){ send({attack:true}); e.preventDefault(); }
  if (lk==='k') send({skill:true});
});
addEventListener('keyup', e=>{
  const k = keyMap[e.key.toLowerCase()];
  if (k) keys[k]=false;
});
document.querySelectorAll('[data-k]').forEach(b=>{
  const k=b.dataset.k;
  const down = ()=> {
    if(k==='attack') send({attack:true});
    else if(k==='skill') send({skill:true});
    else if(k==='bomb') send({bomb:true});
    else keys[k]=true;
  };
  const up = ()=> { if(!['attack','skill','bomb'].includes(k)) keys[k]=false; };
  b.addEventListener('touchstart', e=>{e.preventDefault(); down();});
  b.addEventListener('touchend', up);
  b.addEventListener('mousedown', down);
  b.addEventListener('mouseup', up);
});

function send(extra={}){
  const payload = { left:keys.left, right:keys.right, jump:keys.jump, ...extra };
  socket.emit('input', payload);
  if (extra.jump) keys.jump=false;
}
setInterval(()=> send(), 1000/30);

function resize(){
  const wrap = document.getElementById('wrap');
  const w = Math.min(800, wrap.clientWidth - (window.innerWidth>768?300:0) - 24);
  const h = Math.min(480, Math.floor(w * 0.6));
  c.width = w; c.height = h;
  c.style.width = w+'px'; c.style.height = h+'px';
}
addEventListener('resize', resize);
resize();

// render
let shake=0;
let camX=0, camY=0;
function lerp(a,b,t){return a+(b-a)*t}

const CLS_ICON = { warrior:'W', mage:'M', archer:'A' };

function renderPlayers(){
  const el=document.getElementById('players');
  el.innerHTML='';
  for (const p of players.values()){
    const d=document.createElement('div'); d.className='pill';
    d.innerHTML=`<span class="dot" style="background:${p.color}"></span><b>${p.name}</b><span style="color:#a1a1aa">Lv${p.level||1} ${p.kills}/${p.deaths}</span><span class="hp"><i style="width:${p.hp/(p.maxHp||100)*100}%;background:${p.hp>60?'#10b981':p.hp>30?'#f59e0b':'#ef4444'}"></i></span>`;
    if(p.id===me) d.style.borderColor='#f59e0b';
    el.appendChild(d);
  }
  // cooldown tombol skill
  const meP = players.get(me);
  if (meP) {
    const now = Date.now();
    document.getElementById('bSkill').classList.toggle('cd', now - (meP.lastSkill||0) < 6000);
  }
}

function draw(){
  requestAnimationFrame(draw);
  const now = performance.now();
  const meP = players.get(me);
  if (meP) {
    const targetX = meP.x + meP.w/2 - c.width/2;
    const targetY = meP.y + meP.h/2 - c.height/2;
    camX = lerp(camX, targetX, 0.12);
    camY = lerp(camY, targetY, 0.12);
    camX = Math.max(0, Math.min(MAP_W*TILE - c.width, camX));
    camY = Math.max(0, Math.min(MAP_H*TILE - c.height, camY));
  }
  ctx.save();
  if (shake>0){ ctx.translate((Math.random()-0.5)*shake, (Math.random()-0.5)*shake); shake*=0.92; if(shake<0.5) shake=0; }

  ctx.fillStyle='#87ceeb'; ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='rgba(255,255,255,0.85)';
  for(let i=0;i<4;i++){ const x=(i*220 - camX*0.2)% (c.width+100); ctx.beginPath(); ctx.ellipse(x+40, 60+ i*12, 36,14,0,0,Math.PI*2); ctx.fill(); }

  for(let y=0;y<MAP_H;y++) for(let x=0;x<MAP_W;x++) if(map[y]&&map[y][x]){
    const sx = x*TILE - camX, sy = y*TILE - camY;
    if(sx<-TILE||sx>c.width||sy<-TILE||sy>c.height) continue;
    ctx.fillStyle = (y>=MAP_H-2) ? '#3f3f46' : '#71717a';
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(sx, sy, TILE, 4);
    if(y===MAP_H-2){ ctx.fillStyle='#10b981'; ctx.fillRect(sx, sy, TILE, 6); }
  }

  for(const b of bombs){
    const sx = b.x - camX, sy = b.y - camY;
    const t = (now - b.at)/2000;
    ctx.fillStyle='#18181b'; ctx.strokeStyle='#f59e0b'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(sx+8, sy+8, 10, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle=`rgba(239,68,68,${0.3+ t*0.4})`; ctx.beginPath(); ctx.arc(sx+8, sy+8, 14 + t*10, 0, Math.PI*2); ctx.stroke();
  }

  // projectiles
  for(const pr of projectiles){
    const sx = pr.x - camX, sy = pr.y - camY;
    if (pr.kind==='fire'){
      ctx.fillStyle='rgba(249,115,22,0.9)'; ctx.beginPath(); ctx.arc(sx, sy, pr.r+3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='#fef08a'; ctx.beginPath(); ctx.arc(sx, sy, pr.r-2, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.strokeStyle='#fef3c7'; ctx.lineWidth=3; ctx.beginPath();
      ctx.moveTo(sx - Math.sign(pr.vx)*10, sy); ctx.lineTo(sx + Math.sign(pr.vx)*10, sy); ctx.stroke();
    }
  }

  for(const p of players.values()){
    const sx = p.x - camX, sy = p.y - camY;
    if (sx<-40||sx>c.width+40||sy<-40||sy>c.height+40) continue;
    const slowed = Date.now() < (p.slowUntil||0);
    ctx.save();
    ctx.translate(sx + p.w/2, sy + p.h/2);
    ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0, p.h/2+6, p.w*0.6, 4, 0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = p.alive ? p.color : '#52525b';
    ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
    // ikon class di badan
    ctx.fillStyle = p.alive ? '#fff' : '#a1a1aa';
    ctx.font = 'bold 13px Inter'; ctx.textAlign='center';
    ctx.fillText(CLS_ICON[p.cls]||'?', 0, 5);
    ctx.fillStyle = slowed ? 'rgba(147,197,253,0.5)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, -p.h/2, p.w/2, p.h);
    const recent = now - p.lastAtk < 200;
    if (recent && p.alive && p.cls==='warrior'){
      ctx.strokeStyle='#f59e0b'; ctx.lineWidth=3; ctx.beginPath();
      ctx.moveTo(p.dir*(p.w/2), 0); ctx.lineTo(p.dir*(p.w/2+20), -8); ctx.stroke();
    }
    ctx.restore();
    // nama + level + hp + mp
    ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(sx-10, sy-26, p.w+20, 14);
    ctx.fillStyle='#fff'; ctx.font='10px monospace'; ctx.textAlign='center';
    ctx.fillText(`${p.name} Lv${p.level||1}`, sx+p.w/2, sy-16);
    ctx.fillStyle='#27272a'; ctx.fillRect(sx-2, sy-10, p.w+4, 4);
    ctx.fillStyle= p.hp>60?'#10b981':p.hp>30?'#f59e0b':'#ef4444';
    ctx.fillRect(sx-2, sy-10, (p.w+4)*(p.hp/(p.maxHp||100)), 4);
    ctx.fillStyle='#27272a'; ctx.fillRect(sx-2, sy-5, p.w+4, 3);
    ctx.fillStyle='#3b82f6'; ctx.fillRect(sx-2, sy-5, (p.w+4)*(p.mp/(p.maxMp||100)), 3);
    if(!p.alive){ ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(sx-6, sy-6, p.w+12, p.h+12); ctx.fillStyle='#fff'; ctx.font='bold 11px Inter'; ctx.fillText('RESPAWN...', sx+p.w/2, sy+p.h/2); }
  }

  fxs = fxs.filter(f=> now - f.t < 800);
  for(const f of fxs){
    const age = (now - f.t)/800;
    if(f.type==='explode'){
      ctx.fillStyle=`rgba(245,158,11,${1-age})`; ctx.beginPath(); ctx.arc(f.x - camX, f.y - camY, f.r * (0.4+ age*0.6),0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='bold 12px Inter'; ctx.textAlign='center'; ctx.fillText('BOOM!', f.x - camX, f.y - camY - 28*(1-age));
    } else if(f.type==='slash'){
      ctx.strokeStyle=`rgba(245,158,11,${1-age})`; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(f.x - camX, f.y - camY, 16+ age*10, -0.6, 0.6); ctx.stroke();
    } else if(f.type==='fireball'||f.type==='arrow'){
      ctx.fillStyle=`rgba(254,240,138,${1-age})`; ctx.beginPath(); ctx.arc(f.x - camX, f.y - camY, 8*(1-age)+3, 0, Math.PI*2); ctx.fill();
    } else if(f.type==='frost'){
      ctx.strokeStyle=`rgba(147,197,253,${1-age})`; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(f.x - camX, f.y - camY, 30+ age*85, 0, Math.PI*2); ctx.stroke();
    } else if(f.type==='dash'){
      ctx.strokeStyle=`rgba(245,158,11,${1-age})`; ctx.lineWidth=4; ctx.beginPath();
      ctx.moveTo(f.x - camX - f.dir*30, f.y - camY); ctx.lineTo(f.x - camX + f.dir*30, f.y - camY); ctx.stroke();
    } else if(f.type==='levelup'){
      ctx.fillStyle=`rgba(74,222,128,${1-age})`; ctx.font='bold 13px Inter'; ctx.textAlign='center';
      ctx.fillText('LEVEL UP', f.x - camX, f.y - camY - 34*(1-age));
    } else if(f.type==='hit'){
      ctx.fillStyle=`rgba(255,255,255,${1-age})`; ctx.beginPath(); ctx.arc(f.x - camX, f.y - camY, 6*(1-age)+2, 0, Math.PI*2); ctx.fill();
    }
  }

  ctx.restore();
}
draw();
setInterval(renderPlayers, 500);
