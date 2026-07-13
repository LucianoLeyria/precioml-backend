// ARCHIVO: api/admin-stats.js
// Sin auth header -> sirve el dashboard HTML
// Con Authorization: Bearer <secret> -> retorna JSON con metricas completas
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
.pill.teal{background:rgba(45,212,191,.15);color:#2dd4bf}
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
.email-search{background:#0f172a;border:1px solid #334155;color:#e2e8f0;padding:7px 12px;border-radius:6px;font-size:13px;width:260px;outline:none}
.email-search:focus{border-color:#3483fa}
</style>
</head>
<body>
<div class="topbar">
<h1>PrecioML<\/h1>
<span class="badge">Admin<\/span>
<span style="margin-left:auto;font-size:13px;color:#64748b" id="gen-at"><\/span>
<\/div>

<div class="auth" id="auth">
<h2>Acceso admin<\/h2>
<p>Ingresa el ADMIN_SECRET de Vercel.<\/p>
<input type="password" id="sec" placeholder="ADMIN_SECRET" autofocus/>
<button onclick="login()">Entrar<\/button>
<div id="aerr" style="margin-top:12px;font-size:13px;color:#ef4444;display:none"><\/div>
<\/div>

<div class="container" id="dash" style="display:none">
<button class="rbtn" onclick="load()">Actualizar<\/button>
<div id="content" class="loading">Cargando...<\/div>
<\/div>

<script>
var S='', D=null, PERIOD='day';
var chartI=null, chartA=null, chartR=null, chartM=null;

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

function fmt(ts){if(!ts)return '-';return new Date(ts).toLocaleDateString('es-AR',{day:'numeric',month:'short',year:'numeric'});}
function ars(n){if(n===null||n===undefined)return '-';return '$'+Math.round(n).toLocaleString('es-AR');}
function na(v,sfx){return v===null||v===undefined?'<span class="na">sin datos<\/span>':v+(sfx||'');}
function mp(method){var m={mercadopago:'blue',promo:'orange',test:'orange',lifetime:'purple',unknown:'grey'};return '<span class="pill '+(m[method]||'blue')+'">'+method+'<\/span>';}

function filterEmails(){
  var q=document.getElementById('email-filter').value.toLowerCase();
  document.querySelectorAll('.email-row').forEach(function(r){
    r.style.display=r.cells[0].textContent.toLowerCase().includes(q)?'':'none';
  });
}

function setPeriod(p){
  PERIOD=p;
  if(D) render(D);
}

function periodKey(ts,period){
  var d=new Date(ts);
  if(period==='day') return d.toISOString().slice(0,10);
  if(period==='week'){
    var day=new Date(d);
    var wd=(day.getDay()+6)%7;
    day.setDate(day.getDate()-wd);
    return day.toISOString().slice(0,10);
  }
  if(period==='month') return d.toISOString().slice(0,7);
  return String(d.getFullYear());
}

function bucket(items,tsField,period,valField){
  var map={};
  (items||[]).forEach(function(it){
    var ts=it[tsField];
    if(!ts) return;
    var k=periodKey(ts,period);
    var v=valField?(Number(it[valField])||0):1;
    map[k]=(map[k]||0)+v;
  });
  return Object.keys(map).sort().map(function(k){return {key:k,value:map[k]};});
}

function drawBarChart(existing,canvasId,buckets,label,color){
  var el=document.getElementById(canvasId);
  if(!el) return null;
  if(existing) existing.destroy();
  return new Chart(el,{
    type:'bar',
    data:{
      labels:buckets.map(function(b){return b.key;}),
      datasets:[{label:label,data:buckets.map(function(b){return b.value;}),backgroundColor:color,borderRadius:4}]
    },
    options:{plugins:{legend:{display:false}},scales:{
      x:{ticks:{color:'#64748b'},grid:{color:'#1e293b'}},
      y:{ticks:{color:'#64748b'},grid:{color:'#334155'},beginAtZero:true}
    }}
  });
}

function render(data){
  document.getElementById('gen-at').textContent='Actualizado: '+new Date(data.generatedAt).toLocaleTimeString('es-AR');
  var ins=data.installs, pre=data.premium, biz=data.business, al=data.alerts, codes=data.codes, acts=data.recentActivations;
  var conv=ins.total>0?((pre.active/ins.total)*100).toFixed(1):'0.0';
  var emails=data.registeredEmails||[];
  var h='';

  var churnColor=biz.churnRate!==null&&biz.churnRate>10?'#ef4444':'#22c55e';
  h+='<div class="mrr-hero">';
  h+='<div class="mrr-main">';
  h+='<div class="mrr-tag">Monthly Recurring Revenue<\/div>';
  h+='<div class="mrr-val">'+ars(biz.mrr)+'<\/div>';
  h+='<div class="mrr-sub">'+pre.active+' suscriptor'+(pre.active!==1?'es':'')+' activo'+(pre.active!==1?'s':'')+' - plan mensual<\/div>';
  h+='<\/div>';
  h+='<div class="mrr-aside">';
  h+='<div class="mrr-stat">';
  h+='<div class="ms-label">Retencion<\/div>';
  h+='<div class="ms-val" style="color:#2dd4bf">'+na(biz.retentionRate,'%')+'<\/div>';
  h+='<div class="ms-sub">'+(biz.eligibleForRetention>0?biz.retainedCount+'/'+biz.eligibleForRetention+' usuarios':'-')+'<\/div>';
  h+='<\/div>';
  h+='<div class="mrr-stat">';
  h+='<div class="ms-label">Churn<\/div>';
  h+='<div class="ms-val" style="color:'+churnColor+'">'+na(biz.churnRate,'%')+'<\/div>';
  h+='<div class="ms-sub">'+(biz.cancelledCount>0?biz.cancelledCount+' cancelacion'+(biz.cancelledCount!==1?'es':''):'sin cancelaciones')+'<\/div>';
  h+='<\/div>';
  h+='<\/div>';
  h+='<\/div>';

  h+='<div class="section-title">Resumen general<\/div>';
  h+='<div class="cards">'+
    '<div class="card blue"><div class="lbl">Instalaciones<\/div><div class="val">'+ins.total.toLocaleString('es-AR')+'<\/div><div class="sub">dispositivos unicos<\/div><\/div>'+
    '<div class="card green"><div class="lbl">Premium activos<\/div><div class="val">'+pre.active+'<\/div><div class="sub">de '+pre.total+' totales<\/div><\/div>'+
    '<div class="card orange"><div class="lbl">Conversion<\/div><div class="val">'+conv+'%<\/div><div class="sub">install -> premium<\/div><\/div>'+
    '<div class="card red"><div class="lbl">Vencidos<\/div><div class="val">'+pre.expired+'<\/div><div class="sub">'+(pre.expiredThisMonth>0?pre.expiredThisMonth+' este mes':'sin renovar')+'<\/div><\/div>'+
    '<div class="card purple"><div class="lbl">Renovaciones<\/div><div class="val">'+biz.renewedCount+'<\/div><div class="sub">2 o mas pagos<\/div><\/div>'+
    '<\/div>';

  h+='<div class="section-title">Usuarios activos<\/div>';
  h+='<div class="cards">'+
    '<div class="card teal"><div class="lbl">Ultimas 24h<\/div><div class="val">'+ins.active.day+'<\/div><div class="sub">abrieron la extension<\/div><\/div>'+
    '<div class="card teal"><div class="lbl">Ultimos 7 dias<\/div><div class="val">'+ins.active.week+'<\/div><div class="sub">activos esta semana<\/div><\/div>'+
    '<div class="card teal"><div class="lbl">Ultimos 30 dias<\/div><div class="val">'+ins.active.month+'<\/div><div class="sub">activos este mes<\/div><\/div>'+
    '<div class="card blue"><div class="lbl">Emails capturados<\/div><div class="val">'+emails.length+'<\/div><div class="sub">premium + alertas + gratis<\/div><\/div>'+
    '<\/div>';

  h+='<div class="section-title">Actividad en el tiempo<\/div>';
  h+='<div class="toggle">';
  [['day','Diario'],['week','Semanal'],['month','Mensual'],['year','Anual']].forEach(function(p){
    h+='<button onclick="setPeriod(\\''+p[0]+'\\')" class="'+(PERIOD===p[0]?'active':'')+'">'+p[1]+'<\/button>';
  });
  h+='<\/div>';
  h+='<div class="two">';
  h+='<div class="box"><h3>Instalaciones<\/h3><canvas id="ci"><\/canvas><\/div>';
  h+='<div class="box"><h3>Alertas creadas<\/h3><canvas id="ca"><\/canvas><\/div>';
  h+='<\/div>';
  h+='<div class="box"><h3>Ingresos (ARS)<\/h3><canvas id="cr"><\/canvas><\/div>';

  h+='<div class="two">';
  h+='<div class="box"><h3>Por metodo de pago<\/h3>';
  if(!pre.methodBreakdown||Object.keys(pre.methodBreakdown).length===0)
    h+='<p style="color:#64748b;font-size:13px;padding:8px 0">Sin datos aun<\/p>';
  else h+='<canvas id="cm"><\/canvas>';
  h+='<\/div>';

  h+='<div class="box"><h3>Alertas de precio<\/h3>';
  h+='<div class="alert-grid">'+
    '<div class="ag-item"><div class="ag-val">'+al.totalActive+'<\/div><div class="ag-lbl">Activas<\/div><\/div>'+
    '<div class="ag-item"><div class="ag-val">'+al.triggeredThisWeek+'<\/div><div class="ag-lbl">Disparadas 7d<\/div><\/div>'+
    '<div class="ag-item"><div class="ag-val">'+al.uniqueProducts+'<\/div><div class="ag-lbl">Productos<\/div><\/div>'+
    '<\/div><\/div>';
  h+='<\/div>';

  h+='<div class="section-title">Version de la extension y productos mas trackeados<\/div>';
  h+='<div class="two">';
  h+='<div class="box"><h3>Version instalada<\/h3>';
  var vKeys=Object.keys(ins.versions||{}).sort();
  if(vKeys.length===0){
    h+='<p style="color:#64748b;font-size:13px">Sin datos<\/p>';
  }else{
    h+='<table><thead><tr><th>Version<\/th><th>Instalaciones<\/th><\/tr><\/thead><tbody>';
    vKeys.forEach(function(v){
      h+='<tr><td style="font-family:monospace">'+v+'<\/td><td>'+ins.versions[v]+'<\/td><\/tr>';
    });
    h+='<\/tbody><\/table>';
  }
  h+='<\/div>';
  h+='<div class="box"><h3>Productos mas trackeados<\/h3>';
  var top=al.topProducts||[];
  if(top.length===0){
    h+='<p style="color:#64748b;font-size:13px">Sin datos<\/p>';
  }else{
    h+='<table><thead><tr><th>Producto<\/th><th>Trackeos<\/th><\/tr><\/thead><tbody>';
    top.forEach(function(p){
      h+='<tr><td><a href="https://articulo.mercadolibre.com.ar/'+p.mlItemId+'" target="_blank" style="color:#3483fa;text-decoration:none;font-family:monospace">'+p.mlItemId+'<\/a><\/td><td>'+p.count+'<\/td><\/tr>';
    });
    h+='<\/tbody><\/table>';
  }
  h+='<\/div>';
  h+='<\/div>';

  h+='<div class="section-title">Codigos promo<\/div>';
  h+='<div class="box">';
  if(!codes||codes.length===0){
    h+='<p style="color:#64748b;font-size:13px">No hay codigos creados<\/p>';
  }else{
    h+='<table><thead><tr><th>Codigo<\/th><th>Usados<\/th><th>Limite<\/th><\/tr><\/thead><tbody>';
    codes.forEach(function(c){
      var p=c.maxUses<999?Math.round((c.usedCount/c.maxUses)*100):null;
      h+='<tr>'+
        '<td style="font-family:monospace;font-weight:600;color:#e2e8f0">'+c.code+'<\/td>'+
        '<td><span class="pill '+(c.usedCount>0?'green':'grey')+'">'+c.usedCount+'<\/span><\/td>'+
        '<td style="color:#94a3b8">'+(c.maxUses>=999?'sin limite':c.maxUses+(p!==null?' ('+p+'%)':''))+'<\/td>'+
        '<\/tr>';
    });
    h+='<\/tbody><\/table>';
  }
  h+='<\/div>';

  h+='<div class="section-title">Emails registrados ('+emails.length+')<\/div>';
  if(emails.length===0){
    h+='<div class="box"><p style="color:#64748b;font-size:13px">Sin emails registrados aun<\/p><\/div>';
  }else{
    h+='<div class="box">';
    h+='<div style="margin-bottom:12px"><input id="email-filter" class="email-search" oninput="filterEmails()" placeholder="Buscar email..."/><\/div>';
    h+='<table><thead><tr><th>Email<\/th><th>Fuente<\/th><\/tr><\/thead><tbody>';
    emails.forEach(function(e){
      var src=e.sources.map(function(s){
        var cls=s==='premium'?'green':(s==='gratis'?'teal':'blue');
        return '<span class="pill '+cls+'">'+s+'<\/span>';
      }).join(' ');
      h+='<tr class="email-row"><td style="font-size:13px">'+e.email+'<\/td><td>'+src+'<\/td><\/tr>';
    });
    h+='<\/tbody><\/table><\/div>';
  }

  h+='<div class="section-title">Ultimas activaciones premium<\/div>';
  h+='<div class="box"><table><thead><tr>'+
    '<th>Email<\/th><th>Metodo<\/th><th>Monto<\/th><th>Activado<\/th><th>Vence<\/th><th>Estado<\/th>'+
    '<\/tr><\/thead><tbody>';
  if(!acts||acts.length===0){
    h+='<tr><td colspan="6" style="color:#64748b;text-align:center;padding:24px">Sin activaciones aun<\/td><\/tr>';
  }else{
    acts.slice(0,20).forEach(function(u){
      var estado=u.active
        ?'<span class="pill green">Activo<\/span>'
        :(u.subscriptionCancelled?'<span class="pill red">Cancelado<\/span>':'<span class="pill grey">Vencido<\/span>');
      h+='<tr>'+
        '<td style="font-weight:500">'+(u.email||'<span style="color:#475569">-<\/span>')+'<\/td>'+
        '<td>'+mp(u.method)+'<\/td>'+
        '<td style="font-weight:600;color:#e2e8f0">'+(u.amount?ars(u.amount):'-')+'<\/td>'+
        '<td style="color:#64748b">'+fmt(u.activatedAt)+'<\/td>'+
        '<td style="color:#64748b">'+fmt(u.expiresAt)+'<\/td>'+
        '<td>'+estado+'<\/td>'+
        '<\/tr>';
    });
  }
  h+='<\/tbody><\/table><\/div>';

  document.getElementById('content').innerHTML=h;

  chartI=drawBarChart(chartI,'ci',bucket(ins.items,'installedAt',PERIOD),'Instalaciones','#3483fa');
  chartA=drawBarChart(chartA,'ca',bucket(al.items,'createdAt',PERIOD),'Alertas','#2dd4bf');
  var revenueItems=(acts||[]).filter(function(a){return a.amount;});
  chartR=drawBarChart(chartR,'cr',bucket(revenueItems,'activatedAt',PERIOD,'amount'),'Ingresos','#a78bfa');

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
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

    // Instalaciones: traemos todos los hashes para poder calcular
    // usuarios activos, distribucion de version y bucketing por periodo
    // sin tener que iterar claves por dia
    const installIds = (await redis.smembers('pml:installs')) || [];
    const installHashes = await Promise.all(
      installIds.map(id => redis.hgetall('pml:install:' + id))
    );

    const installItems = [];
    const versions = {};
    let activeDay = 0, activeWeek = 0, activeMonth = 0;
    const emailMap = new Map();

    installHashes.forEach(h => {
      if (!h) return;
      const installedAt = h.installedAt ? Number(h.installedAt) : null;
      const lastSeen = h.lastSeen ? Number(h.lastSeen) : null;
      const version = h.version || 'unknown';

      installItems.push({ installedAt, lastSeen, version });
      versions[version] = (versions[version] || 0) + 1;

      if (lastSeen && lastSeen > dayAgo) activeDay++;
      if (lastSeen && lastSeen > weekAgo) activeWeek++;
      if (lastSeen && lastSeen > monthAgo) activeMonth++;

      if (h.email) {
        const key = String(h.email).toLowerCase();
        emailMap.set(key, {
          email: h.email,
          sources: ['gratis'],
          firstSeen: h.emailSavedAt ? Number(h.emailSavedAt) : null,
        });
      }
    });

    // Premium
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

      if (data.email) {
        const key = String(data.email).toLowerCase();
        if (emailMap.has(key)) {
          const ex = emailMap.get(key);
          if (!ex.sources.includes('premium')) ex.sources.push('premium');
        } else {
          emailMap.set(key, { email: data.email, sources: ['premium'], firstSeen: data.activatedAt || null });
        }
      }
    });

    recentActivations.sort((a, b) => (b.activatedAt || 0) - (a.activatedAt || 0));

    const totalPremium = premiumIds.length;
    const churnRate = totalPremium > 0
      ? parseFloat(((cancelledCount / totalPremium) * 100).toFixed(1))
      : null;
    const retentionRate = eligibleForRetention > 0
      ? parseFloat(((retainedCount / eligibleForRetention) * 100).toFixed(1))
      : null;

    // Codigos promo
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

    // Alertas: activas, disparadas, productos mas trackeados, emails
    let totalActiveAlerts = 0, alertsTriggeredThisWeek = 0;
    const uniqueProductIds = new Set();
    const productCounts = new Map();
    const alertItems = [];

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
            if (a.mlItemId) {
              productCounts.set(a.mlItemId, (productCounts.get(a.mlItemId) || 0) + 1);
            }
            alertItems.push({
              createdAt: a.createdAt || null,
              hasTarget: !!a.targetPrice,
              hasRise: !!a.riseTargetPrice,
              hasAnyChange: !!a.anyChange,
            });
            if (a.email) {
              const key = String(a.email).toLowerCase();
              if (emailMap.has(key)) {
                const ex = emailMap.get(key);
                if (!ex.sources.includes('alerta')) ex.sources.push('alerta');
              } else {
                emailMap.set(key, { email: a.email, sources: ['alerta'], firstSeen: a.createdAt || null });
              }
            }
          });
        });
      }
    } catch (alertErr) {
      console.error('[admin-stats] alerts error:', alertErr.message);
    }

    const topProducts = [...productCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([mlItemId, count]) => ({ mlItemId, count }));

    const registeredEmails = [...emailMap.values()]
      .sort((a, b) => (b.firstSeen || 0) - (a.firstSeen || 0));

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      installs: {
        total: installIds.length,
        items: installItems,
        active: { day: activeDay, week: activeWeek, month: activeMonth },
        versions,
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
        items: alertItems,
        topProducts,
      },
      codes: codeStats,
      recentActivations: recentActivations.slice(0, 200),
      registeredEmails,
    });
  } catch (err) {
    console.error('[admin-stats] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
