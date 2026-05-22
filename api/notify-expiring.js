import { Redis } from '@upstash/redis';
import { Resend } from 'resend';

const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'PrecioML <no-reply@precioml.com>';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const auth = req.headers['authorization'];
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const now = Date.now();
  const windowEnd = now + (3 * 24 * 60 * 60 * 1000);
  const expiringIds = await redis.zrangebyscore('pml:premium:expiries', now, windowEnd);
  let sent = 0, skipped = 0;
  for (const id of expiringIds) {
    const alreadyNotified = await redis.get('pml:notified:expiry:' + id);
    if (alreadyNotified) { skipped++; continue; }
    const raw = await redis.get('pml:premium:' + id);
    if (!raw) { skipped++; continue; }
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data.premium || !data.email) { skipped++; continue; }
    const daysLeft = Math.ceil((data.expiresAt - now) / 86400000);
    const expiryDate = new Date(data.expiresAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: data.email,
        subject: 'Tu Premium de PrecioML vence en ' + daysLeft + ' dia' + (daysLeft !== 1 ? 's' : ''),
        html: buildEmail({ daysLeft, expiryDate }),
      });
      await redis.set('pml:notified:expiry:' + id, '1', { ex: 4 * 24 * 3600 });
      sent++;
    } catch (err) {
      console.error('Error enviando a ' + data.email + ':', err.message);
    }
  }
  return res.status(200).json({ checked: expiringIds.length, sent, skipped });
}

function buildEmail({ daysLeft, expiryDate }) {
  const color = daysLeft <= 1 ? '#ef4444' : '#f59e0b';
  const msg = daysLeft <= 1 ? 'Ultimo dia!' : 'Vence en ' + daysLeft + ' dias';
  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/></head><body style="margin:0;background:#0f172a;font-family:sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0"><tr><td align="center">'
    + '<table width="560" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;">'
    + '<tr><td style="background:#1651C8;padding:28px 32px"><p style="margin:0;font-size:24px;font-weight:700;color:#fff">PrecioML</p></td></tr>'
    + '<tr><td style="background:' + color + '18;border-left:4px solid ' + color + ';padding:16px 32px">'
    + '<p style="margin:0;font-size:15px;font-weight:700;color:' + color + '">' + msg + '</p>'
    + '<p style="margin:4px 0 0;font-size:13px;color:#94a3b8">Tu Premium vence el <strong style="color:#e2e8f0">' + expiryDate + '</strong></p>'
    + '</td></tr><tr><td style="padding:28px 32px">'
    + '<p style="margin:0 0 20px;font-size:15px;color:#cbd5e1">Renova ahora para no perder acceso a historial completo, alertas ilimitadas, CSV y reporte semanal.</p>'
    + '<table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding:8px 0 24px">'
    + '<a href="https://precioml.com/#premium" style="display:inline-block;background:#1651C8;color:#fff;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none">Renovar Premium - $2.000 ARS/mes</a>'
    + '</td></tr></table></td></tr>'
    + '<tr><td style="border-top:1px solid #334155;padding:20px 32px;text-align:center"><p style="margin:0;font-size:11px;color:#475569">PrecioML - precioml.com</p></td></tr>'
    + '</table></td></tr></table></body></html>';
}
