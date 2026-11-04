// ARCHIVO: api/register-install.js
// Registra una instalacion (llamado en cada arranque de Chrome / instalacion
// nueva) y, opcionalmente, el email que el usuario dejo voluntariamente en
// la casilla "Guarda tu email para alertas gratis" del popup. No hay
// endpoint separado para eso (register-email.js) para no sumar una funcion
// mas al limite de 12 de Vercel Hobby.
//
// Endurecimiento: el endpoint es publico, asi que se valida el formato de
// id (UUID v4), version (X.Y.Z) y email, y se limita por IP para que nadie
// pueda inflar las instalaciones ni ensuciar el dashboard con valores
// inventados (ej. versiones que no existen).
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

// Permisivo a proposito (UUID de la extension actual + cualquier formato
// razonable de versiones viejas), pero rechaza basura y strings gigantes.
const UUID_RE = /^[A-Za-z0-9-]{16,64}$/;
const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const RATE_LIMIT_PER_HOUR = 60; // por IP; sobra para uso normal (1 llamada por arranque)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { id, isNewInstall, version, email } = req.body || {};
  if (!id || typeof id !== 'string' || !UUID_RE.test(id)) {
    return res.status(400).json({ error: 'id invalido' });
  }
  if (version !== undefined && version !== null && (typeof version !== 'string' || !VERSION_RE.test(version))) {
    return res.status(400).json({ error: 'version invalida' });
  }

  try {
    // Rate limit por IP (ventana de 1 hora)
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const hour = new Date().toISOString().slice(0, 13);
    const rlKey = 'pml:rl:register:' + ip + ':' + hour;
    const hits = await redis.incr(rlKey);
    if (hits === 1) await redis.expire(rlKey, 3700);
    if (hits > RATE_LIMIT_PER_HOUR) {
      return res.status(429).json({ error: 'demasiadas solicitudes' });
    }

    const now = Date.now();

    // Verificar si ya estaba registrado (sadd devuelve 1 si es nuevo, 0 si ya existia)
    const isFirstTime = await redis.sadd('pml:installs', id);

    const hashUpdate = {
      lastSeen: now,
      version: version || 'unknown',
    };

    const validEmail = typeof email === 'string' && EMAIL_RE.test(email.trim()) ? email.trim().toLowerCase() : null;
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
      // Dia en hora Argentina (UTC-3), para que coincida con el dashboard
      const dayKey = new Date(now - 3 * 3600 * 1000).toISOString().slice(0, 10);
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
    return res.status(500).json({ error: 'Error interno' });
  }
}
