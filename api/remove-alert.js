// api/remove-alert.js
// Elimina (o actualiza parcialmente) una alerta de precio del registro server-side.
// POST /api/remove-alert
// Body: { installationId, mlItemId, type? }
//   type ausente: elimina toda la entrada (drop + rise + anyChange). Este es
//   el comportamiento original, se mantiene para no romper llamadas viejas.
//   type: 'drop' | 'rise': limpia solo esa parte; si no queda nada activo
//   en la entrada (ni la otra direccion ni anyChange), se elimina entera.

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
        const { installationId, mlItemId, type } = req.body;

      if (!installationId || !mlItemId) {
              return res.status(400).json({ error: 'Faltan campos: installationId, mlItemId' });
      }

      const existing = (await kv.get(`alerts:${installationId}`)) || [];
        const entry = existing.find(a => a.mlItemId === mlItemId);
        const others = existing.filter(a => a.mlItemId !== mlItemId);

      let keepEntry = null;
        if (entry) {
                if (type === 'rise') {
                          const updated = {
                                      ...entry,
                                      riseTargetPrice: null,
                                      riseTriggered: false,
                                      riseTriggeredAt: null,
                                      riseTriggeredPrice: null,
                          };
                          keepEntry = (updated.targetPrice || updated.anyChange) ? updated : null;
                } else if (type === 'drop') {
                          const updated = {
                                      ...entry,
                                      targetPrice: null,
                                      triggered: false,
                                      triggeredAt: null,
                                      triggeredPrice: null,
                          };
                          keepEntry = (updated.riseTargetPrice || updated.anyChange) ? updated : null;
                } else {
                          keepEntry = null;
                }
        }

      const filtered = keepEntry ? [...others, keepEntry] : others;

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
