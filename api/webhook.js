// ARCHIVO: api/webhook.js
// Recibe notificaciones de MercadoPago y activa el premium mensual
// POST /api/webhook

import { MercadoPagoConfig, Payment } from 'mercadopago';
import { Redis } from '@upstash/redis';

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  // MP siempre espera 200 rápido, sino reintenta
  res.status(200).end();

  if (req.method !== 'POST') return;

  try {
    const { type, data } = req.body;

    // Solo nos interesan los pagos
    if (type !== 'payment') return;

    const paymentId = data && data.id;
    if (!paymentId) return;

    // Obtener detalles del pago
    const payment = new Payment(mp);
    const paymentData = await payment.get({ id: paymentId });

    // Solo procesar pagos aprobados
    if (paymentData.status !== 'approved') return;

    const installationId = paymentData.external_reference;
    if (!installationId) return;

    const payerEmail = paymentData.payer?.email || null;
    const now = Date.now();
    const expiresAt = now + (30 * 24 * 60 * 60 * 1000); // 30 días

    const premiumData = {
      premium: true,
      activatedAt: now,
      expiresAt,
      plan: 'monthly',
      method: 'mercadopago',
      paymentId,
      amount: paymentData.transaction_amount,
      email: payerEmail,
    };

    const ops = [
      // Guardar premium por installationId
      redis.set(`pml:premium:${installationId}`, JSON.stringify(premiumData)),
      // Sorted set para el cron de notificaciones de vencimiento
      redis.zadd('pml:premium:expiries', { score: expiresAt, member: installationId }),
    ];

    // Si hay email del pagador, guardar índice email → installationId
    // Esto permite recuperar el premium si reinstala la extensión
    if (payerEmail) {
      ops.push(redis.set(`pml:premium:email:${payerEmail.toLowerCase()}`, installationId));
    }

    await Promise.all(ops);

    console.log('[PrecioML] Premium activado para:', installationId, '| email:', payerEmail);
  } catch (err) {
    console.error('[PrecioML] Webhook error:', err);
  }
}
