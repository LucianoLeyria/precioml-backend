// api/s/[slug].js
// Renderiza la página pública de historial de precios compartido
// GET /api/s/{slug}

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { slug } = req.query;

  if (!slug) return res.status(400).send('Slug requerido');

  const data = await kv.get(`share:${slug}`);

  if (!data) {
    return res.status(404).send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>PrecioML - No encontrado</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px">
  <h1>Link no encontrado</h1>
  <p>Este link expiro o no existe.</p>
  <a href="https://precioml.com">Instalar PrecioML</a>
</body></html>`);
  }

  const { title, history, url } = data;
  const prices = history.map(h => h.price);
  const dates = history.map(h => new Date(h.date).toLocaleDateString('es-AR'));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const lastPrice = prices[prices.length - 1];

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Historial de precios | PrecioML</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0d1117; color: #c9d1d9; min-height: 100vh; padding: 24px; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 1.2rem; color: #e6edf3; margin-bottom: 8px; }
    .meta { font-size: 0.85rem; color: #8b949e; margin-bottom: 24px; }
    .stats { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .stat { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px 20px; flex: 1; min-width: 120px; }
    .stat-label { font-size: 0.75rem; color: #8b949e; margin-bottom: 4px; }
    .stat-value { font-size: 1.3rem; font-weight: 700; color: #e6edf3; }
    .stat-value.green { color: #3fb950; }
    .stat-value.red { color: #f85149; }
    .chart-wrap { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }
    .footer { margin-top: 24px; text-align: center; font-size: 0.8rem; color: #8b949e; }
    .footer a { color: #58a6ff; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Historial: ${title}</h1>
    <div class="meta">${history.length} registros</div>
    <div class="stats">
      <div class="stat">
        <div class="stat-label">Precio actual</div>
        <div class="stat-value">$${lastPrice.toLocaleString('es-AR')}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Minimo historico</div>
        <div class="stat-value green">$${minPrice.toLocaleString('es-AR')}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Maximo historico</div>
        <div class="stat-value red">$${maxPrice.toLocaleString('es-AR')}</div>
      </div>
    </div>
    <div class="chart-wrap">
      <canvas id="chart"></canvas>
    </div>
    <div class="footer">
      Generado con <a href="https://precioml.com">PrecioML</a>
    </div>
  </div>
  <script>
    const ctx = document.getElementById('chart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(dates)},
        datasets: [{
          label: 'Precio ($)',
          data: ${JSON.stringify(prices)},
          borderColor: '#58a6ff',
          backgroundColor: 'rgba(88,166,255,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#8b949e', maxTicksLimit: 10 }, grid: { color: '#21262d' } },
          y: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } }
        }
      }
    });
  <\/script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(html);
}
