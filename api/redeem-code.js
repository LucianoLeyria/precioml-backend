export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  async function redis(...args) {
    const r = await fetch(`${REDIS_URL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const d = await r.json();
    return d.result;
  }

  try {
    const { code, installationId } = req.body || {};
    if (!code || !installationId) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    const normalized = code.trim().toUpperCase();

    // Verificar que el código existe
    const codeData = await redis('HGETALL', `pml:code:${normalized}`);
    if (!codeData || codeData.length === 0) {
      return res.status(400).json({ error: 'Código inválido o expirado' });
    }

    // Convertir array [key, val, key, val...] a objeto
    const codeObj = {};
    for (let i = 0; i < codeData.length; i += 2) codeObj[codeData[i]] = codeData[i + 1];

    // Verificar si esta instalación ya lo usó
    const alreadyUsed = await redis('SISMEMBER', `pml:code:${normalized}:used`, installationId);
    if (alreadyUsed) {
      return res.status(400).json({ error: 'Este código ya fue usado en esta extensión' });
    }

    // Verificar límite de usos
    const maxUses   = parseInt(codeObj.maxUses   || '999', 10);
    const usedCount = parseInt(codeObj.usedCount || '0',   10);
    if (usedCount >= maxUses) {
      return res.status(400).json({ error: 'Este código ya alcanzó el límite de usos' });
    }

    // Verificar expiración
    if (codeObj.expiresAt && Date.now() > parseInt(codeObj.expiresAt, 10)) {
      return res.status(400).json({ error: 'Este código ya venció' });
    }

    // ✅ Activar Premium
    const activatedAt = Date.now();
    await redis('SET', `pml:premium:${installationId}`, JSON.stringify({
      premium: true, activatedAt, method: 'promo', code: normalized,
    }));
    await redis('SADD', `pml:code:${normalized}:used`, installationId);
    await redis('HINCRBY', `pml:code:${normalized}`, 'usedCount', 1);

    return res.status(200).json({ success: true, activatedAt });
  } catch (e) {
    console.error('[redeem-code] error:', e);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
