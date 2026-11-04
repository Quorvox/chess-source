// «Онлайн» у ботов: у кого включено 24/7, тот всегда в сети, остальные по очереди «заходят» на сайт на час-два
const { db } = require('./db');

function botOnline(u) {
  if (!u || !u.is_bot) return false;
  if (u.always_on) return true;
  const slot = Math.floor(Date.now() / 2400000); // окно 40 минут
  const h = (Math.imul(u.id, 2654435761) ^ Math.imul(slot, 40503)) >>> 0;
  return h % 100 < 38;
}

let cache = { at: 0, n: 0 };
function botsOnlineCount() {
  if (Date.now() - cache.at < 60000) return cache.n;
  const rows = db.prepare('SELECT id, is_bot, always_on FROM users WHERE is_bot = 1 AND banned = 0').all();
  cache = { at: Date.now(), n: rows.filter(botOnline).length };
  return cache.n;
}

module.exports = { botOnline, botsOnlineCount };
