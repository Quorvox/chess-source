// «Жизнь» ботов: рейтинги и статистика медленно меняются, чтобы топ не стоял на месте
const { db } = require('./db');

function drift() {
  const bots = db.prepare('SELECT id, rating FROM users WHERE is_bot = 1').all();
  const upd = db.prepare('UPDATE users SET rating = ?, games = games + ?, wins = wins + ?, losses = losses + ?, draws = draws + ?, last_seen = ? WHERE id = ?');
  for (const b of bots) {
    if (Math.random() < 0.5) continue;
    const played = 1 + Math.floor(Math.random() * 3);
    let w = 0, l = 0, d = 0, delta = 0;
    for (let i = 0; i < played; i++) {
      const x = Math.random();
      if (x < 0.46) { w++; delta += 4 + Math.random() * 10; } else if (x < 0.54) { d++; } else { l++; delta -= 4 + Math.random() * 10; }
    }
    // тянем к середине, чтобы никто не улетел в космос
    delta += (1500 - b.rating) * 0.004;
    const nr = Math.max(500, Math.min(2600, b.rating + delta));
    upd.run(nr, played, w, l, d, Date.now() - Math.floor(Math.random() * 3600000), b.id);
  }
}

setInterval(drift, 25 * 60 * 1000).unref();
module.exports = { drift };
