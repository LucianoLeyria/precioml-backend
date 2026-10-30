import { kv } from '@vercel/kv';
import { setCors, rateLimited, clientIp, INSTALL_ID_RE } from './_lib.js';

// Sentinel: los codigos promo dan premium "de por vida" (sin expiresAt,
// ver check-premium.js -> plan: 'lifetime'). Pero el dashboard admin arma
// TODAS sus metricas de premium a partir del sorted set pml:premium:expiries
// (ver admin-stats.js). Si no agregamos aca a ese set, un usuario que
// canjeo un codigo promo queda invisible en el panel admin aunque tenga
// premium real. Usamos un score muy lejano en el futuro para que siempre
// cuente como activo sin tener que tocar la logica de check-premium.js.
const LIFETIME_SCORE_YEARS = 100;

export default async function handler(req, res) {
  setCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body || {};
    const code = (body.code || '').trim().toUpperCase();
    const installationId = (body.installationId || '').trim();

    if (!code || code.length > 40 || !/^[A-Z0-9_-]+$/.test(code) || !INSTALL_ID_RE.test(installationId)) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    // Sin esto se podian adivinar codigos por fuerza bruta.
    if (await rateLimited('redeem:ip:' + clientIp(req), 10, 600) || await rateLimited('redeem:id:' + installationId, 10, 600)) {
      return res.status(429).json({ error: 'Demasiados intentos, espera unos minutos.' });
    }

    // Codigo de recuperacion "R-XXXXXX" (lo manda check-premium action:'recover'):
    // mueve el Premium vigente de la instalacion anterior a esta.
    if (code.startsWith('R-')) {
      const oldId = await kv.get(`pml:recover:${code}`);
      if (!oldId) return res.status(400).json({ error: 'Codigo invalido o expirado' });
      const raw = await kv.get(`pml:premium:${oldId}`);
      const data = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
      if (!data || data.premium !== true || (data.expiresAt && data.expiresAt <= Date.now())) {
        return res.status(400).json({ error: 'No hay un Premium activo para recuperar' });
      }
      const score = data.expiresAt || Date.now() + LIFETIME_SCORE_YEARS * 365 * 24 * 60 * 60 * 1000;
      await Promise.all([
        kv.set(`pml:premium:${installationId}`, JSON.stringify({ ...data, migratedFrom: oldId, migratedAt: Date.now() })),
        kv.zadd('pml:premium:expiries', { score, member: installationId }),
        data.email ? kv.set(`pml:premium:email:${String(data.email).toLowerCase()}`, installationId) : null,
        kv.del(`pml:recover:${code}`), // un solo uso
      ].filter(Boolean));
      return res.status(200).json({ success: true, activatedAt: data.activatedAt, expiresAt: data.expiresAt || null });
    }

    // Verificar que el codigo existe
    const codeData = await kv.hgetall(`pml:code:${code}`);
    if (!codeData || Object.keys(codeData).length === 0) {
      return res.status(400).json({ error: 'Codigo invalido o expirado' });
    }

    // Verificar expiracion
    if (codeData.expiresAt && Date.now() > parseInt(codeData.expiresAt, 10)) {
      return res.status(400).json({ error: 'Este codigo ya vencio' });
    }

    // Reserva atomica: sadd devuelve 1 solo si es nuevo. Antes sismember+sadd
    // permitia canjear dos veces con requests simultaneos.
    const reserved = await kv.sadd(`pml:code:${code}:used`, installationId);
    if (!reserved) {
      return res.status(400).json({ error: 'Este codigo ya fue usado en esta extension' });
    }
    const maxUses = parseInt(codeData.maxUses || '999', 10);
    const newCount = await kv.hincrby(`pml:code:${code}`, 'usedCount', 1);
    if (newCount > maxUses) {
      await Promise.all([kv.srem(`pml:code:${code}:used`, installationId), kv.hincrby(`pml:code:${code}`, 'usedCount', -1)]);
      return res.status(400).json({ error: 'Este codigo ya alcanzo el limite de usos' });
    }

    // Activar Premium
    const activatedAt = Date.now();
    const lifetimeScore = activatedAt + LIFETIME_SCORE_YEARS * 365 * 24 * 60 * 60 * 1000;
    const ops = [
      kv.set(`pml:premium:${installationId}`, JSON.stringify({
        premium: true, activatedAt, method: 'promo', code,
        email: null,
      })),
      kv.zadd('pml:premium:expiries', { score: lifetimeScore, member: installationId }),
    ];

    // (Ya no se indexa email->installationId desde el canje de promo: el email lo
    // manda el cliente sin verificar y permitia pisar el indice de otra persona.)

    await Promise.all(ops);

    return res.status(200).json({ success: true, activatedAt });
  } catch (e) {
    console.error('[redeem-code] error:', e);
    return res.status(500).json({ error: 'Error interno. Intenta de nuevo en unos segundos.' });
  }
}
