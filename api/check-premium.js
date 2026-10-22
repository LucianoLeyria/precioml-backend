// ARCHIVO: api/check-premium.js
// GET  → verifica premium + opcionalmente restaura historial (restore=1)
// POST → sube backup del historial (solo usuarios premium)
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST: subir backup del historial
  if (req.method === 'POST') {
    const { id, historyData } = req.body || {};
    if (!id || !historyData) return res.status(400).json({ error: 'id y historyData requeridos' });
    try {
      const raw = await getPremiumData(id);
      if (!raw) return res.status(403).json({ error: 'Solo usuarios premium' });
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const now = Date.now();
      const isPremium = data.premium === true && (!data.expiresAt || data.expiresAt > now);
      if (!isPremium) return res.status(403).json({ error: 'Premium inactivo' });
      const backup = JSON.stringify(historyData);
      if (backup.length > 150000) return res.status(413).json({ error: 'Historial demasiado grande' });
      await redis.set('pml:history:' + id, backup, { ex: HISTORY_TTL });
      return res.status(200).json({ ok: true, backedUpAt: new Date().toISOString() });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET: verificar premium
  const { id, restore } = req.query;
  if (!id) return res.status(400).json({ error: 'id requerido' });

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
    return res.status(500).json({ error: err.message });
  }
}
