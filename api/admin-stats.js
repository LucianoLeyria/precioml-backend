// ARCHIVO: api/admin-stats.js
// Dashboard de estadísticas — protegido con ADMIN_SECRET
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const now = Date.now();

    const [totalInstalls, totalInstallsCounter] = await Promise.all([
      redis.scard('pml:installs'),
      redis.get('pml:installs:total'),
    ]);

    const dailyKeys = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
      dailyKeys.push(`pml:installs:daily:${d}`);
    }
    const dailyCounts = await Promise.all(dailyKeys.map(k => redis.get(k)));
    const installsByDay = dailyKeys.map((k, i) => ({
      date: k.replace('pml:installs:daily:', ''),
      count: parseInt(dailyCounts[i] || '0', 10),
    }));

    const premiumExpiries = await redis.zrangebyscore(
      'pml:premium:expiries', '-inf', '+inf', { withScores: true }
    );

    let activePremium = 0;
    let expiredPremium = 0;
    const recentActivations = [];
    const premiumIds = [];

    for (let i = 0; i < premiumExpiries.length; i += 2) {
      premiumIds.push({ id: premiumExpiries[i], score: Number(premiumExpiries[i + 1]) });
    }

    const premiumDataList = await Promise.all(
      premiumIds.map(({ id }) => redis.get(`pml:premium:${id}`))
    );

    premiumIds.forEach(({ id, score }, idx) => {
      const raw = premiumDataList[idx];
      if (!raw) return;
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (score > now) activePremium++;
      else expiredPremium++;
      recentActivations.push({
        id: id.substring(0, 8) + '…',
        email: data.email || null,
        method: data.method || 'unknown',
        plan: data.plan || 'monthly',
        activatedAt: data.activatedAt,
        expiresAt: data.expiresAt,
        active: score > now,
      });
    });

    recentActivations.sort((a, b) => (b.activatedAt || 0) - (a.activatedAt || 0));

    const codeKeys = await redis.keys('pml:code:*');
    const codeNames = [...new Set(
      codeKeys.filter(k => !k.includes(':used')).map(k => k.replace('pml:code:', ''))
    )];

    const codeStats = await Promise.all(
      codeNames.map(async (code) => {
        const [data, usedCount] = await Promise.all([
          redis.hgetall(`pml:code:${code}`),
          redis.scard(`pml:code:${code}:used`),
        ]);
        return { code, maxUses: parseInt(data?.maxUses || '999', 10), usedCount: usedCount || 0 };
      })
    );

    const methodBreakdown = recentActivations.reduce((acc, u) => {
      acc[u.method] = (acc[u.method] || 0) + 1;
      return acc;
    }, {});

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      installs: { total: totalInstalls || 0, newInstalls: parseInt(totalInstallsCounter || '0', 10), byDay: installsByDay },
      premium: { total: premiumIds.length, active: activePremium, expired: expiredPremium, methodBreakdown },
      codes: codeStats,
      recentActivations: recentActivations.slice(0, 50),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
