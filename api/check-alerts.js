// api/check-alerts.js
// Cron job horario: chequea alertas contra la API de MercadoLibre y envia emails
// POST /api/check-alerts - Header: Authorization: Bearer CRON_SECRET

import { kv } from '@vercel/kv';

const ML_API = 'https://api.mercadolibre.com/items';
const ML_OAUTH_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';
const ML_REDIRECT_URI = 'https://precioml-backend.vercel.app/api/check-alerts';
const RESEND_API = 'https://api.resend.com/emails';
const FROM_EMAIL = 'PrecioML Alertas <alertas@precioml.crecimientoinsta.com>';

export default async function handler(req, res) {
  // Callback de OAuth: MercadoLibre redirige aca con ?code=... despues de que
  // el usuario autoriza la app en developers.mercadolibre.com.ar. Es un paso
  // unico manual, no requiere CRON_SECRET.
  if (req.method === 'GET' && req.query?.code) {
    return handleMLOAuthCallback(req, res);
  }

  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end();

  const stats = { checked: 0, triggered: 0, emails: 0, errors: [] };

  let mlAccessToken = null;
  try {
    mlAccessToken = await getMLAccessToken();
    if (!mlAccessToken) {
      stats.errors.push({ error: 'ML OAuth: todavia no se autorizo la app (falta el paso manual de /api/check-alerts?code=...)' });
    }
  } catch (oauthErr) {
    stats.errors.push({ error: `ML OAuth: ${oauthErr.message}` });
  }

  try {
    const installationIds = await kv.smembers('alerts:index');
    if (!installationIds || installationIds.length === 0) {
      return res.status(200).json({ ok: true, ...stats, message: 'Sin alertas registradas' });
    }

    for (const installationId of installationIds) {
      try {
        const alerts = (await kv.get(`alerts:${installationId}`)) || [];
        if (alerts.length === 0) { await kv.srem('alerts:index', installationId); continue; }

        const updatedAlerts = [];
        let changed = false;

        for (const alert of alerts) {
          if (alert.triggered) { updatedAlerts.push(alert); continue; }
          stats.checked++;

          let currentPrice = null;
          try {
            // Usamos el endpoint "multiget" (?ids=...) en vez de /items/{id}:
            // MercadoLibre restringio /items/{id} a que el access_token sea
            // del dueno del item, pero el multiget sigue siendo consultable
            // para items de terceros (ver docs: "Ítems y Búsquedas").
            const mlRes = await fetch(`${ML_API}?ids=${alert.mlItemId}&attributes=id,price,status`, {
              signal: AbortSignal.timeout(6000),
              headers: mlAccessToken ? { Authorization: `Bearer ${mlAccessToken}` } : {},
            });
            if (mlRes.ok) {
              const mlArr = await mlRes.json();
              const entry = Array.isArray(mlArr) ? mlArr[0] : null;
              if (entry && entry.code === 200 && entry.body) {
                const mlData = entry.body;
                if (mlData.status === 'active' || mlData.status === 'paused') {
                  currentPrice = mlData.price;
                }
              } else {
                stats.errors.push({ mlItemId: alert.mlItemId, error: `ML multiget code ${entry ? entry.code : '?'}: ${JSON.stringify(entry && entry.body).substring(0, 200)}` });
              }
            } else {
              const bodyText = await mlRes.text().catch(() => '');
              stats.errors.push({ mlItemId: alert.mlItemId, error: `ML HTTP ${mlRes.status}: ${bodyText.substring(0, 200)}` });
            }
          } catch (fetchErr) {
            stats.errors.push({ mlItemId: alert.mlItemId, error: fetchErr.message });
            updatedAlerts.push(alert);
            continue;
          }

          if (currentPrice === null) { updatedAlerts.push(alert); continue; }

          // Alerta de "cualquier cambio de precio" (Premium).
          // No se marca triggered: sigue viva monitoreando indefinidamente
          // hasta que el usuario la saca desde la extension.
          if (alert.anyChange) {
            if (alert.lastKnownPrice === null || alert.lastKnownPrice === undefined) {
              alert.lastKnownPrice = currentPrice;
              changed = true;
            } else if (alert.lastKnownPrice !== currentPrice) {
              stats.triggered++;
              const oldPrice = alert.lastKnownPrice;
              alert.lastKnownPrice = currentPrice;
              alert.lastNotifiedAt = Date.now();
              changed = true;

              if (alert.email) {
                try {
                  await sendChangeEmail(alert, oldPrice, currentPrice);
                  stats.emails++;
                } catch (emailErr) {
                  stats.errors.push({ mlItemId: alert.mlItemId, error: `Email: ${emailErr.message}` });
                }
              }
            }
            updatedAlerts.push(alert);
            continue;
          }

          // Alerta de precio objetivo (clasica).
          if (currentPrice <= alert.targetPrice) {
            stats.triggered++;
            alert.triggered = true;
            alert.triggeredAt = Date.now();
            alert.triggeredPrice = currentPrice;
            changed = true;

            if (alert.email) {
              try {
                await sendAlertEmail(alert, currentPrice);
                stats.emails++;
              } catch (emailErr) {
                stats.errors.push({ mlItemId: alert.mlItemId, error: `Email: ${emailErr.message}` });
              }
            }
          }
          updatedAlerts.push(alert);
        }

        if (changed) {
          const toKeep = updatedAlerts.filter(a => {
            if (a.anyChange) return true;
            if (!a.triggered) return true;
            return Date.now() - (a.triggeredAt || 0) < 7 * 24 * 60 * 60 * 1000;
          });
          if (toKeep.length === 0) {
            await kv.del(`alerts:${installationId}`);
            await kv.srem('alerts:index', installationId);
          } else {
            await kv.set(`alerts:${installationId}`, toKeep, { ex: 60 * 60 * 24 * 365 });
          }
        }
      } catch (err) {
        stats.errors.push({ installationId, error: err.message });
      }
    }

    return res.status(200).json({ ok: true, ...stats });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno', message: err.message });
  }
}

async function sendAlertEmail(alert, currentPrice) {
  const fmt = (p) => `$ ${Math.round(p).toLocaleString('es-AR')}`;
  const savingPct = Math.round(((alert.targetPrice - currentPrice) / alert.targetPrice) * 100);

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;background:#f5f7fa;margin:0;padding:20px;">
<div style="max-width:560px;margin:0 auto;">
<div style="background:#00a650;border-radius:12px 12px 0 0;padding:20px 24px;">
<h1 style="color:#fff;font-size:20px;margin:0;">&#x1F7E2; &iexcl;Bajo el precio! &mdash; PrecioML</h1>
</div>
<div style="background:#fff;border-radius:0 0 12px 12px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
<p style="font-size:15px;color:#222;margin:0 0 16px;">El producto que seguias bajo al precio que querias:</p>
<div style="background:#f5f7fa;border-radius:10px;padding:16px;margin-bottom:20px;">
<p style="font-size:13px;font-weight:600;color:#222;margin:0 0 12px;">${escHtml(alert.title || 'Producto')}</p>
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="font-size:12px;color:#888;">Precio actual</td>
<td style="font-size:12px;color:#888;">Tu objetivo</td>
<td style="font-size:12px;color:#888;">Diferencia</td>
</tr>
<tr>
<td style="font-size:22px;font-weight:800;color:#00a650;padding-top:4px;">${fmt(currentPrice)}</td>
<td style="font-size:18px;font-weight:600;color:#888;padding-top:4px;">${fmt(alert.targetPrice)}</td>
<td style="font-size:18px;font-weight:700;color:#3483fa;padding-top:4px;">${savingPct > 0 ? savingPct + '% menos' : '&#10003;'}</td>
</tr>
</table>
</div>
${alert.url ? `<a href="${escHtml(alert.url)}" style="display:block;background:#3483fa;color:#fff;text-align:center;padding:14px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;">Ver publicacion &rarr;</a>` : ''}
<p style="font-size:12px;color:#aaa;margin:16px 0 0;text-align:center;">Esta alerta ya fue desactivada. Crea una nueva desde la extension si queres seguir trackeando.</p>
</div>
<div style="text-align:center;padding:16px;font-size:11px;color:#aaa;">
Enviado por <a href="https://precioml-backend.vercel.app" style="color:#3483fa;text-decoration:none;">PrecioML</a>
</div>
</div>
</body></html>`;

  const response = await fetch(RESEND_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: alert.email,
      subject: `Bajo de precio: ${escHtml((alert.title || 'Tu producto').substring(0, 50))} - PrecioML`,
      html,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
}

async function sendChangeEmail(alert, oldPrice, newPrice) {
  const fmt = (p) => `$ ${Math.round(p).toLocaleString('es-AR')}`;
  const wentDown = newPrice < oldPrice;
  const color = wentDown ? '#00a650' : '#e74c3c';
  const arrowEntity = wentDown ? '&darr;' : '&uarr;';
  const verb = wentDown ? 'bajo' : 'subio';

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;background:#f5f7fa;margin:0;padding:20px;">
<div style="max-width:560px;margin:0 auto;">
<div style="background:${color};border-radius:12px 12px 0 0;padding:20px 24px;">
<h1 style="color:#fff;font-size:20px;margin:0;">${arrowEntity} El precio ${verb} &mdash; PrecioML</h1>
</div>
<div style="background:#fff;border-radius:0 0 12px 12px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
<p style="font-size:15px;color:#222;margin:0 0 16px;">Tenias activa la alerta de "cualquier cambio de precio" en:</p>
<div style="background:#f5f7fa;border-radius:10px;padding:16px;margin-bottom:20px;">
<p style="font-size:13px;font-weight:600;color:#222;margin:0 0 12px;">${escHtml(alert.title || 'Producto')}</p>
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="font-size:12px;color:#888;">Antes</td>
<td style="font-size:12px;color:#888;">Ahora</td>
</tr>
<tr>
<td style="font-size:18px;font-weight:600;color:#888;padding-top:4px;text-decoration:line-through;">${fmt(oldPrice)}</td>
<td style="font-size:22px;font-weight:800;color:${color};padding-top:4px;">${fmt(newPrice)}</td>
</tr>
</table>
</div>
${alert.url ? `<a href="${escHtml(alert.url)}" style="display:block;background:#3483fa;color:#fff;text-align:center;padding:14px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;">Ver publicacion &rarr;</a>` : ''}
<p style="font-size:12px;color:#aaa;margin:16px 0 0;text-align:center;">Esta alerta sigue activa, te avisamos de nuevo si vuelve a cambiar. Desactivala desde la extension cuando quieras.</p>
</div>
<div style="text-align:center;padding:16px;font-size:11px;color:#aaa;">
Enviado por <a href="https://precioml-backend.vercel.app" style="color:#3483fa;text-decoration:none;">PrecioML</a>
</div>
</div>
</body></html>`;

  const response = await fetch(RESEND_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: alert.email,
      subject: `El precio ${verb}: ${escHtml((alert.title || 'Tu producto').substring(0, 50))} - PrecioML`,
      html,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── OAuth de MercadoLibre ───────────────────────────────────────────────
// api.mercadolibre.com/items/{id} paso a exigir un access_token valido
// (antes era publico). Guardamos access_token + refresh_token en KV y los
// renovamos solos; el unico paso manual es autorizar la app una vez.

async function handleMLOAuthCallback(req, res) {
  const code = req.query.code;
  try {
    const response = await fetch(ML_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        code,
        redirect_uri: ML_REDIRECT_URI,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(500).send(`<h1>Error al autorizar</h1><pre>${escHtml(JSON.stringify(data))}</pre>`);
    }
    await saveMLTokens(data);
    return res.status(200).send('<h1>Listo</h1><p>PrecioML quedo autorizado para consultar precios en MercadoLibre. Ya podes cerrar esta pestana.</p>');
  } catch (err) {
    return res.status(500).send(`<h1>Error</h1><pre>${escHtml(err.message)}</pre>`);
  }
}

async function saveMLTokens(data) {
  const expiresAt = Date.now() + (data.expires_in * 1000);
  await kv.set('ml:oauth:tokens', JSON.stringify({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
  }));
}

async function getMLAccessToken() {
  const raw = await kv.get('ml:oauth:tokens');
  if (!raw) return null;
  const tokens = typeof raw === 'string' ? JSON.parse(raw) : raw;

  const bufferMs = 5 * 60 * 1000;
  if (tokens.expires_at - Date.now() > bufferMs) {
    return tokens.access_token;
  }

  // Access token vencido (o por vencer): lo renovamos con el refresh_token.
  // ML devuelve un refresh_token NUEVO en cada renovacion, hay que guardarlo.
  const response = await fetch(ML_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`No se pudo renovar el token de ML: ${JSON.stringify(data)}`);
  }
  await saveMLTokens(data);
  return data.access_token;
}
