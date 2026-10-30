// ARCHIVO: api/check-premium.js
// GET  → verifica premium + opcionalmente restaura historial (restore=1)
// POST → sube backup del historial (solo usuarios premium)
import { redis, setCors, rateLimited, clientIp, ML_ID_RE, INSTALL_ID_RE, isMlUrl, escHtml, sendEmail } from './_lib.js';

const HISTORY_TTL = 400 * 24 * 3600;

// SEGURIDAD: antes, si el id no tenia premium pero se mandaba ?email=X, se
// migraba el premium del installationId asociado a ese email a este id. Eso
// permitia obtener Premium gratis conociendo solo el email de alguien que
// pago (el email no se verifica). Se quito la migracion automatica por
// email; la recuperacion al reinstalar requiere un flujo verificado (codigo
// por mail) que todavia no existe.
async function getPremiumData(id) {
  return redis.get('pml:premium:' + id);
}

function sanitizeBackup(historyData) {
  if (!historyData || typeof historyData !== 'object' || Array.isArray(historyData)) return null;
  const out = {};
  for (const [pid, p] of Object.entries(historyData).slice(0, 300)) {
    if (!ML_ID_RE.test(pid) || !p || !Array.isArray(p.history)) continue;
    const history = p.history
      .filter(h => h && Number.isFinite(h.price) && h.price > 0 && Number.isFinite(h.date))
      .slice(-365).map(h => ({ price: h.price, date: h.date }));
    if (!history.length) continue;
    out[pid] = {
      title: String(p.title || pid).slice(0, 200),
      url: isMlUrl(p.url) ? p.url : '',
      image: typeof p.image === 'string' && p.image.startsWith('https://') ? p.image.slice(0, 500) : null,
      history,
    };
  }
  return out;
}

export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST { action:'recover', email }: manda por mail un codigo "R-XXXXXX" que se
  // canjea en /api/redeem-code y mueve el Premium a la instalacion nueva.
  if (req.method === 'POST' && req.body?.action === 'recover') {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return res.status(400).json({ error: 'Email invalido' });
    if (await rateLimited('recover:' + clientIp(req), 5, 3600) || await rateLimited('recover:' + email, 3, 3600)) {
      return res.status(429).json({ error: 'Demasiados intentos, proba mas tarde.' });
    }
    try {
      const linkedId = await redis.get('pml:premium:email:' + email);
      if (linkedId) {
        const code = 'R-' + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
        await redis.set('pml:recover:' + code, String(linkedId), { ex: 900 });
        await sendEmail({
          to: email,
          subject: 'Tu codigo para recuperar PrecioML Premium',
          html: '<p>Tu codigo es: <b style="font-size:20px">' + escHtml(code) + '</b></p><p>Pegalo en la extension (Premium, "codigo de promo"). Vence en 15 minutos.<br>Si no lo pediste vos, ignora este mail.</p>',
        });
      }
    } catch (err) {
      console.error('[check-premium] recover error:', err.message);
    }
    // Misma respuesta exista o no el email: no revela quien es cliente.
    return res.status(200).json({ ok: true });
  }

  // POST: subir backup del historial
  if (req.method === 'POST') {
    const { id, historyData } = req.body || {};
    if (!id || !INSTALL_ID_RE.test(String(id)) || !historyData) return res.status(400).json({ error: 'id y historyData requeridos' });
    try {
      const raw = await getPremiumData(id);
      if (!raw) return res.status(403).json({ error: 'Solo usuarios premium' });
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const now = Date.now();
      const isPremium = data.premium === true && (!data.expiresAt || data.expiresAt > now);
      if (!isPremium) return res.status(403).json({ error: 'Premium inactivo' });
      // Se sanea antes de guardar: el restore lo vuelve a leer la extension.
      const clean = sanitizeBackup(historyData);
      if (!clean) return res.status(400).json({ error: 'historyData invalido' });
      const backup = JSON.stringify(clean);
      if (backup.length > 150000) return res.status(413).json({ error: 'Historial demasiado grande' });
      await redis.set('pml:history:' + id, backup, { ex: HISTORY_TTL });
      return res.status(200).json({ ok: true, backedUpAt: new Date().toISOString() });
    } catch (err) {
      console.error('[check-premium] error:', err.message);
      return res.status(500).json({ error: 'Error interno' });
    }
  }

  // GET: verificar premium
  const { id, restore } = req.query;
  if (!id || !INSTALL_ID_RE.test(String(id))) return res.status(400).json({ error: 'id requerido' });

  try {
    const raw = await getPremiumData(id);
    if (!raw) return res.status(200).json({ premium: false });

    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (!data.expiresAt) {
      const resp = { premium: data.premium === true, activatedAt: data.activatedAt, expiresAt: null, daysLeft: null, plan: 'lifetime', subscriptionCancelled: false };
      if (restore === '1' && data.premium) {
        const backup = await redis.get('pml:history:' + id);
        if (backup) resp.historyBackup = typeof backup === 'string' ? backup : JSON.stringify(backup);
      }
      return res.status(200).json(resp);
    }

    const now = Date.now();
    if (now > data.expiresAt) {
      await redis.set('pml:premium:' + id, JSON.stringify({ ...data, premium: false }));
      await redis.zrem('pml:premium:expiries', id);
      return res.status(200).json({ premium: false, expired: true, expiresAt: data.expiresAt });
    }

    const daysLeft = Math.ceil((data.expiresAt - now) / (1000 * 60 * 60 * 24));
    const resp = { premium: true, activatedAt: data.activatedAt, expiresAt: data.expiresAt, daysLeft, plan: data.plan || 'monthly', subscriptionCancelled: data.subscriptionCancelled === true };

    if (restore === '1') {
      const backup = await redis.get('pml:history:' + id);
      if (backup) resp.historyBackup = typeof backup === 'string' ? backup : JSON.stringify(backup);
    }

    return res.status(200).json(resp);
  } catch (err) {
    console.error('[check-premium] error:', err.message);
      return res.status(500).json({ error: 'Error interno' });
  }
}
