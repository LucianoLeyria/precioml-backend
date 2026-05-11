// api/register-alert.js
// Registra una alerta de precio en Redis para chequeo server-side
// POST /api/register-alert
// Body: { installationId, mlItemId, title, url, targetPrice, email }

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { installationId, mlItemId, title, url, targetPrice, email } = req.body;

    if (!installationId || !mlItemId || !targetPrice) {
      return res.status(400).json({ error: 'Faltan campos requeridos: installationId, mlItemId, targetPrice' });
    }

    const existing = (await kv.get(`alerts:${installationId}`)) || [];
    const filtered = existing.filter(a => a.mlItemId !== mlItemId);
    filtered.push({
      mlItemId,
      title: (title || '').substring(0, 120),
      url: url || null,
      targetPrice: Number(targetPrice),
      email: email || null,
      createdAt: Date.now(),
      triggered: false,
    });

    await kv.set(`alerts:${installationId}`, filtered, { ex: 60 * 60 * 24 * 365 });
    await kv.sadd('alerts:index', installationId);

    return res.status(200).json({ ok: true, total: filtered.length });
  } catch (err) {
    console.error('[register-alert] Error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
}
