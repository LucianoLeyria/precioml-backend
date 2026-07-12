// api/share.js
// POST: crea un link compartible del historial de precio (Premium).
// GET ?slug=xxx: muestra la pagina publica con ese historial.
// Se fusiono en un solo archivo (en vez de api/s/[slug].js separado)
// porque el plan Hobby de Vercel tiene un limite de 12 Serverless
// Functions por deployment y ya estabamos en el limite.
import { kv } from '@vercel/kv';
import { randomBytes } from 'crypto';

export default async function handler(req, res) {
    if (req.method === 'GET') {
          return handleView(req, res);
    }

  res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { installationId, productId, title, history, url } = req.body;
    if (!installationId || installationId.length < 10) {
          return res.status(400).json({ error: 'installationId invalido' });
    }

  const premiumRaw = await kv.get(`pml:premium:${installationId}`);
    const premiumData = premiumRaw
      ? (typeof premiumRaw === 'string' ? JSON.parse(premiumRaw) : premiumRaw)
          : null;
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
        return res.status(500).json({ error: 'Error generando el link' });
  }
}

// Vista publica del historial compartido.
// No requiere la extension instalada ni login.
async function handleView(req, res) {
    const { slug } = req.query;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!slug) {
        return res.status(400).send(renderError('Link invalido.'));
  }

  try {
        const data = await kv.get(`share:${slug}`);
        if (!data) {
                return res.status(404).send(renderError('Este link vencio o no existe. Los links de PrecioML duran 30 dias.'));
        }
        return res.status(200).send(renderShare(data));
  } catch (err) {
        return res.status(500).send(renderError('Error cargando el historial.'));
  }
}

function renderError(message) {
    return `<!DOCTYPE html>
    <html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>PrecioML</title>
    <style>
    body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:20px}
    .box{max-width:420px}h1{font-size:22px}p{color:#94a3b8;font-size:14px}a{color:#3483fa}
    </style>
    </head><body><div class="box"><h1>PrecioML</h1><p>${message}</p><p><a href="https://precioml.com">Conoce PrecioML</a></p></div></body></html>`;
}

function renderShare(data) {
    const fmt = (p) => `$ ${Math.round(p).toLocaleString('es-AR')}`;
    const history = Array.isArray(data.history) ? data.history : [];
    const prices = history.map(h => h.price).filter(p => typeof p === 'number');
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const current = prices[prices.length - 1];

  const svg = buildSvg(history, min, max);
    const title = escHtml(data.title || 'Producto');
    const productUrl = data.url ? escHtml(data.url) : null;

  return `<!DOCTYPE html>
  <html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} - Historial de precio - PrecioML</title>
  <meta property="og:title" content="${title} - Historial de precio"/>
  <meta property="og:description" content="Minimo: ${fmt(min)} | Actual: ${fmt(current)}"/>
  <style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px 16px;}
  .card{max-width:520px;margin:0 auto;background:#1e293b;border-radius:16px;padding:28px;border:1px solid #334155;}
  .logo{font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;}
  h1{font-size:18px;margin:0 0 20px;line-height:1.4;}
  .stats{display:flex;gap:0;margin-bottom:20px;border-bottom:1px solid #334155;padding-bottom:20px;}
  .stat{flex:1;text-align:center;}
  .stat .lbl{font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:6px;}
  .stat .val{font-size:16px;font-weight:700;}
  .stat .val.green{color:#22c55e}
  .stat .val.blue{color:#3483fa}
  .stat .val.red{color:#ef4444}
  .chart{margin-bottom:20px;}
  .cta{display:block;text-align:center;background:#3483fa;color:#fff;text-decoration:none;padding:13px;border-radius:10px;font-weight:700;font-size:14px;}
  .footer{text-align:center;font-size:11px;color:#475569;margin-top:20px;}
  .footer a{color:#3483fa;text-decoration:none;}
  </style>
  </head><body>
  <div class="card">
  <div class="logo">PrecioML</div>
  <h1>${title}</h1>
  <div class="stats">
  <div class="stat"><div class="lbl">Minimo</div><div class="val green">${fmt(min)}</div></div>
  <div class="stat"><div class="lbl">Actual</div><div class="val blue">${fmt(current)}</div></div>
  <div class="stat"><div class="lbl">Maximo</div><div class="val red">${fmt(max)}</div></div>
  </div>
  <div class="chart">${svg}</div>
  ${productUrl ? `<a class="cta" href="${productUrl}" target="_blank" rel="noopener">Ver publicacion en MercadoLibre</a>` : ''}
  <div class="footer">Historial trackeado con <a href="https://precioml.com">PrecioML</a> - extension gratis para MercadoLibre</div>
  </div>
  </body></html>`;
}

function buildSvg(history, min, max) {
    const W = 460;
    const H = 120;
    const range = (max - min) || 1;
    const coords = history.map((p, i) => ({
          x: (i / (history.length - 1 || 1)) * W,
          y: H - ((p.price - min) / range) * (H * 0.8) - H * 0.1,
    }));
    const points = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const area = `0,${H} ${points} ${W},${H}`;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#3483fa" stop-opacity="0.25"/>
    <stop offset="100%" stop-color="#3483fa" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="${area}" fill="url(#g)"/>
    <polyline points="${points}" fill="none" stroke="#3483fa" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
}

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
