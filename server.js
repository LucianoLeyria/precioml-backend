// server.js — adaptador para correr el backend de PrecioML fuera de Vercel
// (Render, Railway, Fly.io, un VPS, etc.).
//
// Los handlers de api/*.js usan la firma de Vercel: export default (req, res).
// Express provee casi la misma API (req.query, req.body, res.status().json(),
// res.send(), res.setHeader(), res.end()), así que se montan sin cambios:
//   api/check-premium.js  ->  /api/check-premium
//   api/share.js          ->  /api/share
//   ...y así con cada archivo que no empiece con "_".

import express from 'express';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// @vercel/kv lee KV_REST_API_URL / KV_REST_API_TOKEN. Fuera de Vercel solo hace
// falta definir las variables de Upstash: se copian acá para no tocar el código.
process.env.KV_REST_API_URL ||= process.env.UPSTASH_REDIS_REST_URL;
process.env.KV_REST_API_TOKEN ||= process.env.UPSTASH_REDIS_REST_TOKEN;

const missing = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error('[PrecioML] Faltan variables de entorno obligatorias:', missing.join(', '));
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(__dirname, 'api');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // para que x-forwarded-for / host lleguen bien detrás del proxy del hosting
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Health check (Render/Railway lo usan para saber si el servicio está vivo)
app.get(['/', '/health'], (req, res) => res.status(200).json({ ok: true, service: 'precioml-backend' }));

const mounted = [];
for (const file of readdirSync(apiDir)) {
  if (!file.endsWith('.js') || file.startsWith('_')) continue;
  const name = file.slice(0, -3);
  const mod = await import(pathToFileURL(path.join(apiDir, file)).href);
  const handler = mod.default;
  if (typeof handler !== 'function') continue;
  app.all('/api/' + name, async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(`[${name}] error no controlado:`, err);
      if (!res.headersSent) res.status(500).json({ error: 'Error interno' });
    }
  });
  mounted.push('/api/' + name);
}

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`[PrecioML] backend escuchando en :${port}`);
  console.log('[PrecioML] endpoints:', mounted.join(', '));
});
