// ARCHIVO: api/register-install.js
// Registra una instalacion (llamado en cada arranque de Chrome / instalacion
// nueva) y, opcionalmente, el email que el usuario dejo voluntariamente en
// la casilla "Guarda tu email para alertas gratis" del popup. No hay
// endpoint separado para eso (register-email.js) para no sumar una funcion
// mas al limite de 12 de Vercel Hobby.
import { redis, setCors, rateLimited, clientIp, INSTALL_ID_RE } from './_lib.js';

// La version viene del manifest de la extension (X.Y.Z). Se valida el formato
// para que nadie ensucie el dashboard con versiones inventadas.
const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

export default async function handler(req, res) {
  setCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { id, isNewInstall, version, email } = req.body || {};
  if (!id || !INSTALL_ID_RE.test(String(id))) return res.status(400).json({ error: 'id requerido' });
  if (version !== undefined && version !== null && !VERSION_RE.test(String(version))) {
    return res.status(400).json({ error: 'version invalida' });
  }
  if (await rateLimited('ri:' + clientIp(req), 60, 3600)) return res.status(429).json({ error: 'Rate limit' });

  try {
    const now = Date.now();

    // Verificar si ya estaba registrado (sadd devuelve 1 si es nuevo, 0 si ya existia)
    const isFirstTime = await redis.sadd('pml:installs', id);

    const hashUpdate = { lastSeen: now };
    // Solo se pisa la version si viene en el pedido: guardar un email manda
    // solo {id, email} y antes eso dejaba la version en "unknown".
    if (version) hashUpdate.version = version;
    else if (isFirstTime === 1) hashUpdate.version = 'unknown';

    const validEmail = typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && email.length <= 200 ? email.trim().toLowerCase() : null;
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
