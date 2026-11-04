// Вход через Telegram и Discord. Каждый способ включается переменными окружения, без них кнопок на сайте нет.
const crypto = require('crypto');
const { db, START_RATING } = require('./db');

const AV = Array.from({ length: 12 }, (_, i) => 'p' + (i + 1));

// проверка подписи данных от Telegram Login Widget
function verifyTelegram(query, botToken) {
  const { hash, ...rest } = query;
  if (!hash || typeof hash !== 'string') return false;
  const data = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join('\n');
  const secret = crypto.createHash('sha256').update(botToken).digest();
  const h = crypto.createHmac('sha256', secret).update(data).digest('hex');
  if (h.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash))) return false;
  return Date.now() / 1000 - Number(rest.auth_date) < 86400;
}

function freeUsername(hint, fallback) {
  let name = String(hint || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 16);
  if (name.length < 3) name = fallback;
  for (let i = 0; i < 25; i++) {
    const cand = i === 0 ? name : name + Math.floor(1000 + Math.random() * 9000);
    if (!db.prepare('SELECT 1 FROM users WHERE username = ?').get(cand)) return cand;
  }
  return fallback + (Date.now() % 100000);
}

// найти аккаунт по способу входа или создать новый
function findOrCreate({ provider, pid, nameHint, display, email, emailVerified, ip }) {
  let u = db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?').get(provider, pid);
  if (u) return u;
  // подключаем к существующему аккаунту только по подтверждённой почте, иначе можно угнать чужой ник
  if (email && emailVerified) {
    u = db.prepare("SELECT * FROM users WHERE email = ? AND is_bot = 0 AND email_verified = 1").get(email);
    if (u) return u;
  }
  const now = Date.now();
  const username = freeUsername(nameHint, provider + '_' + String(pid).slice(-4));
  const mail = email && emailVerified && !db.prepare('SELECT 1 FROM users WHERE email = ?').get(email) ? email : '';
  const r = db.prepare(`INSERT INTO users (username, pass, display, avatar, created, last_seen, last_ip, reg_ip, email, email_verified, provider, provider_id, rating)
    VALUES (?, '!', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(username, String(display || username).slice(0, 24), AV[Math.floor(Math.random() * 12)], now, now, ip, ip, mail, mail ? 1 : 0, provider, String(pid), START_RATING);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid));
}

module.exports = { verifyTelegram, findOrCreate };
