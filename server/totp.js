// Одноразовые коды (TOTP, RFC 6238), как в Google Authenticator. Без внешних библиотек.
const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function b32encode(buf) {
  let bits = '', out = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

function b32decode(s) {
  let bits = '';
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('bad base32');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(key, counter) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(b).digest();
  const o = h[19] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}

const newSecret = () => b32encode(crypto.randomBytes(20));
const codeAt = (secret, step) => hotp(b32decode(secret), step);

// Возвращает номер шага, если код верный (окно ±1 шаг), иначе null. lastStep защищает от повторного использования того же кода
function verify(secret, code, lastStep = 0) {
  if (!/^\d{6}$/.test(code)) return null;
  const now = Math.floor(Date.now() / 30000);
  const key = b32decode(secret);
  for (const d of [0, -1, 1]) {
    const step = now + d;
    if (step <= lastStep) continue;
    const want = Buffer.from(hotp(key, step));
    if (crypto.timingSafeEqual(want, Buffer.from(code))) return step;
  }
  return null;
}

const otpauth = (login, secret) => `otpauth://totp/QuorChess%20Admin:${encodeURIComponent(login)}?secret=${secret}&issuer=QuorChess%20Admin&digits=6&period=30`;

module.exports = { newSecret, verify, codeAt, otpauth };
