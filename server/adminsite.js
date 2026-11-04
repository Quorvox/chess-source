// Скрытый админ-сайт: работает только на отдельном адресе (ADMIN_HOST), вход по логину, паролю и коду из приложения.
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { db, DATA } = require('./db');
const auth = require('./auth');
const totp = require('./totp');
const adminRouter = require('./admin');

const ADMIN_DIR = path.join(__dirname, '..', 'admin');
const PUBLIC = path.join(__dirname, '..', 'public');
const SESSION_HOURS = 8;
const MAX_FAILS = 5;
const LOCK_MIN = 15;
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

module.exports = function createAdminSite({ kick, onlineCount, prod }) {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    next();
  });
  app.use(express.json({ limit: '20kb' }));
  // изменяющие запросы только со своим заголовком (плюс куки SameSite=Strict)
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && req.get('x-requested-with') !== 'qc') return res.status(403).json({ error: 'forbidden' });
    next();
  });

  const ipOf = (req) => (req.ip || '').replace(/^::ffff:/, '');
  const cookieFlags = `HttpOnly; Path=/; SameSite=Strict${prod ? '; Secure' : ''}`;

  function adminFromReq(req) {
    const token = auth.parseCookies(req.headers.cookie).qa;
    if (!token) return null;
    const row = db.prepare(`SELECT a.id, a.login FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ? AND s.expires > ?`).get(sha(token), Date.now());
    // id делаем отрицательным, чтобы не путать с id игроков в журнале
    return row ? { id: -row.id, username: row.login, rawId: row.id } : null;
  }

  app.post('/api/admin-login', async (req, res) => {
    if (!auth.rateLimit('alogin:' + ipOf(req), 8, 900000)) return res.status(429).json({ code: 'too_many', error: 'too many attempts' });
    const login = String(req.body?.login || '').trim();
    const password = String(req.body?.password || '');
    const code = String(req.body?.code || '').replace(/\s/g, '');
    const row = login ? db.prepare('SELECT * FROM admins WHERE login = ?').get(login) : null;
    const fail = () => res.status(401).json({ code: 'wrong_credentials', error: 'wrong credentials' });
    if (!row) { await auth.verifyPassword(password, 'x:y').catch(() => {}); return fail(); }
    if (row.locked_until > Date.now()) return res.status(429).json({ code: 'locked', error: 'locked' });
    const passOk = await auth.verifyPassword(password, row.pass);
    const step = passOk ? totp.verify(row.totp_secret, code, row.last_step) : null;
    if (!passOk || step === null) {
      const failed = row.failed + 1;
      if (failed >= MAX_FAILS) db.prepare('UPDATE admins SET failed = 0, locked_until = ? WHERE id = ?').run(Date.now() + LOCK_MIN * 60000, row.id);
      else db.prepare('UPDATE admins SET failed = ? WHERE id = ?').run(failed, row.id);
      return fail();
    }
    db.prepare('UPDATE admins SET last_step = ?, failed = 0 WHERE id = ?').run(step, row.id);
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    db.prepare('DELETE FROM admin_sessions WHERE expires < ?').run(now);
    db.prepare('INSERT INTO admin_sessions (token_hash, admin_id, ip, created, expires) VALUES (?, ?, ?, ?, ?)').run(sha(token), row.id, ipOf(req), now, now + SESSION_HOURS * 3600000);
    res.append('Set-Cookie', `qa=${token}; ${cookieFlags}; Max-Age=${SESSION_HOURS * 3600}`);
    res.json({ ok: true, login: row.login });
  });

  app.post('/api/admin-logout', (req, res) => {
    const token = auth.parseCookies(req.headers.cookie).qa;
    if (token) db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(sha(token));
    res.append('Set-Cookie', `qa=; ${cookieFlags}; Max-Age=0`);
    res.json({ ok: true });
  });

  app.get('/api/admin-me', (req, res) => {
    const a = adminFromReq(req);
    if (!a) return res.status(401).json({ error: 'auth' });
    res.json({ login: a.username });
  });

  app.use('/api/admin', adminRouter({ kick, onlineCount, getAdmin: adminFromReq }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

  // страницы: свой каталог, а общие стили, шрифты и модули берём из публичного
  app.use(express.static(ADMIN_DIR, { index: false }));
  app.use('/avatars', express.static(path.join(DATA, 'avatars'), { maxAge: '1h' })); // чтобы в админке были видны аватары
  for (const p of ['/css', '/js', '/vendor/fonts', '/vendor/chessground']) app.use(p, express.static(path.join(PUBLIC, p)));
  app.get('/logo.svg', (req, res) => res.sendFile(path.join(PUBLIC, 'logo.svg')));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(ADMIN_DIR, 'index.html')));

  return app;
};
