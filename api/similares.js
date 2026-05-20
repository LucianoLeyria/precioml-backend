// api/similares.js — proxy server-side a ML Search (evita 403 desde extensión)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { q } = req.query;
  if (!q || q.trim().length < 3) {
    return res.status(400).json({ error: 'Parámetro q requerido' });
  }
  try {
    const url = `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(q.trim())}&sort=price_asc&limit=12`;
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).json({ error: `ML API: ${r.status}` });
    const data = await r.json();
    return res.status(200).json({ results: data.results || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
