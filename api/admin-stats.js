// ARCHIVO: api/admin-stats.js
// Sin auth header → sirve el dashboard HTML
// Con Authorization: Bearer <secret> → retorna JSON
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>PrecioML Admin</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
.topbar{background:#1e293b;border-bottom:1px solid #334155;padding:16px 32px;display:flex;align-items:center;gap:12px}
.topbar h1{font-size:20px;font-weight:700}
.badge{background:#3483fa;color:#fff;font-size:11px;padding:2px 8px;border-radius:99px;font-weight:600}
.auth{max-width:400px;margin:80px auto;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155}
.auth h2{font-size:18px;margin-bottom:8px}
.auth p{font-size:13px;color:#64748b;margin-bottom:20px}
.auth input{width:100%;background:#0f172a;border:1px solid #334155;color:#e2e8f0;padding:10px 14px;border-radius:8px;font-size:14px;margin-bottom:12px;outline:none}
.auth input:focus{border-color:#3483fa}
.auth button{width:100%;background:#3483fa;color:#fff;border:none;padding:11px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
.auth button:hover{background:#2563eb}
.container{max-width:1200px;margin:0 auto;padding:32px}
.section-title{font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;margin-top:32px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.card{background:#1e293b;border-radius:12px;padding:20px 24px;border:1px solid #334155}
.card .lbl{font-size:12px;color:#64748b;margin-bottom:6px}
.card .val{font-size:32px;font-weight:700}
.card .sub{font-size:12px;color:#64748b;margin-top:4px}
.card.green .val{color:#22c55e}.card.blue .val{color:#3483fa}.card.orange .val{color:#f59e0b}.card.red .val{color:#ef4444}
.box{background:#1e293b;border-radius:12px;padding:24px;border:1px solid #334155;margin-bottom:16px}
.box h3{font-size:14px;font-weight:600;margin-bottom:16px}
.box canvas{max-height:200px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:8px 12px;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;border-bottom:1px solid #334155}
td{padding:10px 12px;border-bottom:1px solid #1e293b}
tr:last-child td{border-bottom:none}
.pill{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600}
.pill.green{background:rgba(34,197,94,.15);color:#22c55e}
.pill.red{background:rgba(239,68,68,.15);color:#ef4444}
.pill.blue{background:rgba(52,131,250,.15);color:#3483fa}
.pill.orange{background:rgba(245,158,11,.15);color:#f59e0b}
.rbtn{background:#334155;color:#e2e8f0;border:none;padding:8px 16px;border-radius:8px;font-size:13px;cursor:pointer;margin-left:auto;display:block;margin-bottom:16px}
.rbtn:hover{background:#475569}
.loading{text-align:center;padding:80px;color:#64748b}
.err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#ef4444;padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:13px}
</style>
</head>
<body>
<div class="topbar">
  <span style="font-size:22px">📈<\/span>
  <h1>PrecioML<\/h1>
  <span class="badge">Admin<\/span>
  <span style="margin-left:auto;font-size:13px;color:#64748b" id="gen-at"><\/span>
<\/div>
<div class="auth" id="auth">
  <h2>🔐 Acceso admin<\/h2>
  <p>Ingresá el ADMIN_SECRET de Vercel.<\/p>
  <input type="password" id="sec" placeholder="ADMIN_SECRET" autofocus/>
  <button onclick="login()">Entrar<\/button>
  <div id="aerr" style="margin-top:12px;font-size:13px;color:#ef4444;display:none"><\/div>
<\/div>
<div class="container" id="dash" style="display:none">
  <button class="rbtn" onclick="load()">🔄 Actualizar<\/button>
  <div id="content" class="loading">Cargando...<\/div>
<\/div>
<script>
let S='';
function login(){
  S=document.getElementById('sec').value.trim();
  if(!S)return;
  document.getElementById('auth').style.display='none';
  document.getElementById('dash').style.display='block';
  load();
}
document.getElementById('sec').addEventListener('keydown',function(e){if(e.key==='Enter')login();});
async function load(){
  const c=document.getElementById('content');
  c.innerHTML='<div class="loading">Cargando...</div>';
  try{
    const r=await fetch(window.location.href,{headers:{'Authorization':'Bearer '+S}});
    if(r.status===401){
      document.getElementById('aerr').textContent='Secret incorrecto.';
      document.getElementById('aerr').style.display='block';
      document.getElementById('auth').style.display='block';
      document.getElementById('dash').style.display='none';
      return;
    }
    if(!r.ok)throw new Error('Error '+r.status);
    const d=await r.json();
    render(d);
  }catch(e){c.innerHTML='<div class="err">'+e.message+'</div>';}
}
function fmt(ts){if(!ts)return '—';return new Date(ts).toLocaleDateString('es-AR',{day:'numeric',month:'short',year:'numeric'});}
function pill(method){const m={mercadopago:'blue',promo:'orange',test:'orange',lifetime:'green',unknown:'red'};return '<span class="pill '+(m[method]||'blue')+'">'+method+'</span>';}
function render(data){
  document.getElementById('gen-at').textContent='Actualizado: '+new Date(data.generatedAt).toLocaleTimeString('es-AR');
  const{installs,premium,codes,recentActivations}=data;
  const conv=installs.total>0?((premium.active/installs.total)*100).toFixed(1):0;
  let h='';
  h+='<div class="section-title">Resumen general</div>';
  h+='<div class="cards">'+
    '<div class="card blue"><div class="lbl">Instalaciones</div><div class="val">'+installs.total.toLocaleString('es-AR')+'</div><div class="sub">dispositivos únicos</div></div>'+
    '<div class="card green"><div class="lbl">Premium activos</div><div class="val">'+premium.active+'</div><div class="sub">de '+premium.total+' totales</div></div>'+
    '<div class="card orange"><div class="lbl">Conversión</div><div class="val">'+conv+'%</div><div class="sub">install → premium</div></div>'+
    '<div class="card red"><div class="lbl">Vencidos</div><div class="val">'+premium.expired+'</div><div class="sub">sin renovar</div></div>'+
  '</div>';
  const l14=installs.byDay.slice(-14);
  h+='<div class="section-title">Instalaciones — últimos 14 días</div>';
  h+='<div class="box"><canvas id="ci"></canvas></div>';
  h+='<div class="two">';
  h+='<div class="box"><h3>Por método de pago</h3>';
  if(Object.keys(premium.methodBreakdown).length===0)h+='<p style="color:#64748b;font-size:13px">Sin datos</p>';
  else h+='<canvas id="cm"></canvas>';
  h+='</div>';
  h+='<div class="box"><h3>Códigos promo</h3>';
  if(codes.length===0)h+='<p style="color:#64748b;font-size:13px">No hay códigos</p>';
  else{
    h+='<table><thead><tr><th>Código</th><th>Usados</th><th>Límite</th></tr></thead><tbody>';
    codes.forEach(function(c){const p=c.maxUses<999?Math.round((c.usedCount/c.maxUses)*100):null;h+='<tr><td style="font-family:monospace;font-weight:600">'+c.code+'</td><td><span class="pill '+(c.usedCount>0?'green':'blue')+'">'+c.usedCount+'</span></td><td>'+(c.maxUses>=999?'∞':c.maxUses+(p!==null?' ('+p+'%)':''))+'</td></tr>';});
    h+='</tbody></table>';
  }
  h+='</div></div>';
  h+='<div class="section-title">Últimas activaciones premium</div>';
  h+='<div class="box"><table><thead><tr><th>ID</th><th>Email</th><th>Método</th><th>Activado</th><th>Vence</th><th>Estado</th></tr></thead><tbody>';
  if(recentActivations.length===0)h+='<tr><td colspan="6" style="color:#64748b;text-align:center">Sin activaciones</td></tr>';
  else recentActivations.slice(0,20).forEach(function(u){h+='<tr><td style="font-family:monospace;color:#64748b">'+u.id+'</td><td>'+(u.email||'<span style="color:#475569">—</span>')+'</td><td>'+pill(u.method)+'</td><td>'+fmt(u.activatedAt)+'</td><td>'+fmt(u.expiresAt)+'</td><td><span class="pill '+(u.active?'green':'red')+'">'+(u.active?'Activo':'Vencido')+'</span></td></tr>';});
  h+='</tbody></table></div>';
  document.getElementById('content').innerHTML=h;
  new Chart(document.getElementById('ci'),{type:'bar',data:{labels:l14.map(function(d){return d.date.slice(5);}),datasets:[{label:'Instalaciones',data:l14.map(function(d){return d.count;}),backgroundColor:'#3483fa',borderRadius:4}]},options:{plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#64748b'},grid:{color:'#1e293b'}},y:{ticks:{color:'#64748b',stepSize:1},grid:{color:'#334155'},beginAtZero:true}}}});
  if(document.getElementById('cm')){const ml=Object.keys(premium.methodBreakdown);const mc={mercadopago:'#3483fa',promo:'#f59e0b',test:'#f59e0b',lifetime:'#22c55e',unknown:'#ef4444'};new Chart(document.getElementById('cm'),{type:'doughnut',data:{labels:ml,datasets:[{data:ml.map(function(k){return premium.methodBreakdown[k];}),backgroundColor:ml.map(function(k){return mc[k]||'#64748b';}),borderWidth:0}]},options:{plugins:{legend:{labels:{color:'#e2e8f0',font:{size:12}}}}}});}
}
<\/script>
</body>
</html>`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers['authorization'] || '';

  // Sin auth header → servir el dashboard HTML
  if (!auth) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(DASHBOARD_HTML);
  }

  // Con auth header incorrecto → 401
  if (auth !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const now = Date.now();

    const [totalInstalls, totalInstallsCounter] = await Promise.all([
      redis.scard('pml:installs'),
      redis.get('pml:installs:total'),
    ]);

    const dailyKeys = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
      dailyKeys.push('pml:installs:daily:' + d);
    }
    const dailyCounts = await Promise.all(dailyKeys.map(k => redis.get(k)));
    const installsByDay = dailyKeys.map((k, i) => ({
      date: k.replace('pml:installs:daily:', ''),
      count: parseInt(dailyCounts[i] || '0', 10),
    }));

    const premiumEntries = await redis.zrange(
      'pml:premium:expiries', '-inf', '+inf', { byScore: true, withScores: true }
    );

    let activePremium = 0, expiredPremium = 0;
    const recentActivations = [];

    const premiumIds = (premiumEntries || []).map(e =>
      typeof e === 'object' && e.member !== undefined
        ? { id: e.member, score: Number(e.score) } : null
    ).filter(Boolean);

    const premiumDataList = await Promise.all(
      premiumIds.map(({ id }) => redis.get('pml:premium:' + id))
    );

    premiumIds.forEach(({ id, score }, idx) => {
      const raw = premiumDataList[idx];
      if (!raw) return;
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (score > now) activePremium++; else expiredPremium++;
      recentActivations.push({
        id: id.substring(0, 8) + '…',
        email: data.email || null,
        method: data.method || 'unknown',
        plan: data.plan || 'monthly',
        activatedAt: data.activatedAt,
        expiresAt: data.expiresAt,
        active: score > now,
      });
    });

    recentActivations.sort((a, b) => (b.activatedAt || 0) - (a.activatedAt || 0));

    const codeKeys = await redis.keys('pml:code:*');
    const codeNames = [...new Set(
      (codeKeys || []).filter(k => !k.includes(':used')).map(k => k.replace('pml:code:', ''))
    )];

    const codeStats = await Promise.all(
      codeNames.map(async (code) => {
        const [data, usedCount] = await Promise.all([
          redis.hgetall('pml:code:' + code),
          redis.scard('pml:code:' + code + ':used'),
        ]);
        return { code, maxUses: parseInt(data?.maxUses || '999', 10), usedCount: usedCount || 0 };
      })
    );

    const methodBreakdown = recentActivations.reduce((acc, u) => {
      acc[u.method] = (acc[u.method] || 0) + 1; return acc;
    }, {});

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      installs: { total: totalInstalls || 0, newInstalls: parseInt(totalInstallsCounter || '0', 10), byDay: installsByDay },
      premium: { total: premiumIds.length, active: activePremium, expired: expiredPremium, methodBreakdown },
      codes: codeStats,
      recentActivations: recentActivations.slice(0, 50),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
