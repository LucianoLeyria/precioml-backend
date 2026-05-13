import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const secret = req.query.secret || '';
  if (secret !== 'pml2026setup') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const code = (req.query.code || 'AMIGOS2026').toUpperCase();
    const maxUses = parseInt(req.query.max || '50', 10);
    await kv.hset(`pml:code:${code}`, { maxUses, usedCount: 0 });
    const verify = await kv.hgetall(`pml:code:${code}`);
    return res.status(200).json({ ok: true, code, data: verify });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
