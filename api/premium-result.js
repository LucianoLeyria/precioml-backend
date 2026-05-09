// api/premium-result.js
// Página de resultado post-pago MercadoPago
// GET /api/premium-result?status=success|failure|pending

export default function handler(req, res) {
  const { status } = req.query;

  const configs = {
    success: {
      emoji: '🎉',
      title: '¡Pago confirmado!',
      message: 'Tu cuenta Premium de PrecioML ya está activa.',
      sub: 'Podés cerrar esta pestaña y volver a la extensión.',
      color: '#00a650',
      bg: '#f0fff6',
    },
    pending: {
      emoji: '⏳',
      title: 'Pago pendiente',
      message: 'Tu pago está siendo procesado.',
      sub: 'Una vez acreditado, el Premium se activa automáticamente. Podés cerrar esta pestaña.',
      color: '#f5a623',
      bg: '#fffbf0',
    },
    failure: {
      emoji: '❌',
      title: 'Pago no completado',
      message: 'No se pudo procesar el pago.',
      sub: 'Podés intentarlo de nuevo desde la extensión PrecioML en cualquier momento.',
      color: '#e05d00',
      bg: '#fff5f0',
    },
  };

  const cfg = configs[status] || configs.failure;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>PrecioML — ${cfg.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
      background: ${cfg.bg};
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.10);
      padding: 40px 32px;
      max-width: 420px;
      width: 100%;
      text-align: center;
    }
    .logo { font-size: 15px; font-weight: 700; color: #3483fa; margin-bottom: 24px; }
    .emoji { font-size: 52px; margin-bottom: 16px; }
    .title { font-size: 22px; font-weight: 800; color: ${cfg.color}; margin-bottom: 10px; }
    .message { font-size: 15px; color: #444; margin-bottom: 8px; line-height: 1.5; }
    .sub { font-size: 13px; color: #888; line-height: 1.5; margin-top: 4px; }
    .close-btn {
      margin-top: 28px;
      display: inline-block;
      background: ${cfg.color};
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 10px 28px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">📈 PrecioML</div>
    <div class="emoji">${cfg.emoji}</div>
    <div class="title">${cfg.title}</div>
    <p class="message">${cfg.message}</p>
    <p class="sub">${cfg.sub}</p>
    <button class="close-btn" onclick="window.close()">Cerrar pestaña</button>
  </div>
</body>
</html>`);
}
