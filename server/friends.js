// Друзья: заявки, список с онлайном и приглашения сыграть (партия без рейтинга)
const express = require('express');
const { db } = require('./db');
const auth = require('./auth');
const games = require('./games');
const { badgeOf } = require('./badge');

const row = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const byName = (n) => db.prepare('SELECT * FROM users WHERE username = ? AND banned = 0').get(String(n || ''));
const card = (u, online) => ({ username: u.username, display: u.display, avatar: u.avatar, country: u.country, badge: badgeOf(u), rating: Math.round(u.rating), online: !!online, lastSeen: u.last_seen });

function relation(a, b) {
  const r = db.prepare('SELECT * FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').get(a, b, b, a);
  if (!r) return 'none';
  if (r.status === 'ok') return 'friends';
  return r.a === a ? 'out' : 'in';
}
const areFriends = (a, b) => relation(a, b) === 'friends';

function router({ isOnline }) {
  const r = express.Router();
  r.use((req, res, next) => {
    req.u = auth.userFromCookieHeader(req.headers.cookie);
    if (!req.u) return res.status(401).json({ error: 'auth' });
    next();
  });

  r.get('/', (req, res) => {
    const id = req.u.id;
    const rows = db.prepare('SELECT * FROM friends WHERE a = ? OR b = ? ORDER BY ts DESC').all(id, id);
    const out = { friends: [], incoming: [], outgoing: [] };
    for (const f of rows) {
      const other = row(f.a === id ? f.b : f.a);
      if (!other || other.banned) continue;
      const c = card(other, isOnline(other.id));
      if (f.status === 'ok') out.friends.push(c);
      else (f.a === id ? out.outgoing : out.incoming).push(c);
    }
    out.friends.sort((x, y) => Number(y.online) - Number(x.online) || y.lastSeen - x.lastSeen);
    res.json(out);
  });

  r.get('/status/:name', (req, res) => {
    const o = byName(req.params.name);
    res.json({ status: o ? (o.id === req.u.id ? 'self' : (o.is_bot && o.show_bot ? 'bot' : relation(req.u.id, o.id))) : 'none' });
  });

  // добавить, а если этот человек уже звал тебя, принять
  r.post('/:name', (req, res) => {
    const o = byName(req.params.name);
    if (!o || o.id === req.u.id) return res.status(400).json({ error: 'Нельзя добавить этого игрока' });
    if (o.is_bot && o.show_bot) return res.status(400).json({ error: 'Ботов нельзя добавлять в друзья' }); // у бота включена плашка «бот»
    if (!auth.rateLimit('friend:' + req.u.id, 30, 3600000)) return res.status(429).json({ error: 'Слишком часто' });
    const rel = relation(req.u.id, o.id);
    if (rel === 'in') db.prepare("UPDATE friends SET status = 'ok', ts = ? WHERE a = ? AND b = ?").run(Date.now(), o.id, req.u.id);
    else if (rel === 'none') { db.prepare("INSERT INTO friends (a, b, status, ts) VALUES (?, ?, 'pending', ?)").run(req.u.id, o.id, Date.now()); require('./tgbot').notifyFriend(o, req.u); }
    res.json({ status: relation(req.u.id, o.id) });
  });

  // удалить из друзей, отклонить или отменить заявку
  r.delete('/:name', (req, res) => {
    const o = byName(req.params.name) || db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.params.name));
    if (o) db.prepare('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').run(req.u.id, o.id, o.id, req.u.id);
    res.json({ status: 'none' });
  });
  return r;
}

// заявки к «живым» ботам (плашка «бот» выключена) бот отклоняет сам через 30-130 секунд
function startSweeper({ push }) {
  setInterval(() => {
    const now = Date.now();
    const rows = db.prepare("SELECT f.a, f.b, f.ts, u.display FROM friends f JOIN users u ON u.id = f.b WHERE f.status = 'pending' AND u.is_bot = 1").all();
    for (const r of rows) {
      if (now - r.ts < 30000 + ((r.a * 7 + r.b) % 100) * 1000) continue;
      db.prepare("DELETE FROM friends WHERE a = ? AND b = ? AND status = 'pending'").run(r.a, r.b);
      push(r.a, { t: 'friend-declined', name: r.display });
    }
  }, 15000).unref();
}

// приглашения сыграть: живут минуту
const invites = new Map(); // "from>to" -> {from, to, base, inc, ts}
const TC_OK = [[1, 0], [3, 0], [3, 2], [5, 0], [10, 0], [15, 10]];

function invite(ws, m, { clients, send }) {
  const u = ws.user;
  const to = byName(m.to);
  const base = Number(m.base), inc = Number(m.inc);
  const err = (code) => send(ws, { t: 'invite-error', m: code });
  if (!u || !to || to.id === u.id || !TC_OK.some(([b, i]) => b === base && i === inc)) return err('invite.bad');
  if (!areFriends(u.id, to.id)) return err('invite.notFriend');
  if (games.isBusy(u.id)) return err('invite.youBusy');
  if (games.isBusy(to.id)) return err('invite.busy');
  const targets = [...clients].filter((c) => c.user && c.user.id === to.id && c.readyState === 1);
  if (!targets.length) return err('invite.offline');
  const now = Date.now();
  for (const [k, v] of invites) if (now - v.ts > 60000) invites.delete(k);
  invites.set(u.id + '>' + to.id, { from: u.id, to: to.id, base, inc, ts: now });
  const me = row(u.id);
  for (const c of targets) send(c, { t: 'invite', from: card(me, true), base, inc });
  send(ws, { t: 'invite-sent', to: to.username });
}

function answer(ws, m, accept, { clients, send }) {
  const u = ws.user;
  const from = byName(m.from);
  if (!u || !from) return;
  const key = from.id + '>' + u.id;
  const inv = invites.get(key);
  invites.delete(key);
  if (!inv || Date.now() - inv.ts > 60000) return send(ws, { t: 'invite-error', m: 'invite.expired' });
  const theirs = [...clients].filter((c) => c.user && c.user.id === from.id && c.readyState === 1);
  if (!accept) { for (const c of theirs) send(c, { t: 'invite-declined', by: u.username }); return; }
  if (games.isBusy(u.id) || games.isBusy(from.id)) return send(ws, { t: 'invite-error', m: 'invite.busy' });
  const aWhite = Math.random() < 0.5;
  const pa = games.playerFromRow(row(from.id)), pb = games.playerFromRow(row(u.id));
  const g = games.create({ white: aWhite ? pa : pb, black: aWhite ? pb : pa, base: inv.base, inc: inv.inc, rated: false });
  for (const c of [...theirs, ...[...clients].filter((x) => x.user && x.user.id === u.id && x.readyState === 1)]) { g.sockets.add(c); send(c, { t: 'start', id: g.id }); }
}

module.exports = { router, invite, answer, areFriends, startSweeper };
