// api/remove-alert.js
// Elimina una alerta de precio del registro server-side
// POST /api/remove-alert
// Body: { installationId, mlItemId }

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { installationId, mlItemId } = req.body;

    if (!installationId || !mlItemId) {
      return res.status(400).json({ error: 'Faltan campos: installationId, mlItemId' });
    }

    const existing = (await kv.get(`alerts:${installationId}`)) || [];
    const filtered = existing.filter(a => a.mlItemId !== mlItemId);

    if (filtered.length === 0) {
      await kv.del(`alerts:${installationId}`);
      await kv.srem('alerts:index', installationId);
    } else {
      await kv.set(`alerts:${installationId}`, filtered, { ex: 60 * 60 * 24 * 365 });
    }

    return res.status(200).json({ ok: true, remaining: filtered.length });
  } catch (err) {
    console.error('[remove-alert] Error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
}
