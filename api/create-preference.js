// ARCHIVO: api/create-preference.js
// Crea una suscripción mensual automática con MercadoPago PreApproval
// POST /api/create-preference  { installationId: "uuid", email: "..." }
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import { Redis } from '@upstash/redis';

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const BASE = 'https://precioml-backend.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { installationId, email } = req.body || {};
  if (!installationId || installationId.length < 10) {
    return res.status(400).json({ error: 'installationId inválido' });
  }

  // Si ya tiene premium activo, no crear nueva suscripción
  const existing = await redis.get('pml:premium:' + installationId);
  if (existing) {
    const data = typeof existing === 'string' ? JSON.parse(existing) : existing;
    const now = Date.now();
    if (data.premium && data.expiresAt && data.expiresAt > now) {
      return res.status(200).json({ alreadyPremium: true });
    }
  }

  try {
    const preApproval = new PreApproval(mp);
    const result = await preApproval.create({
      body: {
        reason: 'PrecioML Premium — Historial y alertas de precios en MercadoLibre',
        external_reference: installationId,
        payer_email: email || undefined,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 2000,
          currency_id: 'ARS',
        },
        back_url: BASE + '/api/premium-result?status=success',
        status: 'pending',
      },
    });

    // Guardar el preapproval_id para poder gestionar la suscripción después
    await redis.set(
      'pml:subscription:' + installationId,
      JSON.stringify({ preapprovalId: result.id, createdAt: Date.now(), email: email || null }),
      { ex: 400 * 24 * 3600 }
    );

    return res.status(200).json({
      checkoutUrl: result.init_point,
      sandboxUrl: result.sandbox_init_point,
      preapprovalId: result.id,
    });
  } catch (err) {
    console.error('[PrecioML] PreApproval error:', err);
    return res.status(500).json({ error: 'Error creando suscripción' });
  }
}
