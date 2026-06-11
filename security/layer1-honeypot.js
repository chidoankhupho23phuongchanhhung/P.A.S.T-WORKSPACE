/**
 * 🛡️ LỚP BẢO MẬT 1 — Honeypot Middleware
 * 
 * Mục tiêu:
 *  - Hacker dò các route nhạy cảm phổ biến (.env, admin, wp-admin, ...)
 *    → nhận lại dữ liệu rác (fake data) hoặc bị redirect về trang chủ
 *  - Ghi log IP và User-Agent của kẻ tấn công
 *  - Không để lộ bất kỳ thông báo lỗi thật nào
 */

// Danh sách route mồi nhử (honeypot)
const HONEYPOT_ROUTES = [
  // Env & config files
  '/.env', '/.env.local', '/.env.production', '/.env.backup',
  '/config.json', '/config.yml', '/config.yaml',
  '/settings.json', '/database.yml',

  // Admin panels thường bị dò
  '/admin', '/admin/', '/administrator', '/wp-admin',
  '/wp-login.php', '/phpmyadmin', '/cpanel', '/plesk',

  // API endpoints nhạy cảm
  '/api/admin', '/api/users', '/api/secrets', '/api/config',
  '/api/v1/admin', '/api/internal',

  // Source code & backup
  '/.git/config', '/.git/HEAD', '/backup.zip', '/backup.sql',
  '/dump.sql', '/db.sql', '/.htaccess', '/web.config',

  // Cloud & server info
  '/server-status', '/server-info', '/.aws/credentials',
  '/credentials.json', '/service-account.json',
];

// Dữ liệu rác trả về cho hacker (fake, vô nghĩa)
const FAKE_RESPONSES = [
  { token: 'eyJhbGciOiJSUzI1NiJ9.FAKE.SIGNATURE', db: 'postgresql://fake:fake@localhost/none' },
  { secret: 'AKIAIOSFODNN7EXAMPLE', password: 'hunter2_but_not_real' },
  { api_key: 'sk-proj-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', env: 'production' },
  { connection_string: 'Server=fake;Database=none;User=sa;Password=FAKE;' },
];

/**
 * Honeypot middleware — dùng với Express / Next.js API routes
 * @param {Request} req 
 * @param {Response} res 
 * @param {Function} next 
 */
export function honeypotMiddleware(req, res, next) {
  const path = req.path?.toLowerCase() || req.url?.toLowerCase() || '';
  const isHoneypot = HONEYPOT_ROUTES.some(route =>
    path === route || path.startsWith(route + '/')
  );

  if (!isHoneypot) return next();

  // Ghi log kẻ tấn công
  const attackLog = {
    timestamp: new Date().toISOString(),
    ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
    method: req.method,
    path: req.path || req.url,
    referer: req.headers['referer'] || '-',
  };

  console.warn('[🍯 HONEYPOT HIT]', JSON.stringify(attackLog));

  // 50% redirect về trang chủ, 50% trả fake data (khó đoán hơn)
  const roll = Math.random();

  if (roll < 0.5) {
    // Redirect về trang chủ với delay ngẫu nhiên (làm chậm scanner)
    setTimeout(() => {
      res.redirect(301, '/');
    }, Math.floor(Math.random() * 2000) + 500);
    return;
  }

  // Trả về dữ liệu rác trông giống thật
  const fakeData = FAKE_RESPONSES[Math.floor(Math.random() * FAKE_RESPONSES.length)];
  const fakeExtras = generateNoise();

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Powered-By', 'PHP/7.4.3'); // Giả mạo stack
  res.status(200).json({ ...fakeData, ...fakeExtras });
}

/** Tạo noise ngẫu nhiên để làm khó hacker */
function generateNoise() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const rand = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return {
    _session: rand(32),
    _build: rand(8),
    _region: ['us-east-1', 'eu-west-1', 'ap-southeast-1'][Math.floor(Math.random() * 3)],
  };
}

/**
 * Dành cho Next.js middleware (middleware.ts / middleware.js)
 * Đặt file này ở root project và export config bên dưới
 */
export function nextjsHoneypot(request) {
  const { NextResponse } = require('next/server');
  const path = request.nextUrl.pathname.toLowerCase();
  const isHoneypot = HONEYPOT_ROUTES.some(route =>
    path === route || path.startsWith(route + '/')
  );

  if (isHoneypot) {
    const roll = Math.random();
    if (roll < 0.5) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return new Response(JSON.stringify({ error: 'Not Found', code: 404 }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return NextResponse.next();
}
