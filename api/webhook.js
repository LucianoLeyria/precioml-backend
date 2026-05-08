// api/webhook.js
// Recibe notificaciones de MercadoPago y activa el premium
// POST /api/webhook

import { MercadoPagoConfig, Payment } from 'mercadopago';
import { kv } from '@vercel/kv';

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

export default async function handler(req, res) {
  // MP siempre espera 200 rapido, sino reintenta
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

    // Guardar como premium en KV (sin expiracion = lifetime)
    await kv.set('premium:' + installationId, {
      activatedAt: Date.now(),
      paymentId: paymentId,
      amount: paymentData.transaction_amount,
      payerEmail: paymentData.payer ? paymentData.payer.email : null,
    });

    console.log('[PrecioML] Premium activado para instalacion: ' + installationId);
  } catch (err) {
    console.error('[PrecioML] Webhook error:', err);
  }
}
