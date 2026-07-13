// ARCHIVO: api/register-install.js
// Registra una instalacion (llamado en cada arranque de Chrome / instalacion
// nueva) y, opcionalmente, el email que el usuario dejo voluntariamente en
// la casilla "Guarda tu email para alertas gratis" del popup. No hay
// endpoint separado para eso (register-email.js) para no sumar una funcion
// mas al limite de 12 de Vercel Hobby.
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { id, isNewInstall, version, email } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id requerido' });

  try {
    const now = Date.now();

    // Verificar si ya estaba registrado (sadd devuelve 1 si es nuevo, 0 si ya existia)
    const isFirstTime = await redis.sadd('pml:installs', id);

    const hashUpdate = {
      lastSeen: now,
      version: version || 'unknown',
    };

    const validEmail = typeof email === 'string' && email.includes('@') ? email.trim().toLowerCase() : null;
    if (validEmail) {
      hashUpdate.email = validEmail;
      hashUpdate.emailSavedAt = now;
    }

    const ops = [redis.hset('pml:install:' + id, hashUpdate)];

    if (validEmail) {
      ops.push(redis.sadd('pml:emails-free', validEmail));
    }

    // Solo contar como instalacion nueva si es la primera vez que vemos este ID
    if (isFirstTime === 1) {
      const dayKey = new Date(now).toISOString().slice(0, 10);
      ops.push(
        redis.hset('pml:install:' + id, { installedAt: now }),
        redis.incr('pml:installs:daily:' + dayKey),
        redis.incr('pml:installs:total'),
      );
    }

    await Promise.all(ops);
    return res.status(200).json({ ok: true, isNew: isFirstTime === 1 });
  } catch (err) {
    console.error('[PrecioML] register-install error:', err);
    return res.status(500).json({ error: err.message });
  }
}
