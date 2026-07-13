// api/register-alert.js
// Registra o actualiza una alerta de precio en Redis para chequeo server-side.
// Cada producto tiene UNA entrada por instalacion, que puede combinar:
//   targetPrice (avisar si baja), riseTargetPrice (avisar si sube, Premium),
//   anyChange (avisar ante cualquier cambio, Premium). Los campos que no se
//   mandan en un POST se preservan de la entrada existente (merge), no se
//   pisan con null. Asi una alerta de bajada y una de suba pueden convivir
//   en el mismo producto sin pisarse.
// POST /api/register-alert
// Body: { installationId, mlItemId, title, url, targetPrice?, riseTargetPrice?, anyChange?, email? }
//
// Plan free: hasta FREE_ALERT_MAX productos con alerta de precio objetivo
// (bajada). riseTargetPrice y anyChange son exclusivos de Premium.

import { kv } from '@vercel/kv';

const FREE_ALERT_MAX = 3;

export default async function handler(req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') return res.status(200).end();
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
            const { installationId, mlItemId, title, url, targetPrice, riseTargetPrice, anyChange, email } = req.body;

          if (!installationId || !mlItemId || (!targetPrice && !riseTargetPrice && !anyChange)) {
                      return res.status(400).json({ error: 'Faltan campos requeridos: installationId, mlItemId, y al menos uno de targetPrice, riseTargetPrice o anyChange' });
          }

          const premiumRaw = await kv.get(`pml:premium:${installationId}`);
            const premiumData = premiumRaw
              ? (typeof premiumRaw === 'string' ? JSON.parse(premiumRaw) : premiumRaw)
                        : null;
            const isPremium = premiumData?.premium === true && (!premiumData.expiresAt || premiumData.expiresAt > Date.now());

          if (anyChange && !isPremium) {
                      return res.status(403).json({ error: 'Esta alerta es exclusiva de Premium' });
          }
            if (riseTargetPrice && !isPremium) {
                        return res.status(403).json({ error: 'La alerta de suba de precio es exclusiva de Premium' });
            }

          const existing = (await kv.get(`alerts:${installationId}`)) || [];
            const existingEntry = existing.find(a => a.mlItemId === mlItemId) || null;
            const others = existing.filter(a => a.mlItemId !== mlItemId);

          // El limite de alertas free solo aplica cuando se crea un producto nuevo,
          // no cuando se actualiza uno que ya tenia alerta
          if (!isPremium && !existingEntry && others.length >= FREE_ALERT_MAX) {
                      return res.status(403).json({
                                    error: `Alcanzaste el limite de ${FREE_ALERT_MAX} alertas del plan gratuito. Activa Premium para alertas ilimitadas.`,
                      });
          }

          const merged = {
                      mlItemId,
                      title: (title || existingEntry?.title || '').substring(0, 120),
                      url: url || existingEntry?.url || null,
                      email: email || existingEntry?.email || null,
                      createdAt: existingEntry?.createdAt || Date.now(),

                      targetPrice: targetPrice !== undefined
                        ? (targetPrice ? Number(targetPrice) : null)
                                    : (existingEntry?.targetPrice ?? null),
                      triggered: targetPrice !== undefined ? false : (existingEntry?.triggered ?? false),
                      triggeredAt: targetPrice !== undefined ? null : (existingEntry?.triggeredAt ?? null),
                      triggeredPrice: targetPrice !== undefined ? null : (existingEntry?.triggeredPrice ?? null),

                      riseTargetPrice: riseTargetPrice !== undefined
                        ? (riseTargetPrice ? Number(riseTargetPrice) : null)
                                    : (existingEntry?.riseTargetPrice ?? null),
                      riseTriggered: riseTargetPrice !== undefined ? false : (existingEntry?.riseTriggered ?? false),
                      riseTriggeredAt: riseTargetPrice !== undefined ? null : (existingEntry?.riseTriggeredAt ?? null),
                      riseTriggeredPrice: riseTargetPrice !== undefined ? null : (existingEntry?.riseTriggeredPrice ?? null),

                      anyChange: anyChange !== undefined ? !!anyChange : (existingEntry?.anyChange ?? false),
                      lastKnownPrice: existingEntry?.lastKnownPrice ?? null,
          };

          others.push(merged);

          await kv.set(`alerts:${installationId}`, others, { ex: 60 * 60 * 24 * 365 });
            await kv.sadd('alerts:index', installationId);

          return res.status(200).json({ ok: true, total: others.length });
  } catch (err) {
            console.error('[register-alert] Error:', err);
            return res.status(500).json({ error: 'Error interno' });
  }
}
