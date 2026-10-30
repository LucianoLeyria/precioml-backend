import { kv } from '@vercel/kv';
import { setCors, rateLimited, clientIp, INSTALL_ID_RE } from './_lib.js';

const MAX_POINTS = 90;
const ONE_DAY_MS = 86400000;
const TTL_SECONDS = 60 * 60 * 24 * 120; // 120 días

export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const productId = (
    req.query?.id ||
    req.body?.productId ||
    ''
  ).trim().toUpperCase();

    if (!productId || !/^(?:MLA|MLB|MLM|MLC|MLU|MLV|MCO|MPE)\d+$/.test(productId)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const key = `pml:history:${productId}`;
  const trackersKey = `pml:trackers:${productId}`;

  // ─── GET: devolver historial ───────────────────────────────────────
  if (req.method === 'GET') {
    if (await rateLimited('ph:get:' + clientIp(req), 120, 60)) return res.status(429).json({ error: 'Rate limit' });
    const history = await kv.get(key);
    const trackerCount = (await kv.scard(trackersKey)) || 0;
    return res.status(200).json({ history: history || [], trackerCount });
  }

  // ─── POST: registrar precio ────────────────────────────────────────
  if (req.method === 'POST') {
    const price = parseFloat(req.body?.price);
    if (!price || price <= 0 || price > 1e9) {
      return res.status(400).json({ error: 'Precio inválido' });
    }

    // Versiones viejas de la extension no mandaban installationId desde el
    // background: en ese caso se identifica por IP.
    const rawId = String(req.body?.installationId || '').trim();
    const installationId = INSTALL_ID_RE.test(rawId) ? rawId : '';
    const reporter = installationId || 'ip:' + clientIp(req);
    if (await rateLimited('ph:post:ip:' + clientIp(req), 60, 60) || await rateLimited('ph:post:' + reporter, 120, 3600)) {
      return res.status(429).json({ error: 'Rate limit' });
    }

    const history = (await kv.get(key)) || [];
    const now = Date.now();
    const lastPoint = history[history.length - 1];

    // Anti-envenenamiento: un salto > 50% respecto al ultimo punto solo se acepta
    // cuando OTRA instalacion reporta un precio parecido (±2%).
    let accept = true;
    if (lastPoint && Math.abs(price - lastPoint.price) / lastPoint.price > 0.5) {
      const pendingKey = `pml:pending:${productId}`;
      const pending = await kv.get(pendingKey);
      accept = !!pending && pending.by !== reporter && Math.abs(price - pending.price) / pending.price <= 0.02;
      if (!accept) await kv.set(pendingKey, { price, by: reporter }, { ex: 86400 });
      else await kv.del(pendingKey);
    }

    if (installationId) {
      await kv.sadd(trackersKey, installationId);
      await kv.expire(trackersKey, TTL_SECONDS);
    }

    // Solo agregar si paso al menos ~23 hs desde el ultimo punto
    if (accept && (!lastPoint || now - lastPoint.date > ONE_DAY_MS * 0.95)) {
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
