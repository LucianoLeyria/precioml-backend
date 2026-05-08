// api/create-preference.js
// Crea una preferencia de MercadoPago Checkout Pro
// POST /api/create-preference  { installationId: "uuid" }

import { MercadoPagoConfig, Preference } from 'mercadopago';
import { kv } from '@vercel/kv';

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { installationId } = req.body;
  if (!installationId || installationId.length < 10) {
    return res.status(400).json({ error: 'installationId invalido' });
  }

  const existing = await kv.get('premium:' + installationId);
  if (existing) {
    return res.status(200).json({ alreadyPremium: true });
  }

  try {
    const preference = new Preference(mp);
    const result = await preference.create({
      body: {
        items: [{
          id: 'precioml-premium',
          title: 'PrecioML Premium - Historial completo de precios',
          description: 'Acceso ilimitado al historial de precios en MercadoLibre',
          quantity: 1,
          unit_price: 2000,
          currency_id: 'ARS',
        }],
        external_reference: installationId,
        back_urls: {
          success: process.env.APP_URL + '/premium-success.html',
          failure: process.env.APP_URL + '/premium-error.html',
          pending: process.env.APP_URL + '/premium-pending.html',
        },
        auto_return: 'approved',
        notification_url: process.env.APP_URL + '/api/webhook',
        statement_descriptor: 'PRECIOML PREMIUM',
        expires: false,
      },
    });

    return res.status(200).json({
      checkoutUrl: result.init_point,
      sandboxUrl: result.sandbox_init_point,
      preferenceId: result.id,
    });
  } catch (err) {
    console.error('MP error:', err);
    return res.status(500).json({ error: 'Error creando preferencia de pago' });
  }
        }
