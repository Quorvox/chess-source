const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { db, DATA, START_RATING } = require('./db');
const auth = require('./auth');
const games = require('./games');
const mm = require('./mm');
const rooms = require('./rooms');
const createAdminSite = require('./adminsite');
const tournaments = require('./tournaments');
const mailer = require('./mailer');
const social = require('./social');
const crypto = require('crypto');
require('./botlife');

const PORT = Number(process.env.PORT) || 3410;
const PROD = process.env.NODE_ENV === 'production';
const PUBLIC = path.join(__dirname, '..', 'public');
const PRESETS = Array.from({ length: 12 }, (_, i) => 'p' + (i + 1));

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Админка живёт на отдельном скрытом адресе. На обычном сайте её нет вообще: ни страниц, ни API.
const ADMIN_HOST = (process.env.ADMIN_HOST || '').toLowerCase();
const adminSite = ADMIN_HOST ? createAdminSite({
  kick: (userId) => { for (const ws of clients) if (ws.user && ws.user.id === userId) ws.close(); },
  onlineCount: () => realOnline(),
  prod: PROD,
}) : null;
app.use((req, res, next) => {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  if (adminSite && host === ADMIN_HOST) return adminSite(req, res, next);
  if (req.path.startsWith('/api/admin')) return res.status(404).json({ error: 'not found' });
  next();
});

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; worker-src 'self' blob:; frame-src https://oauth.telegram.org https://telegram.org; frame-ancestors 'none'",
  });
  next();
});
app.use(express.json({ limit: '20kb' }));

// CSRF: изменяющие запросы только со своим заголовком (его чужой сайт без CORS не поставит)
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.get('x-requested-with') !== 'qc') return res.status(403).json({ error: 'forbidden' });
  next();
});

const me = (req) => auth.userFromCookieHeader(req.headers.cookie);
const ipOf = (req) => (req.ip || '').replace(/^::ffff:/, '');
const { badgeOf } = require('./badge');
const tgbot = require('./tgbot');
const friends = require('./friends');
const presence = require('./presence');
const pub = (u) => ({
  bot: u.is_bot && u.show_bot ? true : undefined, online: u.is_bot ? presence.botOnline(u) : isOnline(u.id), badge: badgeOf(u), username: u.username, display: u.display, bio: u.bio, country: u.country, avatar: u.avatar,
  rating: Math.round(u.rating), games: u.games, wins: u.wins, losses: u.losses, draws: u.draws, created: u.created,
});

function setCookie(res, token, maxAgeSec) {
  res.append('Set-Cookie', `qc=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}${PROD ? '; Secure' : ''}`);
}

const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const PUBLIC_URL = () => process.env.PUBLIC_URL || 'http://localhost:' + PORT;
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

async function sendVerification(user) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO email_tokens (token_hash, user_id, expires) VALUES (?, ?, ?)').run(sha(token), user.id, Date.now() + 48 * 3600000);
  return mailer.sendMail({
    to: user.email,
    subject: 'QuorChess: подтверди почту / confirm your email',
    text: `Привет, ${user.username}!\nПодтверди почту по ссылке: ${PUBLIC_URL()}/api/verify?token=${token}\n\nHi ${user.username}! Confirm your email: ${PUBLIC_URL()}/api/verify?token=${token}\n`,
  });
}

app.post('/api/register', async (req, res) => {
  if (req.body?.agree !== true) return res.status(400).json({ code: 'need_agree', error: 'need agree' }); // согласие с соглашением и политикой
  if (!auth.rateLimit('reg:' + ipOf(req), 5, 3600000)) return res.status(429).json({ code: 'too_many', error: 'too many attempts' });
  const { username, password } = req.body || {};
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!NAME_RE.test(username || '')) return res.status(400).json({ code: 'bad_username', error: 'bad username' });
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ code: 'bad_email', error: 'bad email' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 100) return res.status(400).json({ code: 'bad_password', error: 'bad password' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ code: 'email_taken', error: 'email taken' });
  const hash = await auth.hashPassword(password);
  const now = Date.now();
  try {
    const r = db.prepare(`INSERT INTO users (username, pass, display, avatar, created, last_seen, last_ip, reg_ip, email, provider, rating, consent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'password', ?, ?)`).run(username, hash, username, PRESETS[Math.floor(Math.random() * 12)], now, now, ipOf(req), ipOf(req), email, START_RATING, now);
    const id = Number(r.lastInsertRowid);
    sendVerification({ id, username, email });
    setCookie(res, auth.createSession(id), 30 * 86400);
    res.json({ ok: true, mail: mailer.enabled() });
  } catch {
    res.status(409).json({ code: 'username_taken', error: 'username taken' });
  }
});

app.get('/api/verify', (req, res) => {
  const row = db.prepare('SELECT * FROM email_tokens WHERE token_hash = ? AND expires > ?').get(sha(String(req.query.token || '')), Date.now());
  if (row) {
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(row.user_id);
    db.prepare('DELETE FROM email_tokens WHERE token_hash = ?').run(row.token_hash);
  }
  res.redirect(row ? '/?verified=1' : '/?verified=0');
});

app.post('/api/resend-verification', async (req, res) => {
  const u = me(req);
  if (!u || !u.email || u.email_verified) return res.status(400).json({ error: 'nothing to do' });
  if (!auth.rateLimit('resend:' + u.id, 3, 3600000)) return res.status(429).json({ code: 'too_many', error: 'too many attempts' });
  res.json({ ok: await sendVerification(u) });
});

app.post('/api/login', async (req, res) => {
  if (!auth.rateLimit('login:' + ipOf(req), 10, 600000)) return res.status(429).json({ code: 'too_many', error: 'too many attempts' });
  const { username, password } = req.body || {};
  const id = typeof username === 'string' ? username.trim() : '';
  const u = id ? (id.includes('@') ? db.prepare('SELECT * FROM users WHERE email = ? AND is_bot = 0').get(id.toLowerCase()) : db.prepare('SELECT * FROM users WHERE username = ? AND is_bot = 0').get(id)) : null;
  if (!u || typeof password !== 'string' || !(await auth.verifyPassword(password, u.pass))) return res.status(401).json({ code: 'wrong_credentials', error: 'wrong credentials' });
  if (u.banned) return res.status(403).json({ code: 'banned', error: 'banned', reason: u.ban_reason });
  db.prepare('UPDATE users SET last_seen = ?, last_ip = ? WHERE id = ?').run(Date.now(), ipOf(req), u.id);
  setCookie(res, auth.createSession(u.id), 30 * 86400);
  res.json({ ok: true });
});

// какие способы входа включены на сервере
app.get('/api/config', (req, res) => res.json({ telegram: process.env.TELEGRAM_BOT_USERNAME || null, discord: !!process.env.DISCORD_CLIENT_ID, mail: mailer.enabled() }));

function socialLogin(req, res, u) {
  if (u.banned) return res.redirect('/login?err=banned');
  db.prepare('UPDATE users SET last_seen = ?, last_ip = ? WHERE id = ?').run(Date.now(), ipOf(req), u.id);
  setCookie(res, auth.createSession(u.id), 30 * 86400);
  res.redirect('/');
}

app.get('/api/auth/telegram', (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !auth.rateLimit('tg:' + ipOf(req), 20, 600000)) return res.redirect('/login');
  const q = {};
  for (const [k, v] of Object.entries(req.query)) if (typeof v === 'string') q[k] = v;
  if (!social.verifyTelegram(q, token)) { console.log('telegram widget: подпись не прошла, поля:', Object.keys(q).join(',')); return res.redirect('/login?err=social'); }
  socialLogin(req, res, social.findOrCreate({ provider: 'telegram', pid: q.id, nameHint: q.username || q.first_name, display: q.first_name || q.username, ip: ipOf(req) }));
});

// вход по одноразовой ссылке из Telegram-бота
app.get('/api/auth/tg', (req, res) => {
  if (!auth.rateLimit('tglink:' + ipOf(req), 20, 600000)) return res.redirect('/login');
  const u = tgbot.consume(req.query.t);
  if (!u) return res.redirect('/login?err=social');
  socialLogin(req, res, u);
});

app.get('/api/auth/discord', (req, res) => {
  if (!process.env.DISCORD_CLIENT_ID) return res.redirect('/login');
  const state = crypto.randomBytes(16).toString('hex');
  res.append('Set-Cookie', `qc_state=${state}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600${PROD ? '; Secure' : ''}`);
  const url = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(process.env.DISCORD_CLIENT_ID)}&redirect_uri=${encodeURIComponent(PUBLIC_URL() + '/api/auth/discord/callback')}&response_type=code&scope=${encodeURIComponent('identify email')}&state=${state}`;
  res.redirect(url);
});

app.get('/api/auth/discord/callback', async (req, res) => {
  try {
    const state = auth.parseCookies(req.headers.cookie).qc_state;
    if (!process.env.DISCORD_CLIENT_ID || !state || state !== req.query.state || typeof req.query.code !== 'string') return res.redirect('/login?err=social');
    const tr = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET || '', grant_type: 'authorization_code', code: req.query.code, redirect_uri: PUBLIC_URL() + '/api/auth/discord/callback' }),
    });
    const tok = await tr.json();
    if (!tok.access_token) return res.redirect('/login?err=social');
    const d = await (await fetch('https://discord.com/api/users/@me', { headers: { authorization: 'Bearer ' + tok.access_token } })).json();
    if (!d.id) return res.redirect('/login?err=social');
    socialLogin(req, res, social.findOrCreate({ provider: 'discord', pid: d.id, nameHint: d.username, display: d.global_name || d.username, email: d.email ? String(d.email).toLowerCase() : '', emailVerified: !!d.verified, ip: ipOf(req) }));
  } catch (e) {
    console.error('discord:', e.message);
    res.redirect('/login?err=social');
  }
});

app.get('/api/community', (req, res) => res.json({ telegram: db.prepare("SELECT value FROM settings WHERE key = 'telegram_link'").get()?.value || '' }));
app.get('/api/news', (req, res) => res.json({ news: db.prepare('SELECT * FROM news ORDER BY ts DESC LIMIT 30').all() }));
app.use('/api/tournaments', tournaments.router());
const isOnline = (id) => { for (const ws of clients) if (ws.user && ws.user.id === id && ws.readyState === 1) return true; return false; };
app.use('/api/friends', friends.router({ isOnline }));

app.post('/api/logout', (req, res) => {
  const token = auth.parseCookies(req.headers.cookie).qc;
  if (token) auth.destroySession(token);
  setCookie(res, '', 0);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const u = me(req);
  const skins = u ? db.prepare("SELECT value FROM awards WHERE user_id = ? AND kind = 'skin'").all(u.id).map((r) => r.value) : [];
  res.json({ user: u ? { ...pub(u), skins, email: u.email, verified: !!u.email_verified, provider: u.provider } : null, online: onlineCount() });
});

app.patch('/api/me', (req, res) => {
  const u = me(req);
  if (!u) return res.status(401).json({ error: 'auth' });
  const b = req.body || {};
  const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
  const display = b.display !== undefined ? clean(b.display, 24) : u.display;
  if (!display) return res.status(400).json({ code: 'empty_name', error: 'empty name' });
  const bio = b.bio !== undefined ? clean(b.bio, 200) : u.bio;
  const country = b.country !== undefined ? (/^[A-Z]{2}$/.test(b.country) || b.country === '' ? b.country : u.country) : u.country;
  const avatar = b.avatar !== undefined && PRESETS.includes(b.avatar) ? b.avatar : u.avatar;
  db.prepare('UPDATE users SET display = ?, bio = ?, country = ?, avatar = ? WHERE id = ?').run(display, bio, country, avatar, u.id);
  res.json({ ok: true });
});

const IMG = { 'image/png': ['png', [0x89, 0x50, 0x4e, 0x47]], 'image/jpeg': ['jpg', [0xff, 0xd8, 0xff]], 'image/webp': ['webp', [0x52, 0x49, 0x46, 0x46]] };
app.post('/api/avatar', express.raw({ type: Object.keys(IMG), limit: '300kb' }), (req, res) => {
  const u = me(req);
  if (!u) return res.status(401).json({ error: 'auth' });
  const spec = IMG[req.get('content-type')];
  const buf = req.body;
  if (!spec || !Buffer.isBuffer(buf) || buf.length < 100 || !spec[1].every((b, i) => buf[i] === b)) return res.status(400).json({ code: 'bad_image', error: 'bad image' });
  for (const ext of ['png', 'jpg', 'webp']) fs.rmSync(path.join(DATA, 'avatars', u.id + '.' + ext), { force: true });
  fs.writeFileSync(path.join(DATA, 'avatars', u.id + '.' + spec[0]), buf);
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(`/avatars/${u.id}.${spec[0]}?v=${Date.now()}`, u.id);
  res.json({ ok: true });
});

// GDPR: пользователь может удалить аккаунт, партии остаются без привязки к личным данным
app.delete('/api/me', (req, res) => {
  const u = me(req);
  if (!u) return res.status(401).json({ error: 'auth' });
  for (const ext of ['png', 'jpg', 'webp']) fs.rmSync(path.join(DATA, 'avatars', u.id + '.' + ext), { force: true });
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  db.prepare(`UPDATE users SET username = ?, display = 'Удалён', bio = '', country = '', avatar = 'p1', pass = '!', last_ip = '', reg_ip = '', email = '', email_verified = 0, provider = 'password', provider_id = '', badge = '' WHERE id = ?`).run('deleted_' + u.id, u.id);
  db.prepare('DELETE FROM friends WHERE a = ? OR b = ?').run(u.id, u.id);
  db.prepare('DELETE FROM tg_tokens WHERE user_id = ?').run(u.id);
  db.prepare("UPDATE games SET white_name = 'Удалён' WHERE white_id = ?").run(u.id);
  db.prepare("UPDATE games SET black_name = 'Удалён' WHERE black_id = ?").run(u.id);
  setCookie(res, '', 0);
  res.json({ ok: true });
});

app.get('/api/user/:name', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username = ? AND is_bot = 0').get(req.params.name)
    || db.prepare('SELECT * FROM users WHERE username = ? AND is_bot = 1').get(req.params.name);
  if (!u) return res.status(404).json({ error: 'not found' });
  const recent = db.prepare(`SELECT id, white_name, black_name, white_rating, black_rating, result, reason, base, inc, rated, moves, ended
    FROM games WHERE (white_id = ? OR black_id = ?) AND result IS NOT NULL ORDER BY ended DESC LIMIT 20`).all(u.id, u.id);
  const badges = db.prepare("SELECT value, ts FROM awards WHERE user_id = ? AND kind = 'badge' ORDER BY ts DESC LIMIT 20").all(u.id);
  res.json({ user: pub(u), recent, badges });
});

app.get('/api/leaderboard', (req, res) => {
  const rows = db.prepare("SELECT * FROM users WHERE (games > 0 OR is_bot = 0) AND hidden = 0 AND banned = 0 AND username NOT LIKE 'deleted!_%' ESCAPE '!' ORDER BY rating DESC, games DESC LIMIT 50").all();
  res.json({ users: rows.map(pub) });
});

app.get('/api/game/:id', (req, res) => {
  const live = games.get(req.params.id);
  if (live) return res.json({ game: live.state() });
  const g = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  const bots = (id) => { const r = db.prepare('SELECT * FROM users WHERE id = ?').get(id) || {}; return { avatar: r.avatar, country: r.country, display: r.display, badge: badgeOf(r) }; };
  const wu = bots(g.white_id), bu = bots(g.black_id);
  res.json({ game: {
    id: g.id, base: g.base, inc: g.inc, rated: !!g.rated, status: g.result ? 'over' : 'aborted', result: g.result, reason: g.reason, pgn: g.pgn,
    white: { username: g.white_name, display: wu.display || g.white_name, rating: g.white_rating, avatar: wu.avatar, country: wu.country, badge: wu.badge },
    black: { username: g.black_name, display: bu.display || g.black_name, rating: g.black_rating, avatar: bu.avatar, country: bu.country, badge: bu.badge },
  } });
});

app.get('/api/live', (req, res) => res.json({ games: games.liveList() }));
app.get('/api/rooms', (req, res) => res.json({ rooms: rooms.list() }));

app.use('/avatars', express.static(path.join(DATA, 'avatars'), { maxAge: '1h' }));
// код и стили всегда сверяем с сервером (ETag), чтобы после обновления не оставался старый файл; картинки и звуки кешируются
app.use(express.static(PUBLIC, { maxAge: PROD ? '1d' : 0, extensions: ['html'], setHeaders: (res, f) => { if (/\.(js|css|html)$/.test(f)) res.setHeader('Cache-Control', 'no-cache'); } }));
// любые остальные пути отдаёт одностраничное приложение
app.get(/^\/(?!api\/|ws).*/, (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

// ---- WebSocket ----
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
const clients = new Set();
const realOnline = () => [...clients].filter((w) => w.readyState === 1).length;
const onlineCount = () => realOnline() + presence.botsOnlineCount();

server.on('upgrade', (req, socket, head) => {
  if (req.url.split('?')[0] !== '/ws') return socket.destroy();
  // защита от чужих сайтов: Origin должен совпадать с хостом
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.user = auth.userFromCookieHeader(req.headers.cookie);
    wss.emit('connection', ws, req);
  });
});

const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.alive = true;
  ws.tokens = 40;
  send(ws, { t: 'online', n: onlineCount() });
  ws.on('pong', () => { ws.alive = true; });
  if (ws.user) {
    db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), ws.user.id);
    const g = games.activeOf(ws.user.id);
    if (g) { g.sockets.add(ws); g.playerBack(ws.user.id); send(ws, { t: 'resume', id: g.id }); }
  }

  ws.on('message', (raw) => {
    if (--ws.tokens < 0) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    const u = ws.user;
    switch (m.t) {
      case 'seek':
        if (!u) break;
        if (m.tid) {
          const tr = tournaments.forSeek(Number(m.tid), u.id);
          if (tr) mm.seek(ws, tr.base, tr.inc, tr.id, !!tr.rated); else send(ws, { t: 'seek-error', m: 'tourn.notRunning' });
        } else if ([1, 3, 5, 10, 15, 30].includes(m.base) && [0, 1, 2, 3, 5, 10].includes(m.inc)) mm.seek(ws, m.base, m.inc);
        break;
      case 'cancel': mm.cancel(ws); break;
      case 'invite': if (u) friends.invite(ws, m, { clients, send }); break;
      case 'invite-accept': if (u) friends.answer(ws, m, true, { clients, send }); break;
      case 'invite-decline': if (u) friends.answer(ws, m, false, { clients, send }); break;
      case 'chat': {
        const g = games.get(m.id);
        const c = g && u ? g.colorOf(u.id) : null;
        if (c) g.chat(c, m.text);
        break;
      }
      case 'watch': {
        const g = games.get(m.id);
        if (!g) return send(ws, { t: 'gone', id: m.id });
        g.sockets.add(ws);
        send(ws, { t: 'state', game: g.state() });
        break;
      }
      case 'emote': {
        const g = games.get(m.id);
        const c = g && u ? g.colorOf(u.id) : null;
        if (c) g.emote(c, m.e);
        break;
      }
      case 'move': case 'resign': case 'draw': case 'draw-no': case 'abort': {
        const g = games.get(m.id);
        const c = g && u ? g.colorOf(u.id) : null;
        if (!c) return;
        if (m.t === 'move') {
          const r = g.applyMove(c, m.uci);
          if (r === 'illegal' || r === 'turn') send(ws, { t: 'state', game: g.state() });
        } else if (m.t === 'resign') g.resign(c);
        else if (m.t === 'draw') g.offerDraw(c);
        else if (m.t === 'draw-no') g.declineDraw(c);
        else g.abort();
        break;
      }
      case 'room-create': if (u) rooms.create(ws, m); break;
      case 'room-join': if (u) rooms.join(ws, m.code); else send(ws, { t: 'room-error', m: 'room.needLogin' }); break;
      case 'room-leave': rooms.leave(ws); break;
      case 'room-msg': rooms.relay(ws, m); break;
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    if (ws.user) {
      const g = games.activeOf(ws.user.id);
      if (g) {
        g.sockets.delete(ws);
        const still = [...clients].some((c) => c.user && c.user.id === ws.user.id && c.readyState === 1);
        if (!still) g.playerLeft(ws.user.id);
      }
    }
    mm.cancel(ws);
    rooms.leave(ws);
  });
});

setInterval(() => { for (const ws of wss.clients) ws.tokens = Math.min(40, ws.tokens + 20); }, 1000).unref();
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
  const n = onlineCount();
  for (const ws of wss.clients) send(ws, { t: 'online', n });
}, 20000).unref();

require('./backup').start();
require('./bracket').init({
  isOnline,
  push: (uid, obj) => { for (const ws of clients) if (ws.user && ws.user.id === uid) send(ws, obj); },
  attach: (g, ids) => { for (const ws of clients) if (ws.user && ids.includes(ws.user.id) && ws.readyState === 1) { g.sockets.add(ws); send(ws, { t: 'start', id: g.id }); } },
  notifyTg: (u, text, path) => tgbot.notifyUser(u, text, path),
});
friends.startSweeper({ push: (uid, obj) => { for (const ws of clients) if (ws.user && ws.user.id === uid) send(ws, obj); } });
server.listen(PORT, () => { console.log('QuorChess on http://localhost:' + PORT); tgbot.start(); });
