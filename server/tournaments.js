// Турниры по времени: игроки записываются, играют рейтинговые партии, очки 2/1/0, внизу таблица.
// Боты записываются сами и «набирают» очки по таймеру. Недельные и месячные создаются автоматически.
const express = require('express');
const { db, getSetting } = require('./db');
const auth = require('./auth');

const MIN = 60000;

function status(t, now = Date.now()) {
  if (t.cancelled) return 'cancelled';
  if (t.format && t.format !== 'arena') { // по сетке: идёт, пока не доиграна, а не по часам
    if (t.finalized) return 'finished';
    return now < t.start_ts ? 'upcoming' : 'running';
  }
  if (now < t.start_ts) return 'upcoming';
  if (now < t.end_ts) return 'running';
  return 'finished';
}

const players = (id) => db.prepare('SELECT COUNT(*) c FROM tournament_players WHERE tid = ?').get(id).c;

// призы по местам: [{place, type: 'skin' | 'text', value}]; старое поле prize читаем как приз за 1 место
function prizesOf(t) {
  let list = [];
  try { list = JSON.parse(t.prizes || '[]'); } catch { /* пусто */ }
  if (!list.length && t.prize) list = [{ place: 1, type: 'skin', value: t.prize }];
  return list.filter((p) => p && p.place >= 1 && p.place <= 10 && p.value);
}
function cleanPrizes(arr) {
  if (!Array.isArray(arr)) return '[]';
  const out = [];
  for (const p of arr.slice(0, 10)) {
    const place = Math.round(Number(p.place));
    const value = String(p.value || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80);
    const type = p.type === 'text' ? 'text' : 'skin';
    if (!(place >= 1 && place <= 10) || !value) continue;
    if (type === 'skin' && !/^(board|piece):[a-z]+$/.test(value)) continue;
    out.push({ place, type, value });
  }
  return JSON.stringify(out);
}

function pub(t) {
  return { id: t.id, title: t.title, kind: t.kind, start: t.start_ts, end: t.end_ts, base: t.base, inc: t.inc, rated: !!t.rated, prize: t.prize, prizes: prizesOf(t), info: t.info || '', format: t.format || 'arena', seeded: !!t.seeded, rounds: t.rounds, curRound: t.cur_round, winPlaces: t.win_places, maxPlayers: t.max_players, graceSec: t.grace_sec, breakSec: t.break_sec, status: status(t), players: players(t.id) };
}

function standings(id) {
  return db.prepare(`SELECT u.username, u.display, u.avatar, u.country, u.badge, u.email_verified, u.provider, u.is_bot, u.show_bot, p.points, p.games, p.wins, p.seed, p.out_round
    FROM tournament_players p JOIN users u ON u.id = p.user_id JOIN tournaments tt ON tt.id = p.tid WHERE p.tid = ? AND u.banned = 0 AND u.hidden = 0
    ORDER BY CASE WHEN tt.format = 'elim' AND tt.seeded = 1 THEN (CASE WHEN p.out_round = 0 THEN 99 ELSE p.out_round END) ELSE 0 END DESC, p.points DESC, p.wins DESC, p.games ASC, p.seed ASC LIMIT 200`).all(id).map((r) => ({ ...r, badge: require('./badge').badgeOf(r), email_verified: undefined, provider: undefined, is_bot: undefined }));
}

// турнир, в котором игрок сейчас может сыграть (для поиска соперника)
function forSeek(tid, userId) {
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
  if (!t || t.format !== 'arena' || status(t) !== 'running') return null;
  if (!db.prepare('SELECT 1 FROM tournament_players WHERE tid = ? AND user_id = ?').get(tid, userId)) return null;
  return t;
}

// конец партии: начисляем очки людям (боты матчмейкинга очков не получают)
function onGameEnd(g) {
  if (!g.tid) return;
  const tr = db.prepare('SELECT format FROM tournaments WHERE id = ?').get(g.tid);
  if (tr && tr.format !== 'arena') return require('./bracket').onGameEnd(g);
  if (!g.result) return;
  const sc = g.result === '1-0' ? [2, 0] : g.result === '0-1' ? [0, 2] : [1, 1];
  [g.w, g.b].forEach((p, i) => {
    if (p.isBot) return;
    db.prepare('UPDATE tournament_players SET points = points + ?, games = games + 1, wins = wins + ? WHERE tid = ? AND user_id = ?').run(sc[i], sc[i] === 2 ? 1 : 0, g.tid, p.id);
  });
}

function award(userId, kind, value, note, by) {
  db.prepare('INSERT INTO awards (user_id, kind, value, note, by_name, ts) VALUES (?, ?, ?, ?, ?, ?)').run(userId, kind, value, note, by, Date.now());
}

function finalize(t) {
  const prizes = prizesOf(t);
  const n = Math.max(3, t.win_places || 3, ...prizes.map((p) => p.place));
  const top = db.prepare(`SELECT p.user_id, u.is_bot FROM tournament_players p JOIN users u ON u.id = p.user_id WHERE p.tid = ? AND u.banned = 0
    ORDER BY p.points DESC, p.wins DESC, p.games ASC LIMIT ?`).all(t.id, n);
  top.forEach((r, i) => {
    if (r.is_bot) return;
    if (i < 3) award(r.user_id, 'badge', `${i + 1}|${t.title}`, 'tournament', 'система');
    for (const p of prizes.filter((x) => x.place === i + 1)) {
      if (p.type === 'skin') award(r.user_id, 'skin', p.value, t.title, 'система');
      else award(r.user_id, 'badge', p.value, t.title, 'система');
    }
  });
  db.prepare('UPDATE tournaments SET finalized = 1 WHERE id = ?').run(t.id);
}

function addBots(t) {
  const bots = db.prepare('SELECT id FROM users WHERE is_bot = 1 AND banned = 0 ORDER BY RANDOM() LIMIT ?').all(t.bots);
  const ins = db.prepare('INSERT OR IGNORE INTO tournament_players (tid, user_id) VALUES (?, ?)');
  for (const b of bots) ins.run(t.id, b.id);
  db.prepare('UPDATE tournaments SET bots_added = 1 WHERE id = ?').run(t.id);
}

function simulate(t) {
  const rows = db.prepare('SELECT p.user_id, p.games FROM tournament_players p JOIN users u ON u.id = p.user_id WHERE p.tid = ? AND u.is_bot = 1').all(t.id);
  const maxGames = Math.max(3, Math.floor((t.end_ts - t.start_ts) / MIN / (t.base + 2)));
  const upd = db.prepare('UPDATE tournament_players SET points = points + ?, games = games + 1, wins = wins + ? WHERE tid = ? AND user_id = ?');
  for (const r of rows) {
    if (r.games >= maxGames || Math.random() > 0.35) continue;
    const x = Math.random();
    const pts = x < 0.45 ? 2 : x < 0.55 ? 1 : 0;
    upd.run(pts, pts === 2 ? 1 : 0, t.id, r.user_id);
  }
}

function create(d, by) {
  const title = String(d.title || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);
  if (!title) throw new Error('title');
  const start = Number(d.start), end = Number(d.end);
  if (!(start > 0) || !(end > start) || end - start > 7 * 86400000) throw new Error('time');
  const base = [1, 3, 5, 10, 15, 30].includes(Number(d.base)) ? Number(d.base) : 5;
  const inc = [0, 1, 2, 3, 5, 10].includes(Number(d.inc)) ? Number(d.inc) : 0;
  const prize = /^(board|piece):[a-z]+$/.test(d.prize || '') ? d.prize : '';
  const prizes = cleanPrizes(d.prizes);
  const info = String(d.info || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 800);
  const kind = ['weekly', 'monthly', 'special'].includes(d.kind) ? d.kind : 'special';
  const fmt = ['arena', 'swiss', 'elim'].includes(d.format) ? d.format : 'arena';
  const r = db.prepare(`INSERT INTO tournaments (title, kind, start_ts, end_ts, base, inc, rated, bots, prize, prizes, info, created_by, created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(title, kind, start, end, base, inc, d.rated === false || d.rated === 0 ? 0 : 1, Math.max(0, Math.min(60, Number(d.bots) || 0)), prize, prizes, info, by, Date.now());
  const id = Number(r.lastInsertRowid);
  db.prepare('UPDATE tournaments SET format = ?, rounds = ?, win_places = ?, max_players = ?, grace_sec = ?, break_sec = ? WHERE id = ?').run(fmt, clampN(d.rounds, 0, 12, 0), clampN(d.winPlaces, 1, 10, 3), clampN(d.maxPlayers, 0, 256, 0), clampN(d.graceSec, 30, 900, 120), clampN(d.breakSec, 5, 600, 30), id);
  return id;
}

const clampN = (v, lo, hi, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) && v !== '' && v !== undefined && v !== null ? Math.max(lo, Math.min(hi, n)) : def; };

// каждую неделю и каждый месяц должен быть ближайший турнир
function ensureAuto() {
  if (getSetting('auto_tournaments', '1') !== '1') return;
  const now = new Date();
  const need = (kind) => !db.prepare('SELECT 1 FROM tournaments WHERE kind = ? AND cancelled = 0 AND start_ts > ?').get(kind, Date.now());
  if (need('weekly')) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0));
    d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7 || 7));
    create({ title: 'Недельный блиц / Weekly blitz', kind: 'weekly', start: d.getTime(), end: d.getTime() + 120 * MIN, base: 3, inc: 0, bots: 14 }, 'система');
  }
  if (need('monthly')) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 16, 0, 0));
    create({ title: 'Месячный рапид / Monthly rapid', kind: 'monthly', start: d.getTime(), end: d.getTime() + 180 * MIN, base: 10, inc: 0, bots: 30 }, 'система');
  }
}

function tick() {
  ensureAuto();
  const now = Date.now();
  for (const t of db.prepare('SELECT * FROM tournaments WHERE cancelled = 0 AND finalized = 0').all()) {
    if (t.format !== 'arena') continue; // турниры по сетке ведёт bracket.js
    if (now >= t.start_ts && now < t.end_ts && t.bots > 0 && !t.bots_added) addBots(t);
    if (now >= t.start_ts && now < t.end_ts) simulate(t);
    if (now >= t.end_ts) finalize(t);
  }
}
setTimeout(tick, 3000).unref();
setInterval(tick, MIN).unref();

function router() {
  const r = express.Router();
  const me = (req) => auth.userFromCookieHeader(req.headers.cookie);

  r.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM tournaments WHERE cancelled = 0 ORDER BY start_ts DESC LIMIT 40').all().map(pub);
    const live = rows.filter((t) => t.status === 'running');
    const next = rows.filter((t) => t.status === 'upcoming').sort((a, b) => a.start - b.start);
    const done = rows.filter((t) => t.status === 'finished').slice(0, 10);
    res.json({ running: live, upcoming: next, finished: done });
  });

  r.get('/:id', (req, res) => {
    const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(Number(req.params.id));
    if (!t || t.cancelled) return res.status(404).json({ error: 'not found' });
    const u = me(req);
    const joined = u ? !!db.prepare('SELECT 1 FROM tournament_players WHERE tid = ? AND user_id = ?').get(t.id, u.id) : false;
    const bracket = require('./bracket');
    const rounds = bracket.isBracket(t) && t.seeded ? bracket.detail(t.id) : [];
    const myPair = u && rounds.length ? (rounds[rounds.length - 1].pairs.find((p) => p.status !== 'redo' && ((p.white && p.white.username === u.username) || (p.black && p.black.username === u.username)))) || null : null;
    res.json({ tournament: pub(t), standings: standings(t.id), joined, rounds, myPair });
  });

  r.post('/:id/join', (req, res) => {
    const u = me(req);
    if (!u) return res.status(401).json({ code: 'auth', error: 'auth' });
    const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(Number(req.params.id));
    const open = t && (t.format === 'arena' ? ['upcoming', 'running'].includes(status(t)) : (status(t) === 'upcoming' && !t.seeded));
    if (!open) return res.status(400).json({ code: 'tourn_closed', error: 'closed' });
    if (t.max_players > 0 && players(t.id) >= t.max_players && !db.prepare('SELECT 1 FROM tournament_players WHERE tid = ? AND user_id = ?').get(t.id, u.id)) return res.status(400).json({ code: 'tourn_full', error: 'full' });
    db.prepare('INSERT OR IGNORE INTO tournament_players (tid, user_id) VALUES (?, ?)').run(t.id, u.id);
    res.json({ ok: true });
  });
  return r;
}

// правка уже созданного турнира (пока он не закончился)
function update(id, d) {
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
  if (!t || t.finalized || t.cancelled) throw new Error('Турнир уже нельзя менять');
  const title = String(d.title ?? t.title).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) || t.title;
  const start = d.start ? Number(d.start) : t.start_ts;
  const end = d.minutes ? start + Math.max(10, Number(d.minutes)) * MIN : (d.start ? start + (t.end_ts - t.start_ts) : t.end_ts);
  if (!(end > start) || end - start > 7 * 86400000) throw new Error('time');
  const base = [1, 3, 5, 10, 15, 30].includes(Number(d.base)) ? Number(d.base) : t.base;
  const inc = [0, 1, 2, 3, 5, 10].includes(Number(d.inc)) ? Number(d.inc) : t.inc;
  const prizes = d.prizes !== undefined ? cleanPrizes(d.prizes) : t.prizes;
  const info = d.info !== undefined ? String(d.info).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 800) : t.info;
  const kind = ['weekly', 'monthly', 'special'].includes(d.kind) ? d.kind : t.kind;
  const bots = d.bots !== undefined ? Math.max(0, Math.min(60, Number(d.bots) || 0)) : t.bots;
  db.prepare('UPDATE tournaments SET title = ?, kind = ?, start_ts = ?, end_ts = ?, base = ?, inc = ?, rated = ?, bots = ?, prizes = ?, info = ? WHERE id = ?')
    .run(title, kind, start, end, base, inc, d.rated === undefined ? t.rated : (d.rated ? 1 : 0), bots, prizes, info, id);
  if (!t.seeded) { // формат и сетку менять можно только до жеребьёвки
    const fmt = ['arena', 'swiss', 'elim'].includes(d.format) ? d.format : t.format;
    db.prepare('UPDATE tournaments SET format = ?, rounds = ?, max_players = ? WHERE id = ?').run(fmt, clampN(d.rounds, 0, 12, t.rounds), clampN(d.maxPlayers, 0, 256, t.max_players), id);
  }
  db.prepare('UPDATE tournaments SET win_places = ?, grace_sec = ?, break_sec = ? WHERE id = ?').run(clampN(d.winPlaces, 1, 10, t.win_places), clampN(d.graceSec, 30, 900, t.grace_sec), clampN(d.breakSec, 5, 600, t.break_sec), id);
}

// участники для админки: все, с очками, можно править
function adminPlayers(id) {
  return db.prepare(`SELECT p.user_id id, u.username, u.display, u.is_bot, p.points, p.games, p.wins FROM tournament_players p JOIN users u ON u.id = p.user_id
    WHERE p.tid = ? ORDER BY p.points DESC, p.wins DESC, p.games ASC`).all(id);
}

module.exports = { router, forSeek, onGameEnd, create, update, adminPlayers, finalize, status, pub, standings };
