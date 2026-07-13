import { kv } from '@vercel/kv';

// Sentinel: los codigos promo dan premium "de por vida" (sin expiresAt,
// ver check-premium.js -> plan: 'lifetime'). Pero el dashboard admin arma
// TODAS sus metricas de premium a partir del sorted set pml:premium:expiries
// (ver admin-stats.js). Si no agregamos aca a ese set, un usuario que
// canjeo un codigo promo queda invisible en el panel admin aunque tenga
// premium real. Usamos un score muy lejano en el futuro para que siempre
// cuente como activo sin tener que tocar la logica de check-premium.js.
const LIFETIME_SCORE_YEARS = 100;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body || {};
    const code = (body.code || '').trim().toUpperCase();
    const installationId = (body.installationId || '').trim();
    const email = (body.email || '').trim().toLowerCase() || null;

    if (!code || !installationId) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    // Verificar que el codigo existe
    const codeData = await kv.hgetall(`pml:code:${code}`);
    if (!codeData) {
      return res.status(400).json({ error: 'Codigo invalido o expirado' });
    }

    // Verificar si esta instalacion ya lo uso
    const alreadyUsed = await kv.sismember(`pml:code:${code}:used`, installationId);
    if (alreadyUsed) {
      return res.status(400).json({ error: 'Este codigo ya fue usado en esta extension' });
    }

    // Verificar limite de usos
    const maxUses = parseInt(codeData.maxUses || '999', 10);
    const usedCount = parseInt(codeData.usedCount || '0', 10);
    if (usedCount >= maxUses) {
      return res.status(400).json({ error: 'Este codigo ya alcanzo el limite de usos' });
    }

    // Verificar expiracion
    if (codeData.expiresAt && Date.now() > parseInt(codeData.expiresAt, 10)) {
      return res.status(400).json({ error: 'Este codigo ya vencio' });
    }

    // Activar Premium
    const activatedAt = Date.now();
    const lifetimeScore = activatedAt + LIFETIME_SCORE_YEARS * 365 * 24 * 60 * 60 * 1000;
    const ops = [
      kv.set(`pml:premium:${installationId}`, JSON.stringify({
        premium: true, activatedAt, method: 'promo', code,
        email: email || null,
      })),
      kv.sadd(`pml:code:${code}:used`, installationId),
      kv.hincrby(`pml:code:${code}`, 'usedCount', 1),
      kv.zadd('pml:premium:expiries', { score: lifetimeScore, member: installationId }),
    ];

    // Índice email → installationId para recuperar premium si reinstala
    if (email) {
      ops.push(kv.set(`pml:premium:email:${email}`, installationId));
    }

    await Promise.all(ops);

    return res.status(200).json({ success: true, activatedAt });
  } catch (e) {
    console.error('[redeem-code] error:', e);
    return res.status(500).json({ error: 'Error interno. Intenta de nuevo en unos segundos.' });
  }
}
