// ARCHIVO: api/webhook.js
// Recibe notificaciones de MercadoPago:
//   - Primer pago de suscripción (type: payment, subscription_id presente)
//   - Renovaciones mensuales automáticas (type: payment)
//   - Cambios de estado de suscripción (type: subscription_preapproval)
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { Redis } from '@upstash/redis';

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  // MP siempre espera 200 rápido, sino reintenta
  res.status(200).end();

  if (req.method !== 'POST') return;

  try {
    const { type, data } = req.body;

    // ── Manejo de cambios en la suscripción ─────────────────────────
    if (type === 'subscription_preapproval') {
      const preapprovalId = data?.id;
      if (!preapprovalId) return;

      // Buscar estado de la suscripción via API de MP
      const resp = await fetch(
        'https://api.mercadopago.com/preapproval/' + preapprovalId,
        { headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN } }
      );
      if (!resp.ok) return;
      const sub = await resp.json();

      // Si el usuario canceló la suscripción, marcarla en Redis
      // (no revocamos el premium todavía, dejamos que expire naturalmente)
      if (sub.status === 'cancelled' && sub.external_reference) {
        const existing = await redis.get('pml:premium:' + sub.external_reference);
        if (existing) {
          const premiumData = typeof existing === 'string' ? JSON.parse(existing) : existing;
          await redis.set(
            'pml:premium:' + sub.external_reference,
            JSON.stringify({ ...premiumData, subscriptionCancelled: true, cancelledAt: Date.now() })
          );
        }
      }
      return;
    }

    // ── Manejo de pagos (primer pago + renovaciones mensuales) ────────
    if (type !== 'payment') return;

    const paymentId = data?.id;
    if (!paymentId) return;

    const payment = new Payment(mp);
    const paymentData = await payment.get({ id: paymentId });

    if (paymentData.status !== 'approved') return;

    const installationId = paymentData.external_reference;
    if (!installationId) return;

    const payerEmail = paymentData.payer?.email || null;
    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

    // Leer premium existente para acumular tiempo correctamente
    const existingRaw = await redis.get('pml:premium:' + installationId);
    const existing = existingRaw
      ? (typeof existingRaw === 'string' ? JSON.parse(existingRaw) : existingRaw)
      : null;

    // Si tiene premium activo, extender desde el expiresAt actual (no desde now)
    // Esto garantiza que las renovaciones acumulan tiempo correctamente
    const baseTime = (existing?.expiresAt && existing.expiresAt > now)
      ? existing.expiresAt
      : now;
    const expiresAt = baseTime + THIRTY_DAYS;

    const premiumData = {
      premium: true,
      activatedAt: existing?.activatedAt || now,
      expiresAt,
      plan: 'monthly',
      method: 'mercadopago',
      lastPaymentId: paymentId,
      lastPaymentAt: now,
      amount: paymentData.transaction_amount,
      email: payerEmail || existing?.email || null,
      subscriptionId: paymentData.subscription_id || existing?.subscriptionId || null,
      subscriptionCancelled: false, // reset si hubo cancel previo y pagó de nuevo
    };

    const ops = [
      redis.set('pml:premium:' + installationId, JSON.stringify(premiumData)),
      redis.zadd('pml:premium:expiries', { score: expiresAt, member: installationId }),
    ];

    // Índice email → installationId para recuperar premium si reinstala
    if (payerEmail) {
      ops.push(redis.set('pml:premium:email:' + payerEmail.toLowerCase(), installationId));
    }

    await Promise.all(ops);

    const isRenewal = !!existing?.premium;
    console.log('[PrecioML]', isRenewal ? 'Renovación' : 'Activación', 'premium para:', installationId, '| email:', payerEmail, '| vence:', new Date(expiresAt).toISOString());
  } catch (err) {
    console.error('[PrecioML] Webhook error:', err);
  }
}
