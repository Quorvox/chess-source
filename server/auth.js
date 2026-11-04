const crypto = require('crypto');
const { promisify } = require('util');
const { db } = require('./db');

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 30;

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(pw, salt, 64);
  return salt.toString('hex') + ':' + h.toString('hex');
}

async function verifyPassword(pw, stored) {
  const [s, h] = String(stored).split(':');
  if (!s || !h) return false;
  const c = await scrypt(pw, Buffer.from(s, 'hex'), 64);
  const hb = Buffer.from(h, 'hex');
  return c.length === hb.length && crypto.timingSafeEqual(c, hb);
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?, ?, ?, ?)')
    .run(sha(token), userId, now, now + SESSION_DAYS * 86400000);
  return token;
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function userFromToken(token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires > ? AND u.is_bot = 0 AND u.banned = 0`).get(sha(token), Date.now());
  return row || null;
}

const userFromCookieHeader = (h) => userFromToken(parseCookies(h).qc);
const destroySession = (token) => db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));

// простой лимит попыток по ip
const hits = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length <= max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 3600000)) hits.delete(k); }, 600000).unref();

module.exports = { hashPassword, verifyPassword, createSession, parseCookies, userFromToken, userFromCookieHeader, destroySession, rateLimit };
