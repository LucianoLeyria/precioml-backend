// api/check-alerts.js
// Cron job horario: chequea alertas contra la API de MercadoLibre y envia emails
// POST /api/check-alerts - Header: Authorization: Bearer CRON_SECRET

import { kv } from '@vercel/kv';

const ML_API = 'https://api.mercadolibre.com/items';
const RESEND_API = 'https://api.resend.com/emails';
const FROM_EMAIL = 'PrecioML Alertas <alertas@precioml.crecimientoinsta.com>';

export default async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end();

  const stats = { checked: 0, triggered: 0, emails: 0, errors: [] };

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
            const mlRes = await fetch(`${ML_API}/${alert.mlItemId}?attributes=price,status`, {
              signal: AbortSignal.timeout(6000),
            });
            if (mlRes.ok) {
              const mlData = await mlRes.json();
              if (mlData.status === 'active' || mlData.status === 'paused') {
                currentPrice = mlData.price;
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
