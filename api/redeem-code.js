import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { code, installationId } = req.body || {};
  if (!code || !installationId) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  const normalized = code.trim().toUpperCase();

  const codeData = await redis.hgetall(`pml:code:${normalized}`);
  if (!codeData || Object.keys(codeData).length === 0) {
    return res.status(400).json({ error: 'Código inválido o expirado' });
  }

  const alreadyUsed = await redis.sismember(`pml:code:${normalized}:used`, installationId);
  if (alreadyUsed) {
    return res.status(400).json({ error: 'Este código ya fue usado en esta extensión' });
  }

  const maxUses = parseInt(codeData.maxUses || '999', 10);
  const usedCount = parseInt(codeData.usedCount || '0', 10);
  if (usedCount >= maxUses) {
    return res.status(400).json({ error: 'Este código ya alcanzó el límite de usos' });
  }

  if (codeData.expiresAt && Date.now() > parseInt(codeData.expiresAt, 10)) {
    return res.status(400).json({ error: 'Este código ya venció' });
  }

  await Promise.all([
    redis.set(`pml:premium:${installationId}`, JSON.stringify({
      premium: true,
      activatedAt: Date.now(),
      method: 'promo',
      code: normalized,
    })),
    redis.sadd(`pml:code:${normalized}:used`, installationId),
    redis.hincrby(`pml:code:${normalized}`, 'usedCount', 1),
  ]);

  return res.status(200).json({ success: true, activatedAt: Date.now() });
}
