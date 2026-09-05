// Kartu battle untuk bubble chat: pemain vs musuh + bilah nyawa/mana + log.
// Dirender via aiRich() -> gambar. Tema gelap ala Danzz.
function bar(pct, color) {
  const w = Math.max(0, Math.min(100, Math.round(pct)));
  return `<div style="background:#27272a;border-radius:6px;height:14px;overflow:hidden"><div style="width:${w}%;height:100%;background:${color}"></div></div>`;
}

export function battleHtml(c, logLines = []) {
  const e = c.enemy;
  const php = (c.hp / c.maxHp) * 100, pmp = (c.mp / c.maxMp) * 100;
  const pxp = ((c.xp % 200) / 200) * 100;
  const ehp = e ? (Math.max(0, e.hp) / e.maxHp) * 100 : 0;
  const log = logLines.slice(-3).map((t) =>
    `<div style="padding:4px 8px;background:#18181b;border:1px solid #3f3f46;border-radius:8px;margin-top:6px;font-size:14px">${t}</div>`
  ).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#14231a;color:#efe7d8;font-family:sans-serif;padding:16px}
#card{width:608px;background:#1b2f22;border:2px solid #5e3722;border-radius:12px;padding:16px}
h2{text-align:center;color:#c7a452;margin-bottom:12px;font-size:24px}
.vs{display:flex;gap:12px}
.side{flex:1;background:#0f1f14;border-radius:10px;padding:12px}
.side h3{font-size:18px;margin-bottom:8px}
.side .cls{color:#9fb3a0;font-size:13px}
.num{font-size:13px;color:#9fb3a0;margin:4px 0}
#vs{display:flex;align-items:center;font-size:28px;font-weight:900;color:#c25b4a}
</style></head><body><div id="card">
<h2>BATTLE</h2>
<div class="vs">
<div class="side"><h3>${c.name} <span class="cls">Lv${c.level} ${c.cls}</span></h3>${bar(php, '#10b981')}<div class="num">Nyawa ${c.hp}/${c.maxHp}</div>${bar(pmp, '#3b82f6')}<div class="num">Mana ${c.mp}/${c.maxMp}</div>${bar(pxp, '#c7a452')}<div class="num">XP ${c.xp % 200}/200</div><div class="num">Gold ${c.gold} | Potion ${c.potion}</div></div>
<div id="vs">VS</div>
<div class="side"><h3>${e ? e.name : '-'}</h3>${e ? bar(ehp, '#ef4444') + `<div class="num">Nyawa ${Math.max(0, e.hp)}/${e.maxHp}</div>` : ''}</div>
</div>${log}
</div></body></html>`;
}
