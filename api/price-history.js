import { kv } from '@vercel/kv';

const MAX_POINTS = 90;
const ONE_DAY_MS = 86400000;
const TTL_SECONDS = 60 * 60 * 24 * 120; // 120 días

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const productId = (
    req.query?.id ||
    req.body?.productId ||
    ''
  ).trim().toUpperCase();

  if (!productId || !/^MLA\d+$/.test(productId)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const key = `pml:history:${productId}`;

  // ─── GET: devolver historial ───────────────────────────────────────
  if (req.method === 'GET') {
    const history = await kv.get(key);
    return res.status(200).json({ history: history || [] });
  }

  // ─── POST: registrar precio ────────────────────────────────────────
  if (req.method === 'POST') {
    const price = parseFloat(req.body?.price);
    if (!price || price <= 0) {
      return res.status(400).json({ error: 'Precio inválido' });
    }

    const history = (await kv.get(key)) || [];
    const now = Date.now();
    const lastPoint = history[history.length - 1];

    // Solo agregar si pasó al menos ~23 hs desde el último punto
    if (!lastPoint || now - lastPoint.date > ONE_DAY_MS * 0.95) {
      history.push({ price, date: now });
      if (history.length > MAX_POINTS) {
        history.splice(0, history.length - MAX_POINTS);
      }
      await kv.set(key, history, { ex: TTL_SECONDS });
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
