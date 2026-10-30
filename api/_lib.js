// ARCHIVO: api/_lib.js
// Helpers compartidos del backend. El prefijo "_" hace que Vercel NO lo cuente
// como función serverless (importa por el límite de 12 funciones del plan Hobby).
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

// Prefijos de sitio de MercadoLibre/Livre (mismos que utils.js de la extensión)
export const ML_ID_RE = /^(MLA|MLB|MLM|MLC|MLU|MLV|MCO|MPE)\d{4,}$/;
export const INSTALL_ID_RE = /^[0-9a-f-]{16,64}$/i;
const ML_HOST_RE = /^https:\/\/([a-z0-9-]+\.)*(mercadolibre\.(com(\.[a-z]{2})?|cl)|mercadolivre\.com\.br)$/i;

export function parseJson(raw) {
  if (raw == null) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

// CORS: la extensión (background/popup) no necesita CORS gracias a host_permissions.
// Solo los content scripts, que corren con el origen de la página de ML, sí.
// Antes todos los endpoints respondían "*", lo que dejaba a cualquier sitio web
// consultar premium/email/alertas de un usuario.
export function setCors(req, res, methods = 'POST, OPTIONS', headers = 'Content-Type') {
  const origin = req.headers.origin || '';
  if (ML_HOST_RE.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', headers);
}

export function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

// Rate limit simple por ventana fija. Devuelve true si se superó el límite.
export async function rateLimited(key, max, windowSec) {
  try {
    const k = `pml:rl:${key}`;
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, windowSec);
    return n > max;
  } catch {
    return false; // si Redis falla no bloqueamos al usuario legítimo
  }
}

export function isPremiumActive(data, now = Date.now()) {
  return !!data && data.premium === true && (!data.expiresAt || data.expiresAt > now);
}

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function isMlUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ML_HOST_RE.test(u.origin);
  } catch {
    return false;
  }
}

export async function sendEmail({ to, subject, html }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'PrecioML <alertas@precioml.crecimientoinsta.com>', to, subject, html }),
  });
  if (!r.ok) throw new Error(await r.text());
}
