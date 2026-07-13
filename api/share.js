// api/share.js
// POST -> crea un link publico con el historial de precios (solo Premium)
// GET ?slug=xxx -> sirve una pagina HTML publica con el historial
// Ambos metodos viven en el mismo archivo para no sumar una funcion mas
// al limite de 12 de Vercel Hobby (antes esto vivia en api/s/[slug].js,
// que se borro; el shareUrl viejo apuntaba ahi y por eso daba 404).
import { kv } from '@vercel/kv';
import { randomBytes } from 'crypto';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[c];
  });
}

function renderSharePage(data) {
  var title = escapeHtml(data.title || 'Producto de MercadoLibre');
  var history = Array.isArray(data.history) ? data.history : [];
  var prices = history.map(function (h) { return h.price; });
  var labels = history.map(function (h) {
    return new Date(h.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  });
  var current = prices.length ? prices[prices.length - 1] : null;
  var min = prices.length ? Math.min.apply(null, prices) : null;
  var max = prices.length ? Math.max.apply(null, prices) : null;
  var url = data.url ? escapeHtml(data.url) : null;

  function ars(n) {
    return n === null || n === undefined ? '-' : '$' + Math.round(n).toLocaleString('es-AR');
  }

  return '<!DOCTYPE html>' +
'<html lang="es">' +
'<head>' +
'<meta charset="UTF-8"/>' +
'<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
'<title>' + title + ' - Historial de precio | PrecioML</title>' +
'<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"><\/script>' +
'<style>' +
'*{box-sizing:border-box;margin:0;padding:0}' +
'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}' +
'.topbar{background:#1e293b;border-bottom:1px solid #334155;padding:16px 24px;display:flex;align-items:center;gap:10px}' +
'.topbar h1{font-size:18px;font-weight:700}' +
'.badge{background:#3483fa;color:#fff;font-size:11px;padding:2px 8px;border-radius:99px;font-weight:600}' +
'.container{max-width:640px;margin:0 auto;padding:24px}' +
'.title{font-size:20px;font-weight:700;margin-bottom:18px;line-height:1.3}' +
'.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}' +
'.card{background:#1e293b;border-radius:12px;padding:14px 16px;border:1px solid #334155;text-align:center}' +
'.card .lbl{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}' +
'.card .val{font-size:20px;font-weight:700}' +
'.card.now .val{color:#3483fa}.card.min .val{color:#22c55e}.card.max .val{color:#ef4444}' +
'.box{background:#1e293b;border-radius:12px;padding:18px 20px;border:1px solid #334155;margin-bottom:18px}' +
'.box h3{font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px}' +
'.cta{display:block;text-align:center;background:#3483fa;color:#fff;text-decoration:none;padding:13px;border-radius:10px;font-weight:600;font-size:14px}' +
'.footer{text-align:center;font-size:12px;color:#475569;margin-top:24px}' +
'.footer a{color:#3483fa;text-decoration:none}' +
'</style>' +
'</head>' +
'<body>' +
'<div class="topbar"><h1>PrecioML<\/h1><span class="badge">Historial compartido<\/span></div>' +
'<div class="container">' +
'<div class="title">' + title + '</div>' +
'<div class="cards">' +
'<div class="card now"><div class="lbl">Actual<\/div><div class="val">' + ars(current) + '<\/div></div>' +
'<div class="card min"><div class="lbl">Minimo<\/div><div class="val">' + ars(min) + '<\/div></div>' +
'<div class="card max"><div class="lbl">Maximo<\/div><div class="val">' + ars(max) + '<\/div></div>' +
'</div>' +
'<div class="box"><h3>Evolucion del precio<\/h3><canvas id="chart"><\/canvas></div>' +
(url ? '<a class="cta" href="' + url + '" target="_blank" rel="noopener">Ver producto en MercadoLibre<\/a>' : '') +
'<div class="footer">Historial trackeado con <a href="https://precioml-backend.vercel.app" target="_blank">PrecioML<\/a>, extension gratis para Chrome<\/div>' +
'</div>' +
'<script>' +
'new Chart(document.getElementById("chart"),{type:"line",data:{labels:' + JSON.stringify(labels) + ',datasets:[{label:"Precio",data:' + JSON.stringify(prices) + ',borderColor:"#3483fa",backgroundColor:"rgba(52,131,250,.12)",fill:true,tension:.25,pointRadius:2}]},options:{plugins:{legend:{display:false}},scales:{x:{ticks:{color:"#64748b"},grid:{color:"#1e293b"}},y:{ticks:{color:"#64748b"},grid:{color:"#334155"}}}}});' +
'<\/script>' +
'</body>' +
'</html>';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: vista publica del historial compartido (no requiere auth)
  if (req.method === 'GET') {
    const slug = (req.query?.slug || '').toString().trim();
    if (!slug) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(400).send('<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;color:#64748b">Falta el link completo.</body></html>');
    }
    try {
      const raw = await kv.get(`share:${slug}`);
      if (!raw) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send('<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#0f172a;color:#94a3b8;text-align:center;padding:80px 20px"><h2 style="color:#e2e8f0;margin-bottom:10px">Este link ya no esta disponible</h2><p>Puede haber expirado (los links duran 30 dias) o no existir.</p></body></html>');
      }
      const shareData = typeof raw === 'string' ? JSON.parse(raw) : raw;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(renderSharePage(shareData));
    } catch (err) {
      console.error('[share] GET error:', err);
      return res.status(500).json({ error: 'Error cargando el link' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { installationId, productId, title, history, url } = req.body;
  if (!installationId || installationId.length < 10) {
    return res.status(400).json({ error: 'installationId invalido' });
  }

  const premiumRaw = await kv.get(`pml:premium:${installationId}`);
  const premiumData = premiumRaw ? (typeof premiumRaw === 'string' ? JSON.parse(premiumRaw) : premiumRaw) : null;
  const isPremium = premiumData?.premium === true && (!premiumData.expiresAt || premiumData.expiresAt > Date.now());
  if (!isPremium) {
    return res.status(403).json({ error: 'Solo usuarios Premium pueden compartir historial' });
  }
  if (!productId || !title || !Array.isArray(history) || history.length < 2) {
    return res.status(400).json({ error: 'Datos insuficientes' });
  }

  try {
    const slug = randomBytes(4).toString('hex');
    const shareData = {
      productId,
      title: title.substring(0, 150),
      history: history.slice(-90),
      url: url || null,
      createdAt: Date.now(),
    };
    await kv.set(`share:${slug}`, shareData, { ex: 60 * 60 * 24 * 30 });
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const shareUrl = `https://${host}/api/share?slug=${slug}`;
    return res.status(200).json({ slug, shareUrl });
  } catch (err) {
    console.error('[share] POST error:', err);
    return res.status(500).json({ error: 'Error generando el link' });
  }
}
