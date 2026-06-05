// ARCHIVO: api/admin-stats.js
// Sin auth header → sirve el dashboard HTML
// Con Authorization: Bearer <secret> → retorna JSON con métricas completas
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
.container{max-width:1200px;margin:0 auto;padding:32px}
.section-title{font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;margin-top:28px}
.mrr-hero{background:linear-gradient(135deg,#0f2a4a 0%,#1e293b 100%);border:1px solid #3483fa55;border-radius:16px;padding:28px 32px;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}
.mrr-main .mrr-tag{font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px}
.mrr-main .mrr-val{font-size:52px;font-weight:800;color:#3483fa;line-height:1}
.mrr-main .mrr-sub{font-size:13px;color:#64748b;margin-top:8px}
.mrr-aside{display:flex;gap:40px}
.mrr-stat .ms-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.mrr-stat .ms-val{font-size:26px;font-weight:700}
.mrr-stat .ms-sub{font-size:11px;color:#475569;margin-top:3px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.card{background:#1e293b;border-radius:12px;padding:18px 20px;border:1px solid #334155}
.card .lbl{font-size:11px;color:#64748b;margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em}
.card .val{font-size:28px;font-weight:700;line-height:1.1}
.card .sub{font-size:11px;color:#64748b;margin-top:4px}
.card.green .val{color:#22c55e}.card.blue .val{color:#3483fa}.card.orange .val{color:#f59e0b}
.card.red .val{color:#ef4444}.card.purple .val{color:#a78bfa}.card.teal .val{color:#2dd4bf}
.box{background:#1e293b;border-radius:12px;padding:20px 24px;border:1px solid #334155;margin-bottom:12px}
.box h3{font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:16px}
.box canvas{max-height:200px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.toggle{display:flex;gap:6px;margin-bottom:12px}
.toggle button{background:#1e293b;color:#64748b;border:1px solid #334155;padding:5px 14px;border-radius:6px;font-size:12px;cursor:pointer;transition:all .15s}
.toggle button.active{background:#3483fa;color:#fff;border-color:#3483fa}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:8px 10px;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;border-bottom:1px solid #334155}
td{padding:9px 10px;border-bottom:1px solid #1e293b;vertical-align:middle}
tr:last-child td{border-bottom:none}
.pill{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600}
.pill.green{background:rgba(34,197,94,.15);color:#22c55e}
.pill.red{background:rgba(239,68,68,.15);color:#ef4444}
.pill.blue{background:rgba(52,131,250,.15);color:#3483fa}
.pill.orange{background:rgba(245,158,11,.15);color:#f59e0b}
.pill.purple{background:rgba(167,139,250,.15);color:#a78bfa}
.pill.grey{background:rgba(100,116,139,.15);color:#94a3b8}
.rbtn{background:#334155;color:#e2e8f0;border:none;padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;margin-left:auto;display:block;margin-bottom:16px}
.rbtn:hover{background:#475569}
.loading{text-align:center;padding:60px;color:#64748b}
.na{color:#475569;font-size:12px;font-style:italic}
.alert-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0;text-align:center}
.alert-grid .ag-item{padding:12px 8px;border-right:1px solid #334155}
.alert-grid .ag-item:last-child{border-right:none}
.alert-grid .ag-val{font-size:30px;font-weight:700;color:#2dd4bf}
.alert-grid .ag-lbl{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-top:4px}
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
var S='', D=null, chartI=null, chartM=null, DAYS=30;

function login(){
  S=document.getElementById('sec').value.trim();
  if(!S)return;
  document.getElementById('auth').style.display='none';
  document.getElementById('dash').style.display='block';
  load();
}
document.getElementById('sec').addEventListener('keydown',function(e){if(e.key==='Enter')login();});

async function load(){
  var c=document.getElementById('content');
  c.innerHTML='<div class="loading">Cargando...<\/div>';
  try{
    var r=await fetch(window.location.href,{headers:{'Authorization':'Bearer '+S}});
    if(r.status===401){
      document.getElementById('aerr').textContent='Secret incorrecto.';
      document.getElementById('aerr').style.display='block';
      document.getElementById('auth').style.display='block';
      document.getElementById('dash').style.display='none';
      return;
    }
    if(!r.ok) throw new Error('Error '+r.status);
    D=await r.json();
    render(D);
  }catch(e){c.innerHTML='<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#ef4444;padding:12px 16px;border-radius:8px;font-size:13px">'+e.message+'<\/div>';}
}

function fmt(ts){if(!ts)return '—';return new Date(ts).toLocaleDateString('es-AR',{day:'numeric',month:'short',year:'numeric'});}
function ars(n){if(n===null||n===undefined)return '—';return '$'+Math.round(n).toLocaleString('es-AR');}
function na(v,sfx){return v===null||v===undefined?'<span class="na">sin datos<\/span>':v+(sfx||'');}
function mp(method){var m={mercadopago:'blue',promo:'orange',test:'orange',lifetime:'purple',unknown:'grey'};return '<span class="pill '+(m[method]||'blue')+'">'+method+'<\/span>';}

function setDays(d){
  DAYS=d;
  document.querySelectorAll('.toggle button').forEach(function(b){b.classList.toggle('active',+b.dataset.d===d);});
  if(D) updateChart();
}

function updateChart(){
  if(!chartI||!D)return;
  var days=D.installs.byDay.slice(-DAYS);
  chartI.data.labels=days.map(function(x){return x.date.slice(5);});
  chartI.data.datasets[0].data=days.map(function(x){return x.count;});
  chartI.update();
}

function render(data){
  document.getElementById('gen-at').textContent='Actualizado: '+new Date(data.generatedAt).toLocaleTimeString('es-AR');
  var ins=data.installs, pre=data.premium, biz=data.business, al=data.alerts, codes=data.codes, acts=data.recentActivations;
  var conv=ins.total>0?((pre.active/ins.total)*100).toFixed(1):'0.0';
  var h='';

  var churnColor=biz.churnRate!==null&&biz.churnRate>10?'#ef4444':'#22c55e';
  h+='<div class="mrr-hero">';
  h+='<div class="mrr-main">';
  h+='<div class="mrr-tag">Monthly Recurring Revenue<\/div>';
  h+='<div class="mrr-val">'+ars(biz.mrr)+'<\/div>';
  h+='<div class="mrr-sub">'+pre.active+' suscriptor'+(pre.active!==1?'es':'')+' activo'+(pre.active!==1?'s':'')+' &bull; plan mensual<\/div>';
  h+='<\/div>';
  h+='<div class="mrr-aside">';
  h+='<div class="mrr-stat">';
  h+='<div class="ms-label">Retención<\/div>';
  h+='<div class="ms-val" style="color:#2dd4bf">'+na(biz.retentionRate,'%')+'<\/div>';
  h+='<div class="ms-sub">'+(biz.eligibleForRetention>0?biz.retainedCount+'/'+biz.eligibleForRetention+' usuarios':'—')+'<\/div>';
  h+='<\/div>';
  h+='<div class="mrr-stat">';
  h+='<div class="ms-label">Churn<\/div>';
  h+='<div class="ms-val" style="color:'+churnColor+'">'+na(biz.churnRate,'%')+'<\/div>';
  h+='<div class="ms-sub">'+(biz.cancelledCount>0?biz.cancelledCount+' cancelación'+(biz.cancelledCount!==1?'es':''):'sin cancelaciones')+'<\/div>';
  h+='<\/div>';
  h+='<\/div>';
  h+='<\/div>';

  h+='<div class="section-title">Resumen general<\/div>';
  h+='<div class="cards">'+
    '<div class="card blue"><div class="lbl">Instalaciones<\/div><div class="val">'+ins.total.toLocaleString('es-AR')+'<\/div><div class="sub">dispositivos únicos<\/div><\/div>'+
    '<div class="card green"><div class="lbl">Premium activos<\/div><div class="val">'+pre.active+'<\/div><div class="sub">de '+pre.total+' totales<\/div><\/div>'+
    '<div class="card orange"><div class="lbl">Conversión<\/div><div class="val">'+conv+'%<\/div><div class="sub">install → premium<\/div><\/div>'+
    '<div class="card red"><div class="lbl">Vencidos<\/div><div class="val">'+pre.expired+'<\/div><div class="sub">'+(pre.expiredThisMonth>0?pre.expiredThisMonth+' este mes':'sin renovar')+'<\/div><\/div>'+
    '<div class="card purple"><div class="lbl">Renovaciones<\/div><div class="val">'+biz.renewedCount+'<\/div><div class="sub">≥2 pagos realizados<\/div><\/div>'+
    '<\/div>';

  h+='<div class="section-title">Instalaciones nuevas<\/div>';
  h+='<div class="toggle">'+
    '<button data-d="14" onclick="setDays(14)" class="'+(DAYS===14?'active':'')+'">14 días<\/button>'+
    '<button data-d="30" onclick="setDays(30)" class="'+(DAYS===30?'active':'')+'">30 días<\/button>'+
    '<\/div>';
  h+='<div class="box"><canvas id="ci"><\/canvas><\/div>';

  h+='<div class="two">';
  h+='<div class="box"><h3>Por método de pago<\/h3>';
  if(!pre.methodBreakdown||Object.keys(pre.methodBreakdown).length===0)
    h+='<p style="color:#64748b;font-size:13px;padding:8px 0">Sin datos aún<\/p>';
  else h+='<canvas id="cm"><\/canvas>';
  h+='<\/div>';

  h+='<div class="box"><h3>Alertas de precio<\/h3>';
  h+='<div class="alert-grid">'+
    '<div class="ag-item"><div class="ag-val">'+al.totalActive+'<\/div><div class="ag-lbl">Activas<\/div><\/div>'+
    '<div class="ag-item"><div class="ag-val">'+al.triggeredThisWeek+'<\/div><div class="ag-lbl">Disparadas 7d<\/div><\/div>'+
    '<div class="ag-item"><div class="ag-val">'+al.uniqueProducts+'<\/div><div class="ag-lbl">Productos<\/div><\/div>'+
    '<\/div><\/div>';
  h+='<\/div>';

  h+='<div class="section-title">Códigos promo<\/div>';
  h+='<div class="box">';
  if(!codes||codes.length===0){
    h+='<p style="color:#64748b;font-size:13px">No hay códigos creados<\/p>';
  }else{
    h+='<table><thead><tr><th>Código<\/th><th>Usados<\/th><th>Límite<\/th><\/tr><\/thead><tbody>';
    codes.forEach(function(c){
      var p=c.maxUses<999?Math.round((c.usedCount/c.maxUses)*100):null;
      h+='<tr>'+
        '<td style="font-family:monospace;font-weight:600;color:#e2e8f0">'+c.code+'<\/td>'+
        '<td><span class="pill '+(c.usedCount>0?'green':'grey')+'">'+c.usedCount+'<\/span><\/td>'+
        '<td style="color:#94a3b8">'+(c.maxUses>=999?'∞':c.maxUses+(p!==null?' ('+p+'%)':''))+'<\/td>'+
        '<\/tr>';
    });
    h+='<\/tbody><\/table>';
  }
  h+='<\/div>';

  h+='<div class="section-title">Últimas activaciones premium<\/div>';
  h+='<div class="box"><table><thead><tr>'+
    '<th>Email<\/th><th>Método<\/th><th>Monto<\/th><th>Activado<\/th><th>Vence<\/th><th>Estado<\/th>'+
    '<\/tr><\/thead><tbody>';
  if(!acts||acts.length===0){
    h+='<tr><td colspan="6" style="color:#64748b;text-align:center;padding:24px">Sin activaciones aún<\/td><\/tr>';
  }else{
    acts.slice(0,20).forEach(function(u){
      var estado=u.active
        ?'<span class="pill green">Activo<\/span>'
        :(u.subscriptionCancelled?'<span class="pill red">Cancelado<\/span>':'<span class="pill grey">Vencido<\/span>');
      h+='<tr>'+
        '<td style="font-weight:500">'+(u.email||'<span style="color:#475569">—<\/span>')+'<\/td>'+
        '<td>'+mp(u.method)+'<\/td>'+
        '<td style="font-weight:600;color:#e2e8f0">'+(u.amount?ars(u.amount):'—')+'<\/td>'+
        '<td style="color:#64748b">'+fmt(u.activatedAt)+'<\/td>'+
        '<td style="color:#64748b">'+fmt(u.expiresAt)+'<\/td>'+
        '<td>'+estado+'<\/td>'+
        '<\/tr>';
    });
  }
  h+='<\/tbody><\/table><\/div>';

  document.getElementById('content').innerHTML=h;

  if(chartI){chartI.destroy();chartI=null;}
  var days=ins.byDay.slice(-DAYS);
  chartI=new Chart(document.getElementById('ci'),{
    type:'bar',
    data:{
      labels:days.map(function(d){return d.date.slice(5);}),
      datasets:[{label:'Instalaciones',data:days.map(function(d){return d.count;}),backgroundColor:'#3483fa',borderRadius:4}]
    },
    options:{plugins:{legend:{display:false}},scales:{
      x:{ticks:{color:'#64748b'},grid:{color:'#1e293b'}},
      y:{ticks:{color:'#64748b',stepSize:1},grid:{color:'#334155'},beginAtZero:true}
    }}
  });

  if(chartM){chartM.destroy();chartM=null;}
  var cmEl=document.getElementById('cm');
  if(cmEl){
    var ml=Object.keys(pre.methodBreakdown);
    var mc={mercadopago:'#3483fa',promo:'#f59e0b',test:'#f59e0b',lifetime:'#a78bfa',unknown:'#ef4444'};
    chartM=new Chart(cmEl,{
      type:'doughnut',
      data:{
        labels:ml,
        datasets:[{data:ml.map(function(k){return pre.methodBreakdown[k];}),backgroundColor:ml.map(function(k){return mc[k]||'#64748b';}),borderWidth:0}]
      },
      options:{plugins:{legend:{labels:{color:'#e2e8f0',font:{size:12}}}}}
    });
  }
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

  if (!auth) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(DASHBOARD_HTML);
  }

  if (auth !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const totalInstalls = await redis.scard('pml:installs');

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

    const premiumIds = (premiumEntries || [])
      .map(e => typeof e === 'object' && e.member !== undefined
        ? { id: e.member, score: Number(e.score) } : null)
      .filter(Boolean);

    const premiumDataList = await Promise.all(
      premiumIds.map(({ id }) => redis.get('pml:premium:' + id))
    );

    let activePremium = 0, expiredPremium = 0, mrr = 0;
    let cancelledCount = 0, renewedCount = 0;
    let retainedCount = 0, eligibleForRetention = 0;
    let expiredThisMonth = 0;
    const methodBreakdown = {};
    const recentActivations = [];

    premiumIds.forEach(({ id, score }, idx) => {
      const raw = premiumDataList[idx];
      if (!raw) return;
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const isActive = score > now;

      if (isActive) activePremium++;
      else expiredPremium++;

      if (isActive && data.method === 'mercadopago' && data.amount) {
        mrr += Number(data.amount);
      }

      if (!isActive) {
        if (data.subscriptionCancelled) cancelledCount++;
        if (score > thirtyDaysAgo) expiredThisMonth++;
      }

      if (data.activatedAt && data.lastPaymentAt &&
          (data.lastPaymentAt - data.activatedAt) > 25 * 24 * 60 * 60 * 1000) {
        renewedCount++;
      }

      if (data.activatedAt && data.activatedAt < thirtyDaysAgo) {
        eligibleForRetention++;
        if (isActive) retainedCount++;
      }

      const method = data.method || 'unknown';
      methodBreakdown[method] = (methodBreakdown[method] || 0) + 1;

      recentActivations.push({
        email: data.email || null,
        method,
        plan: data.plan || 'monthly',
        amount: data.amount || null,
        activatedAt: data.activatedAt,
        expiresAt: data.expiresAt,
        active: isActive,
        subscriptionCancelled: data.subscriptionCancelled || false,
      });
    });

    recentActivations.sort((a, b) => (b.activatedAt || 0) - (a.activatedAt || 0));

    const totalPremium = premiumIds.length;
    const churnRate = totalPremium > 0
      ? parseFloat(((cancelledCount / totalPremium) * 100).toFixed(1))
      : null;
    const retentionRate = eligibleForRetention > 0
      ? parseFloat(((retainedCount / eligibleForRetention) * 100).toFixed(1))
      : null;

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

    let totalActiveAlerts = 0, alertsTriggeredThisWeek = 0;
    const uniqueProductIds = new Set();

    try {
      const alertIds = await redis.smembers('alerts:index');
      if (alertIds && alertIds.length > 0) {
        const sample = alertIds.slice(0, 500);
        const alertData = await Promise.all(sample.map(id => redis.get('alerts:' + id)));
        alertData.forEach(raw => {
          if (!raw) return;
          const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (!Array.isArray(arr)) return;
          arr.forEach(a => {
            if (!a.triggered) {
              totalActiveAlerts++;
              if (a.mlItemId) uniqueProductIds.add(a.mlItemId);
            }
            if (a.triggered && a.triggeredAt && a.triggeredAt > sevenDaysAgo) {
              alertsTriggeredThisWeek++;
            }
          });
        });
      }
    } catch (alertErr) {
      console.error('[admin-stats] alerts error:', alertErr.message);
    }

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      installs: {
        total: totalInstalls || 0,
        byDay: installsByDay,
      },
      premium: {
        total: totalPremium,
        active: activePremium,
        expired: expiredPremium,
        expiredThisMonth,
        methodBreakdown,
      },
      business: {
        mrr,
        churnRate,
        retentionRate,
        retainedCount,
        eligibleForRetention,
        cancelledCount,
        renewedCount,
      },
      alerts: {
        totalActive: totalActiveAlerts,
        triggeredThisWeek: alertsTriggeredThisWeek,
        uniqueProducts: uniqueProductIds.size,
      },
      codes: codeStats,
      recentActivations: recentActivations.slice(0, 50),
    });
  } catch (err) {
    console.error('[admin-stats] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
