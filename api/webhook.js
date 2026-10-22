// ARCHIVO: api/webhook.js
// Recibe notificaciones de MercadoPago:
//   - Primer pago de suscripción (type: payment, subscription_id presente)
//   - Renovaciones mensuales automáticas (type: payment)
//   - Cambios de estado de suscripción (type: subscription_preapproval)
//
// Cambios de seguridad/robustez:
//   - Se procesa ANTES de responder (en Vercel lo que corre despues de
//     res.end() puede cortarse y el pago quedaba sin activar).
//   - Idempotencia por paymentId: MP reintenta notificaciones y antes cada
//     repeticion sumaba otros 30 dias de premium.
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { Redis } from '@upstash/redis';

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const PAYMENT_DEDUP_TTL = 90 * 24 * 3600; // 90 dias

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).end();

  try {
    const { type, data } = req.body || {};

    // ── Manejo de cambios en la suscripción ─────────────────────────
    if (type === 'subscription_preapproval') {
      const preapprovalId = data?.id;
      if (!preapprovalId) return res.status(200).end();

      const resp = await fetch(
        'https://api.mercadopago.com/preapproval/' + preapprovalId,
        { headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN } }
      );
      if (!resp.ok) return res.status(200).end();
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
      return res.status(200).end();
    }

    // ── Manejo de pagos (primer pago + renovaciones mensuales) ────────
    if (type !== 'payment') return res.status(200).end();

    const paymentId = data?.id;
    if (!paymentId) return res.status(200).end();

    const payment = new Payment(mp);
    const paymentData = await payment.get({ id: paymentId });

    if (paymentData.status !== 'approved') return res.status(200).end();

    const installationId = paymentData.external_reference;
    if (!installationId) return res.status(200).end();

    // Idempotencia: si este pago ya fue procesado, no sumar tiempo de nuevo.
    // SET NX devuelve null si la key ya existia.
    const firstTime = await redis.set('pml:payment:' + paymentId, installationId, {
      nx: true,
      ex: PAYMENT_DEDUP_TTL,
    });
    if (!firstTime) {
      console.log('[PrecioML] Pago ya procesado, se ignora:', paymentId);
      return res.status(200).end();
    }

    try {
      const payerEmail = paymentData.payer?.email || null;
      const now = Date.now();
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

      // Leer premium existente para acumular tiempo correctamente
      const existingRaw = await redis.get('pml:premium:' + installationId);
      const existing = existingRaw
        ? (typeof existingRaw === 'string' ? JSON.parse(existingRaw) : existingRaw)
        : null;

      // Si tiene premium activo, extender desde el expiresAt actual (no desde now)
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

      // Índice email → installationId (ya no se usa para migrar premium
      // automaticamente, pero el dashboard/recuperacion verificada lo puede usar)
      if (payerEmail) {
        ops.push(redis.set('pml:premium:email:' + payerEmail.toLowerCase(), installationId));
      }

      await Promise.all(ops);

      const isRenewal = !!existing?.premium;
      console.log('[PrecioML]', isRenewal ? 'Renovación' : 'Activación', 'premium para:', installationId, '| vence:', new Date(expiresAt).toISOString());
    } catch (inner) {
      // Si falló la activación, liberar la marca de idempotencia para que el
      // reintento de MP pueda procesar este pago de nuevo.
      await redis.del('pml:payment:' + paymentId).catch(() => {});
      throw inner;
    }

    return res.status(200).end();
  } catch (err) {
    console.error('[PrecioML] Webhook error:', err);
    // 500 => MercadoPago reintenta (seguro ahora que hay idempotencia)
    return res.status(500).end();
  }
}
