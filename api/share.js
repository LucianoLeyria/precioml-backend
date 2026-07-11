// api/share.js
import { kv } from '@vercel/kv';
import { randomBytes } from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { installationId, productId, title, history, url } = req.body;
  if (!installationId || installationId.length < 10) {
    return res.status(400).json({ error: 'installationId inválido' });
  }
      const premiumRaw = await kv.get(`pml:premium:${installationId}`);
      const premiumData = premiumRaw ? (typeof premiumRaw === 'string' ? JSON.parse(premiumRaw) : premiumRaw) : null;
      const isPremium = premiumData?.premium === true && (!premiumData.expiresAt || premiumData.expiresAt > Date.now());
      if (!isPremium) {
              return res.status(403).json({ error: 'Solo usuarios Premium pueden compartir historial' });
      }
  if (!productId || !title || !Array.isArray(history) || history.length < 2) {
    return res.status(400).json({ error: 'Datos insuficientes' });
  }
  try {
    const slug = randomBytes(4).toString('hex');
    const shareData = {
      productId,
      title: title.substring(0, 150),
      history: history.slice(-90),
      url: url || null,
      createdAt: Date.now(),
    };
    await kv.set(`share:${slug}`, shareData, { ex: 60 * 60 * 24 * 30 });
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const shareUrl = `https://${host}/api/s/${slug}`;
    return res.status(200).json({ slug, shareUrl });
  } catch (err) {
    return res.status(500).json({ error: 'Error generando el link' });
  }
}
