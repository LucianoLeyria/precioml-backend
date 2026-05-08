// api/check-premium.js
// La extension llama a este endpoint para saber si el usuario es premium
// GET /api/check-premium?id=installation_uuid

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id || id.length < 10) {
    return res.status(400).json({ premium: false, error: 'id invalido' });
  }

  try {
    const data = await kv.get('premium:' + id);
    if (data) {
      return res.status(200).json({
        premium: true,
        activatedAt: data.activatedAt,
      });
    }
    return res.status(200).json({ premium: false });
  } catch (err) {
    console.error('KV error:', err);
    return res.status(500).json({ premium: false, error: 'Error interno' });
  }
}
