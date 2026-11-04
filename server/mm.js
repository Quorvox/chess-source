// Рейтинговый матчмейкинг: сначала ищем живого игрока, если долго никого нет, подставляем бота под рейтинг
const { db, getSetting } = require('./db');
const games = require('./games');

// как долго «ищем человека», прежде чем подставить бота.
// В стартовые дни после релиза ждём долго (минуты), потом быстро (секунды)
function botDelay() {
  const launch = Number(getSetting('launch_at', 0));
  const days = Number(getSetting('launch_days', 3));
  const now = Date.now();
  if (launch && now >= launch && now < launch + days * 86400000) {
    const min = Number(getSetting('wait_min', 2)), max = Math.max(min, Number(getSetting('wait_max', 20)));
    return (min + Math.random() * (max - min)) * 60000;
  }
  return 5000 + Math.random() * 9000;
}

const queue = []; // {ws, p, base, inc, since, botAfter}

const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };

function seek(ws, base, inc, tid = null, rated = true) {
  const u = ws.user;
  if (!u) return;
  if (games.isBusy(u.id)) { // уже играет: возвращаем в партию, а не молча игнорируем
    const g = games.activeOf(u.id);
    if (g) { g.sockets.add(ws); send(ws, { t: 'resume', id: g.id }); }
    return;
  }
  if (queue.some((e) => e.ws === ws)) return;
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  queue.push({ ws, p: games.playerFromRow(fresh), base, inc, since: Date.now(), tid, rated, botAfter: tid ? 5000 + Math.random() * 9000 : botDelay() });
  send(ws, { t: 'seeking', base, inc, tid });
}

function cancel(ws) {
  const i = queue.findIndex((e) => e.ws === ws);
  if (i >= 0) { queue.splice(i, 1); send(ws, { t: 'seek-cancelled' }); }
}

function start(a, b, botGame) {
  const aWhite = Math.random() < 0.5;
  const g = games.create({ white: aWhite ? a.p : b.p, black: aWhite ? b.p : a.p, base: a.base, inc: a.inc, rated: a.rated !== false, tid: a.tid || null });
  for (const e of [a, b]) {
    if (e.ws) { g.sockets.add(e.ws); send(e.ws, { t: 'start', id: g.id }); }
  }
  return g;
}

function pickBot(rating) {
  const rows = db.prepare('SELECT * FROM users WHERE is_bot = 1').all().filter((r) => !games.busyBots.has(r.id));
  if (!rows.length) return null;
  // берём одного из ботов, ближайших по рейтингу: чтобы число в партии совпадало с его профилем
  rows.sort((x, y) => Math.abs(x.rating - rating) - Math.abs(y.rating - rating));
  const pool = rows.slice(0, 6);
  const row = pool[Math.floor(Math.random() * pool.length)];
  const eff = Math.max(400, Math.min(rating + 250, Math.max(rating - 250, row.rating)));
  return games.playerFromRow(row, eff);
}

function tick() {
  const now = Date.now();
  for (let i = 0; i < queue.length; i++) {
    for (let j = i + 1; j < queue.length; j++) {
      const a = queue[i], b = queue[j];
      if (a.base !== b.base || a.inc !== b.inc || a.p.id === b.p.id || (a.tid || null) !== (b.tid || null)) continue;
      const wait = (now - Math.min(a.since, b.since)) / 1000;
      if (Math.abs(a.p.rating - b.p.rating) <= 100 + 30 * wait) {
        queue.splice(j, 1); queue.splice(i, 1);
        start(a, b);
        return tick();
      }
    }
  }
  for (let i = queue.length - 1; i >= 0; i--) {
    const e = queue[i];
    if (now - e.since < e.botAfter) continue;
    const bot = pickBot(e.p.rating);
    if (!bot) continue;
    queue.splice(i, 1);
    start(e, { ws: null, p: bot, base: e.base, inc: e.inc, tid: e.tid, rated: e.rated });
  }
}
setInterval(tick, 1000).unref();

const size = () => queue.length;

module.exports = { seek, cancel, size };
