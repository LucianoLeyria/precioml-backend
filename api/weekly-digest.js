// api/weekly-digest.js
// POC: resumen semanal por email de los productos trackeados.
// Por ahora solo habilitado para el email del propio dev (leyrialu@gmail.com)
// mientras se valida el formato antes de abrirlo a todos los usuarios.

const RESEND_API = 'https://api.resend.com/emails';
const FROM_EMAIL = 'PrecioML Resumen <resumen@precioml.crecimientoinsta.com>';
const ALLOWED_EMAILS = ['leyrialu@gmail.com'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

try {
  const body = req.body || {};
  const email = (body.email || '').trim().toLowerCase();
  const items = Array.isArray(body.items) ? body.items : [];
  const totalTracked = parseInt(body.totalTracked || items.length, 10);
  const totalSaved = body.totalSaved != null ? Number(body.totalSaved) : null;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalido' });
  }

  if (!ALLOWED_EMAILS.includes(email)) {
    return res.status(403).json({ error: 'El resumen semanal todavia esta en prueba (POC), solo habilitado para el email del desarrollador.' });
  }

  if (items.length === 0) {
    return res.status(400).json({ error: 'No hay productos para armar el resumen' });
  }

  const html = buildDigestHtml(items, totalTracked, totalSaved);

  const response = await fetch(RESEND_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      subject: 'Tu resumen semanal de PrecioML',
      html,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText);
  }

  return res.status(200).json({ ok: true });
} catch (err) {
  return res.status(500).json({ error: 'Error interno', message: err.message });
}
}

function fmt(p) {
  return `$ ${Math.round(p).toLocaleString('es-AR')}`;
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function badgeHtml(badge) {
  if (!badge) return '';
  const colors = {
    min: { bg: '#f0fdf4', color: '#00a650' },
    good: { bg: '#f8faff', color: '#3483fa' },
    up: { bg: '#fdf3ea', color: '#e67e22' },
  };
  const c = colors[badge.type] || colors.good;
  return `<span style="display:inline-block;background:${c.bg};color:${c.color};font-size:11px;font-weight:700;padding:3px 8px;border-radius:8px;margin-left:8px;">${escHtml(badge.label)}</span>`;
}

function buildDigestHtml(items, totalTracked, totalSaved) {
  const rows = items.map((it) => `
  <tr>
  <td style="padding:14px 0;border-bottom:1px solid #f0f0f0;">
  <div style="font-size:13px;font-weight:600;color:#222;margin-bottom:4px;">${escHtml(it.title)}</div>
  <div style="font-size:16px;font-weight:800;color:#222;">${fmt(it.price)}${badgeHtml(it.badge)}</div>
  </td>
  </tr>
  `).join('');

const savedBlock = totalSaved != null ? `
<div style="background:#f0fdf4;border-radius:10px;padding:16px;margin-bottom:20px;text-align:center;">
<div style="font-size:12px;color:#555;margin-bottom:4px;">Ahorro acumulado detectado</div>
<div style="font-size:24px;font-weight:800;color:#00a650;">${fmt(totalSaved)}</div>
</div>
` : '';

return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;background:#f5f7fa;margin:0;padding:20px;">
<div style="max-width:560px;margin:0 auto;">
<div style="background:#3483fa;border-radius:12px 12px 0 0;padding:20px 24px;">
<h1 style="color:#fff;font-size:20px;margin:0;">Tu resumen semanal &mdash; PrecioML</h1>
</div>
<div style="background:#fff;border-radius:0 0 12px 12px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
<p style="font-size:14px;color:#555;margin:0 0 16px;">Estado actual de tus ${totalTracked} productos trackeados:</p>
${savedBlock}
<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<p style="font-size:12px;color:#aaa;margin:20px 0 0;text-align:center;">Abri la extension para ver el detalle completo, editar alertas o comparar precios.</p>
</div>
<div style="text-align:center;padding:16px;font-size:11px;color:#aaa;">
Enviado por <a href="https://precioml-backend.vercel.app" style="color:#3483fa;text-decoration:none;">PrecioML</a>
</div>
</div>
</body></html>`;
}
