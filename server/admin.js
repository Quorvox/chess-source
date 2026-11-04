// Админ-API. Доступ только у аккаунтов с is_admin=1; каждое действие пишется в журнал с именем админа
const fs = require('fs');
const path = require('path');
const express = require('express');
const { db, DATA, getSetting, setSetting, audit, START_RATING } = require('./db');
const auth = require('./auth');
const games = require('./games');
const mm = require('./mm');
const rooms = require('./rooms');
const tournaments = require('./tournaments');
const tgbot = require('./tgbot');
const backup = require('./backup');

const INT_KEYS = { launch_at: 0, launch_days: 3, wait_min: 2, wait_max: 20, auto_tournaments: 1 };
const PRESETS = Array.from({ length: 12 }, (_, i) => 'p' + (i + 1));
const FIRST = ['Alex', 'Max', 'Leon', 'Felix', 'Jonas', 'Paul', 'Tim', 'Ben', 'Luca', 'Nico', 'Kirill', 'Dmitry', 'Artem', 'Egor', 'Timur', 'Pavel', 'Denis', 'Vlad', 'Roman', 'Igor', 'Anna', 'Lena', 'Sofia', 'Katja', 'Mia', 'Julia', 'Hannah', 'Marta', 'Olga', 'Eva'];
const LAST = ['Weber', 'Berger', 'Koch', 'Wolf', 'Hahn', 'Lange', 'Richter', 'Neumann', 'Fischer', 'Keller', 'Ivanov', 'Petrov', 'Smirnov', 'Volkov', 'Orlov', 'Sokolov', 'Popov', 'Novak'];
const COUNTRIES = ['DE', 'RU', 'UA', 'KZ', 'BY', 'PL', 'TR', 'AT', 'CH', 'LV'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

module.exports = function adminRouter({ kick, onlineCount, getAdmin }) {
  const r = express.Router();

  r.use((req, res, next) => {
    const a = getAdmin(req);
    if (!a) return res.status(403).json({ error: 'forbidden' });
    req.admin = a;
    next();
  });

  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
  const bad = (res, error) => res.status(400).json({ error });

  r.get('/stats', (req, res) => {
    const day = Date.now() - 86400000;
    res.json({
      users: one('SELECT COUNT(*) c FROM users WHERE is_bot = 0').c,
      bots: one('SELECT COUNT(*) c FROM users WHERE is_bot = 1').c,
      banned: one('SELECT COUNT(*) c FROM users WHERE banned = 1').c,
      newToday: one('SELECT COUNT(*) c FROM users WHERE is_bot = 0 AND created > ?', day).c,
      activeToday: one('SELECT COUNT(*) c FROM users WHERE is_bot = 0 AND last_seen > ?', day).c,
      withEmail: one("SELECT COUNT(*) c FROM users WHERE is_bot = 0 AND email <> ''").c,
      viaTelegram: one("SELECT COUNT(*) c FROM users WHERE provider = 'telegram'").c,
      viaDiscord: one("SELECT COUNT(*) c FROM users WHERE provider = 'discord'").c,
      gamesTotal: one('SELECT COUNT(*) c FROM games').c,
      gamesToday: one('SELECT COUNT(*) c FROM games WHERE ended > ?', day).c,
      gamesVsBots: one('SELECT COUNT(*) c FROM games WHERE white_bot = 1 OR black_bot = 1').c,
      online: onlineCount(), activeGames: games.activeCount(), openRooms: rooms.count(), queue: mm.size(),
      rssMB: Math.round(process.memoryUsage().rss / 1048576),
      dbMB: Math.round(fs.statSync(path.join(DATA, 'quorchess.db')).size / 104857.6) / 10,
      uptimeH: Math.round(process.uptime() / 360) / 10,
    });
  });

  // ---- игроки ----
  r.get('/users', (req, res) => {
    const q = clean(req.query.q, 40);
    const bots = req.query.bots === '1' ? 1 : 0;
    const order = req.query.sort === 'rating' ? 'rating DESC' : req.query.sort === 'new' ? 'created DESC' : req.query.sort === 'games' ? 'games DESC' : bots ? 'rating DESC' : 'last_seen DESC';
    const like = `%${q}%`;
    const f = { banned: 'banned = 1', hidden: 'hidden = 1', unverified: "email <> '' AND email_verified = 0", online: `last_seen > ${Date.now() - 300000}`, today: `last_seen > ${Date.now() - 86400000}`, noemail: "email = ''" }[req.query.filter];
    const per = 50, page = Math.max(0, Math.floor(Number(req.query.page) || 0));
    const where = `is_bot = ? AND (username LIKE ? OR display LIKE ? OR email LIKE ? OR last_ip LIKE ? OR reg_ip LIKE ?) ${f ? 'AND ' + f : ''} AND username NOT LIKE 'deleted!_%' ESCAPE '!'`;
    const total = one(`SELECT COUNT(*) c FROM users WHERE ${where}`, bots, like, like, like, like, like).c;
    const rows = all(`SELECT id, username, display, country, avatar, rating, games, wins, losses, draws, is_bot, banned, ban_reason, hidden,
      email, email_verified, provider, reg_ip, last_ip, created, last_seen,
      (SELECT COUNT(*) FROM awards a WHERE a.user_id = users.id) AS awards, badge
      FROM users WHERE ${where}
      ORDER BY ${order} LIMIT ${per} OFFSET ${page * per}`, bots, like, like, like, like, like);
    res.json({ total, per, page, users: rows.map((u) => ({ ...u, rating: Math.round(u.rating) })) });
  });

  r.get('/user/:id', (req, res) => {
    const u = one('SELECT * FROM users WHERE id = ?', Number(req.params.id));
    if (!u) return res.status(404).json({ error: 'not found' });
    delete u.pass;
    const gs = all(`SELECT id, white_id, white_name, black_name, white_rating, black_rating, white_bot, black_bot, result, reason, base, inc, rated, moves, ended, tid
      FROM games WHERE (white_id = ? OR black_id = ?) AND result IS NOT NULL ORDER BY ended DESC LIMIT 40`, u.id, u.id);
    const mine = gs.map((g) => {
      const white = g.white_id === u.id;
      const score = g.result === '1/2-1/2' ? 0.5 : (g.result === '1-0') === white ? 1 : 0;
      return { ...g, white, score, myRating: white ? g.white_rating : g.black_rating, vsBot: white ? !!g.black_bot : !!g.white_bot, opp: white ? g.black_name : g.white_name, oppRating: white ? g.black_rating : g.white_rating };
    });
    res.json({
      user: { ...u, rating: Math.round(u.rating) },
      awards: all('SELECT * FROM awards WHERE user_id = ? ORDER BY ts DESC', u.id),
      games: mine,
      stats: {
        asWhite: one('SELECT COUNT(*) c FROM games WHERE white_id = ? AND result IS NOT NULL', u.id).c,
        asBlack: one('SELECT COUNT(*) c FROM games WHERE black_id = ? AND result IS NOT NULL', u.id).c,
        vsBots: one('SELECT COUNT(*) c FROM games WHERE ((white_id = ? AND black_bot = 1) OR (black_id = ? AND white_bot = 1)) AND result IS NOT NULL', u.id, u.id).c,
        rated: one('SELECT COUNT(*) c FROM games WHERE (white_id = ? OR black_id = ?) AND rated = 1 AND result IS NOT NULL', u.id, u.id).c,
        best: one('SELECT MAX(CASE WHEN white_id = ? THEN white_rating ELSE black_rating END) m FROM games WHERE (white_id = ? OR black_id = ?) AND result IS NOT NULL', u.id, u.id, u.id).m || Math.round(u.rating),
      },
      log: all('SELECT ts, admin_name, action, details FROM audit WHERE target = ? ORDER BY id DESC LIMIT 30', u.username),
    });
  });

  // своя картинка-аватар для любого аккаунта, в том числе для бота
  const IMG = { 'image/png': ['png', [0x89, 0x50, 0x4e, 0x47]], 'image/jpeg': ['jpg', [0xff, 0xd8, 0xff]], 'image/webp': ['webp', [0x52, 0x49, 0x46, 0x46]] };
  r.post('/user/:id/avatar', express.raw({ type: Object.keys(IMG), limit: '400kb' }), (req, res) => {
    const u = one('SELECT * FROM users WHERE id = ?', Number(req.params.id));
    if (!u) return res.status(404).json({ error: 'not found' });
    const spec = IMG[req.get('content-type')];
    const buf = req.body;
    if (!spec || !Buffer.isBuffer(buf) || buf.length < 100 || !spec[1].every((b, i) => buf[i] === b)) return bad(res, 'Нужна картинка PNG, JPG или WebP до 400 КБ');
    fs.mkdirSync(path.join(DATA, 'avatars'), { recursive: true });
    for (const ext of ['png', 'jpg', 'webp']) fs.rmSync(path.join(DATA, 'avatars', u.id + '.' + ext), { force: true });
    fs.writeFileSync(path.join(DATA, 'avatars', u.id + '.' + spec[0]), buf);
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(`/avatars/${u.id}.${spec[0]}?v=${Date.now()}`, u.id);
    audit(req.admin, 'avatar', u.username, 'своя картинка');
    res.json({ ok: true });
  });

  // действия над игроком: бан, топ, рейтинг (с причиной), награды, права
  r.post('/user/:id', (req, res) => {
    const u = one('SELECT * FROM users WHERE id = ?', Number(req.params.id));
    if (!u) return res.status(404).json({ error: 'not found' });
    const { action, value, reason } = req.body || {};
    const why = clean(reason, 200);
    const who = u.username;
    const need = () => { if (!why) { bad(res, 'Нужна причина — её увидят в журнале'); return true; } };

    if (action === 'ban') {
      if (need()) return;
      db.prepare('UPDATE users SET banned = 1, ban_reason = ? WHERE id = ?').run(why, u.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      kick(u.id);
      audit(req.admin, 'ban', who, why);
    } else if (action === 'unban') {
      db.prepare("UPDATE users SET banned = 0, ban_reason = '' WHERE id = ?").run(u.id);
      audit(req.admin, 'unban', who, why);
    } else if (action === 'hide' || action === 'unhide') {
      db.prepare('UPDATE users SET hidden = ? WHERE id = ?').run(action === 'hide' ? 1 : 0, u.id);
      audit(req.admin, action === 'hide' ? 'hide-from-top' : 'show-in-top', who, why);
    } else if (action === 'rating') {
      const n = Math.round(Number(value));
      if (!(n >= 100 && n <= 3500)) return bad(res, 'Рейтинг от 100 до 3500');
      if (!u.is_bot && need()) return;
      db.prepare('UPDATE users SET rating = ? WHERE id = ?').run(n, u.id);
      audit(req.admin, u.is_bot ? 'bot-rating' : 'rating', who, `${Math.round(u.rating)} → ${n}${why ? ' · ' + why : ''}`);
    } else if (action === 'reset') {
      if (need()) return;
      db.prepare('UPDATE users SET rating = ?, games = 0, wins = 0, losses = 0, draws = 0 WHERE id = ?').run(START_RATING, u.id);
      audit(req.admin, 'reset-stats', who, why);
    } else if (action === 'edit') {
      const display = clean(req.body.display ?? u.display, 24) || u.display;
      const bio = clean(req.body.bio ?? u.bio, u.is_bot ? 800 : 200);
      const phrases = u.is_bot && req.body.phrases !== undefined ? String(req.body.phrases).split('\n').map((x) => clean(x, 120)).filter(Boolean).slice(0, 40).join('\n') : u.phrases;
      const country = /^[A-Z]{2}$/.test(req.body.country || '') ? req.body.country : (req.body.country === '' ? '' : u.country);
      const avatar = PRESETS.includes(req.body.avatar) ? req.body.avatar : u.avatar;
      let name = u.username;
      if (req.body.username !== undefined && req.body.username !== u.username) {
        name = clean(req.body.username, 20);
        if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) return bad(res, 'Ник: 3–20 символов, латиница, цифры и _');
        if (!u.is_bot && need()) return;
        if (one('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE AND id <> ?', name, u.id)) return bad(res, 'Такой ник уже занят');
      }
      const num = (k, d, max) => { const v = Math.round(Number(req.body[k])); return Number.isFinite(v) && req.body[k] !== undefined && req.body[k] !== '' ? Math.max(0, Math.min(max, v)) : d; };
      const wins = num('wins', u.wins, 100000), losses = num('losses', u.losses, 100000), draws = num('draws', u.draws, 100000);
      const sum = wins + losses + draws;
      const gamesN = sum === u.wins + u.losses + u.draws ? u.games : Math.max(sum, u.is_bot ? num('games', u.games, 100000) : 0);
      db.prepare('UPDATE users SET username = ?, display = ?, bio = ?, country = ?, avatar = ?, wins = ?, losses = ?, draws = ?, games = ?, phrases = ? WHERE id = ?').run(name, display, bio, country, avatar, wins, losses, draws, gamesN, phrases, u.id);
      if (u.is_bot) {
        const pct = (v, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) && v !== '' && v !== undefined ? Math.max(0, Math.min(100, n)) : def; };
        db.prepare('UPDATE users SET draw_accept = ?, draw_offer = ?, show_bot = ?, always_on = ? WHERE id = ?').run(pct(req.body.draw_accept, u.draw_accept), pct(req.body.draw_offer, u.draw_offer), req.body.show_bot === undefined ? u.show_bot : (req.body.show_bot ? 1 : 0), req.body.always_on === undefined ? u.always_on : (req.body.always_on ? 1 : 0), u.id);
      }
      audit(req.admin, 'edit-profile', name === u.username ? who : who + ' → ' + name, `${u.display} → ${display}; W/L/D ${wins}/${losses}/${draws}${why ? ' · ' + why : ''}`);
    } else if (action === 'badge') {
      const b = ['', 'blue', 'gold'].includes(value) ? value : null;
      if (b === null) return bad(res, 'Галочка: пусто, blue или gold');
      db.prepare('UPDATE users SET badge = ? WHERE id = ?').run(b, u.id);
      audit(req.admin, 'badge', who, `${u.badge || 'авто'} → ${b || 'авто'}${why ? ' · ' + why : ''}`);
    } else if (action === 'award') {
      const kind = req.body.kind === 'skin' ? 'skin' : 'badge';
      const val = clean(req.body.award, 80);
      if (!val) return bad(res, 'Укажи награду');
      if (kind === 'skin' && !/^(board|piece):[a-z]+$/.test(val)) return bad(res, 'Скин в формате board:neon или piece:gold');
      db.prepare('INSERT INTO awards (user_id, kind, value, note, by_name, ts) VALUES (?, ?, ?, ?, ?, ?)').run(u.id, kind, val, why, req.admin.username, Date.now());
      audit(req.admin, 'award', who, `${kind}: ${val}${why ? ' · ' + why : ''}`);
    } else if (action === 'revoke') {
      const a = one('SELECT * FROM awards WHERE id = ? AND user_id = ?', Number(value), u.id);
      if (!a) return bad(res, 'Награда не найдена');
      db.prepare('DELETE FROM awards WHERE id = ?').run(a.id);
      audit(req.admin, 'revoke-award', who, `${a.kind}: ${a.value}`);
    } else if (action === 'verify-email') {
      db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(u.id);
      audit(req.admin, 'verify-email', who, u.email);
    } else if (action === 'delete' && u.is_bot) {
      if (games.busyBots.has(u.id)) return bad(res, 'Бот сейчас играет, попробуй через минуту');
      removeBots([u.id]);
      audit(req.admin, 'bot-delete', who, why);
    } else if (action === 'delete') {
      if (!u.is_bot && need()) return;
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      db.prepare("UPDATE users SET username = ?, display = 'Удалён', bio = '', country = '', pass = '!', email = '', provider_id = '', last_ip = '', reg_ip = '', banned = 1, hidden = 1 WHERE id = ?").run('deleted_' + u.id, u.id);
      kick(u.id);
      audit(req.admin, 'delete', who, why);
    } else return bad(res, 'unknown action');
    res.json({ ok: true });
  });

  // ---- боты: создаются как обычные игроки ----
  function makeBot(d) {
    const name = clean(d.username, 20);
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) throw new Error('Ник: 3–20 символов, латиница, цифры и _');
    const rating = Math.max(300, Math.min(3000, Math.round(Number(d.rating) || 1200)));
    const country = /^[A-Z]{2}$/.test(d.country || '') ? d.country : pick(COUNTRIES);
    const avatar = PRESETS.includes(d.avatar) ? d.avatar : pick(PRESETS);
    const gamesN = Math.max(0, Math.round(Number(d.games) || 40 + Math.random() * 300));
    const draws = Math.floor(gamesN * 0.08);
    const wr = Math.min(0.75, Math.max(0.3, 0.3 + (rating - 800) / 1400 * 0.4));
    const wins = Math.floor((gamesN - draws) * wr);
    const now = Date.now();
    const created = now - Math.round((Number(d.daysAgo) >= 0 ? Number(d.daysAgo) : Math.random() * 120) * 86400000);
    const pct = (v, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) && v !== '' && v !== undefined ? Math.max(0, Math.min(100, n)) : def; };
    db.prepare(`INSERT INTO users (username, pass, display, bio, country, avatar, rating, games, wins, losses, draws, is_bot, created, last_seen, draw_accept, draw_offer, show_bot, always_on)
      VALUES (?, '!', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`).run(name, clean(d.display, 24) || name, clean(d.bio, 800), country, avatar, rating, gamesN, wins, gamesN - draws - wins, draws, created, now - Math.floor(Math.random() * 6 * 3600000), pct(d.drawAccept, 20), pct(d.drawOffer, 3), d.showBot ? 1 : 0, d.alwaysOn ? 1 : 0);
    return name;
  }

  r.post('/bot', (req, res) => {
    try {
      const name = makeBot(req.body || {});
      audit(req.admin, 'bot-create', name, 'rating ' + (req.body.rating || ''));
      res.json({ ok: true });
    } catch (e) { res.status(/UNIQUE/i.test(e.message) ? 409 : 400).json({ error: /UNIQUE/i.test(e.message) ? 'Такой ник уже есть' : e.message }); }
  });

  r.post('/bots/generate', (req, res) => {
    const n = Math.max(1, Math.min(50, Number(req.body?.count) || 10));
    const lo = Number(req.body?.min) || 900, hi = Math.max(lo, Number(req.body?.max) || 2000);
    let made = 0;
    for (let i = 0; i < n * 4 && made < n; i++) {
      const f = pick(FIRST), l = pick(LAST);
      const style = Math.random();
      const username = style < 0.4 ? `${f}_${l[0]}` : style < 0.7 ? `${f}${l}` : `${f.toLowerCase()}${Math.floor(10 + Math.random() * 90)}`;
      try { makeBot({ username, display: username, rating: lo + Math.random() * (hi - lo) }); made++; } catch { /* занят, пробуем другой */ }
    }
    audit(req.admin, 'bots-generate', '', `${made} шт., рейтинг ${lo}–${hi}`);
    res.json({ ok: true, made });
  });

  // полное удаление ботов: игры остаются в истории (по именам), всё остальное чистится
  function removeBots(ids) {
    if (!ids.length) return 0;
    const mark = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM tournament_players WHERE user_id IN (${mark})`).run(...ids);
    db.prepare(`DELETE FROM awards WHERE user_id IN (${mark})`).run(...ids);
    return db.prepare(`DELETE FROM users WHERE is_bot = 1 AND id IN (${mark})`).run(...ids).changes;
  }

  r.post('/bots/bulk', (req, res) => {
    const { action, confirm } = req.body || {};
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger).slice(0, 2000) : null;
    let rows = all('SELECT id, username, rating FROM users WHERE is_bot = 1');
    if (ids) rows = rows.filter((x) => ids.includes(x.id));
    else if (action === 'delete' && confirm !== 'УДАЛИТЬ') return bad(res, 'Чтобы удалить всех ботов, введи слово УДАЛИТЬ');
    if (!rows.length) return bad(res, 'Ботов не выбрано');
    const free = rows.filter((x) => !games.busyBots.has(x.id));
    const targets = free.map((x) => x.id);
    let n = 0;
    if (action === 'delete') n = removeBots(targets);
    else if (action === 'hide' || action === 'unhide') n = targets.length ? db.prepare(`UPDATE users SET hidden = ? WHERE id IN (${targets.map(() => '?').join(',')})`).run(action === 'hide' ? 1 : 0, ...targets).changes : 0;
    else if (action === 'settings') {
      const b = req.body;
      const sets = [], vals = [];
      const pct = (k) => { if (b[k] === undefined || b[k] === '') return; sets.push(k + ' = ?'); vals.push(Math.max(0, Math.min(100, Math.round(Number(b[k]) || 0)))); };
      pct('draw_accept'); pct('draw_offer');
      for (const k of ['show_bot', 'always_on']) if (b[k] === '1' || b[k] === '0' || b[k] === 1 || b[k] === 0) { sets.push(k + ' = ?'); vals.push(Number(b[k])); }
      if (!sets.length) return bad(res, 'Ничего не выбрано');
      n = targets.length ? db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id IN (${targets.map(() => '?').join(',')})`).run(...vals, ...targets).changes : 0;
    } else if (action === 'shift') {
      const d = Math.round(Number(req.body.value) || 0);
      for (const x of free) db.prepare('UPDATE users SET rating = ? WHERE id = ?').run(Math.max(300, Math.min(3000, Math.round(x.rating + d))), x.id);
      n = free.length;
    } else return bad(res, 'unknown action');
    audit(req.admin, 'bots-bulk-' + action, '', `${n} шт.${ids ? '' : ' (все)'}${action === 'shift' ? ', ' + req.body.value : ''}${rows.length - free.length ? `, пропущено играющих: ${rows.length - free.length}` : ''}`);
    res.json({ ok: true, done: n, skipped: rows.length - free.length });
  });

  // ---- партии ----
  r.get('/games/live', (req, res) => res.json({ games: games.adminList() }));
  r.get('/games', (req, res) => {
    const q = clean(req.query.q, 30);
    const per = 40, page = Math.max(0, Math.floor(Number(req.query.page) || 0));
    const like = `%${q}%`;
    const where = `(white_name LIKE ? OR black_name LIKE ? OR id = ?) ${req.query.rated === '1' ? 'AND rated = 1' : ''}`;
    const total = one(`SELECT COUNT(*) c FROM games WHERE ${where}`, like, like, q).c;
    res.json({ total, per, page, games: all(`SELECT id, white_name, black_name, white_rating, black_rating, white_bot, black_bot, result, reason, base, inc, rated, moves, ended, tid FROM games WHERE ${where} ORDER BY ended DESC LIMIT ${per} OFFSET ${page * per}`, like, like, q) });
  });
  r.get('/games/:id', (req, res) => {
    const g = one('SELECT * FROM games WHERE id = ?', String(req.params.id).slice(0, 20));
    if (!g) return res.status(404).json({ error: 'not found' });
    res.json({ game: g });
  });
  r.post('/games/:id/abort', (req, res) => {
    if (!games.forceAbort(String(req.params.id))) return bad(res, 'Партия уже закончилась');
    audit(req.admin, 'game-abort', String(req.params.id).slice(0, 20), 'без изменения рейтинга');
    res.json({ ok: true });
  });

  // графики для обзора: за последние 14 дней
  r.get('/series', (req, res) => {
    const days = 14, day = 86400000, start = new Date().setHours(0, 0, 0, 0) - (days - 1) * day;
    const out = Array.from({ length: days }, (_, i) => ({ ts: start + i * day, users: 0, games: 0, vsBots: 0 }));
    for (const x of all('SELECT created FROM users WHERE is_bot = 0 AND created >= ?', start)) out[Math.min(days - 1, Math.floor((x.created - start) / day))].users++;
    for (const x of all('SELECT ended, white_bot, black_bot FROM games WHERE ended >= ?', start)) { const o = out[Math.min(days - 1, Math.floor((x.ended - start) / day))]; o.games++; if (x.white_bot || x.black_bot) o.vsBots++; }
    res.json({ days: out });
  });

  // ---- заявки на галочки ----
  r.get('/verify', (req, res) => {
    const st = ['new', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'new';
    res.json({ requests: all(`SELECT v.*, u.username, u.display, u.avatar, u.rating, u.games, u.badge, u.email_verified, u.provider FROM verify_requests v JOIN users u ON u.id = v.user_id WHERE v.status = ? ORDER BY v.ts DESC LIMIT 100`, st), pending: one("SELECT COUNT(*) c FROM verify_requests WHERE status = 'new'").c });
  });
  r.post('/verify/:id', async (req, res) => {
    const v = one('SELECT * FROM verify_requests WHERE id = ?', Number(req.params.id));
    if (!v || v.status !== 'new') return bad(res, 'Заявка уже рассмотрена');
    const approve = req.body?.approve === true;
    const answer = clean(req.body?.answer, 300);
    const u = one('SELECT username FROM users WHERE id = ?', v.user_id);
    db.prepare('UPDATE verify_requests SET status = ?, answer = ?, decided = ?, decided_by = ? WHERE id = ?').run(approve ? 'approved' : 'rejected', answer, Date.now(), req.admin.username, v.id);
    if (approve) db.prepare('UPDATE users SET badge = ? WHERE id = ?').run(v.kind === 'gold' ? 'gold' : 'blue', v.user_id);
    audit(req.admin, approve ? 'verify-approve' : 'verify-reject', u ? u.username : '#' + v.user_id, `${v.kind}${answer ? ' · ' + answer : ''}`);
    tgbot.notifyDecision(v, approve, answer);
    res.json({ ok: true });
  });

  // ---- резервные копии базы ----
  r.get('/backups', (req, res) => res.json({ backups: backup.list() }));
  r.post('/backups', (req, res) => {
    try { const name = backup.create(); audit(req.admin, 'backup-create', name, ''); res.json({ ok: true, name }); } catch (e) { bad(res, 'Не получилось сделать копию: ' + e.message); }
  });
  r.get('/backups/file', (req, res) => {
    const f = backup.fileOf(req.query.name);
    if (!f) return res.status(404).json({ error: 'not found' });
    audit(req.admin, 'backup-download', String(req.query.name), '');
    res.download(f, String(req.query.name));
  });

  // ---- настройки ----
  r.get('/settings', (req, res) => {
    const out = {};
    for (const [k, d] of Object.entries(INT_KEYS)) out[k] = Number(getSetting(k, d));
    out.telegram_link = getSetting('telegram_link', '');
    res.json(out);
  });

  r.post('/settings', (req, res) => {
    const changes = [];
    for (const k of Object.keys(INT_KEYS)) {
      if (req.body?.[k] === undefined) continue;
      const v = Math.max(0, Math.round(Number(req.body[k]) || 0));
      const old = getSetting(k, '');
      if (String(v) !== old) { setSetting(k, v); changes.push(`${k}: ${old || '—'} → ${v}`); }
    }
    if (req.body?.telegram_link !== undefined) {
      const link = clean(req.body.telegram_link, 120);
      if (link && !/^https:\/\/(t\.me|telegram\.me)\//.test(link)) return bad(res, 'Ссылка должна начинаться с https://t.me/');
      if (link !== getSetting('telegram_link', '')) { setSetting('telegram_link', link); changes.push('telegram_link'); }
    }
    if (changes.length) audit(req.admin, 'settings', '', changes.join('; '));
    res.json({ ok: true });
  });

  // ---- турниры ----
  r.get('/tournaments', (req, res) => {
    res.json({ tournaments: all('SELECT * FROM tournaments ORDER BY start_ts DESC LIMIT 60').map((t) => ({ ...tournaments.pub(t), bots: t.bots, cancelled: !!t.cancelled, finalized: !!t.finalized, createdBy: t.created_by })) });
  });

  r.post('/tournaments', (req, res) => {
    try {
      const b = req.body || {};
      const id = tournaments.create({ ...b, start: Number(b.start), end: Number(b.start) + Math.max(10, Number(b.minutes) || 60) * 60000 }, req.admin.username);
      audit(req.admin, 'tournament-create', '#' + id, `${clean(b.title, 60)}, ${b.base}+${b.inc}`);
      res.json({ ok: true, id });
    } catch (e) { bad(res, e.message === 'title' ? 'Нужно название' : e.message === 'time' ? 'Проверь время начала и длительность (до 7 дней)' : e.message); }
  });

  r.get('/tournaments/:id', (req, res) => {
    const t = one('SELECT * FROM tournaments WHERE id = ?', Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'not found' });
    res.json({ tournament: { ...tournaments.pub(t), bots: t.bots, cancelled: !!t.cancelled, finalized: !!t.finalized, seeded: !!t.seeded }, players: tournaments.adminPlayers(t.id), rounds: require('./bracket').detail(t.id) });
  });

  r.patch('/tournaments/:id', (req, res) => {
    try {
      const b = req.body || {};
      tournaments.update(Number(req.params.id), { ...b, start: b.start ? Number(b.start) : undefined });
      audit(req.admin, 'tournament-edit', '#' + Number(req.params.id), clean(b.title, 60));
      res.json({ ok: true });
    } catch (e) { bad(res, e.message === 'time' ? 'Проверь время начала и длительность (до 7 дней)' : e.message); }
  });

  // пара в сетке: выставить результат вручную; раунд: следующий, пережеребьёвка, старт сейчас
  r.post('/tournaments/:id/pairing', (req, res) => {
    try {
      require('./bracket').setResult(Number(req.params.id), Number(req.body?.pairingId), String(req.body?.result));
      audit(req.admin, 'tournament-player', '#' + Number(req.params.id), `пара ${req.body?.pairingId}: ${req.body?.result}`);
      res.json({ ok: true });
    } catch (e) { bad(res, e.message); }
  });
  r.post('/tournaments/:id/round', (req, res) => {
    try {
      const id = Number(req.params.id), a = req.body?.action;
      const b = require('./bracket');
      if (a === 'next') b.forceNext(id); else if (a === 'redraw') b.redraw(id);
      else if (a === 'start') { db.prepare('UPDATE tournaments SET start_ts = ? WHERE id = ? AND seeded = 0').run(Date.now() - 1000, id); } else return bad(res, 'unknown action');
      audit(req.admin, 'tournament-player', '#' + id, 'раунд: ' + a);
      res.json({ ok: true });
    } catch (e) { bad(res, e.message); }
  });

  // сетка турнира: добавить или убрать игрока, поправить очки, докинуть ботов
  r.post('/tournaments/:id/players', (req, res) => {
    const t = one('SELECT * FROM tournaments WHERE id = ?', Number(req.params.id));
    if (!t || t.finalized) return bad(res, 'Турнир уже завершён');
    const { action } = req.body || {};
    if (action === 'add') {
      const u = one('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE', clean(req.body.username, 30));
      if (!u) return bad(res, 'Игрок не найден');
      db.prepare('INSERT OR IGNORE INTO tournament_players (tid, user_id) VALUES (?, ?)').run(t.id, u.id);
      audit(req.admin, 'tournament-player', '#' + t.id, 'добавил ' + u.username);
    } else if (action === 'remove') {
      const u = one('SELECT username FROM users WHERE id = ?', Number(req.body.userId));
      db.prepare('DELETE FROM tournament_players WHERE tid = ? AND user_id = ?').run(t.id, Number(req.body.userId));
      audit(req.admin, 'tournament-player', '#' + t.id, 'убрал ' + (u ? u.username : req.body.userId));
    } else if (action === 'points') {
      const num = (v) => Math.max(0, Math.min(999, Math.round(Number(v) || 0)));
      const u = one('SELECT username FROM users WHERE id = ?', Number(req.body.userId));
      db.prepare('UPDATE tournament_players SET points = ?, games = ?, wins = ? WHERE tid = ? AND user_id = ?').run(num(req.body.points), num(req.body.games), num(req.body.wins), t.id, Number(req.body.userId));
      audit(req.admin, 'tournament-player', '#' + t.id, `очки ${u ? u.username : ''}: ${num(req.body.points)} (партий ${num(req.body.games)}, побед ${num(req.body.wins)})`);
    } else if (action === 'addbots') {
      const n = Math.max(1, Math.min(60, Number(req.body.count) || 5));
      const bots = all('SELECT id FROM users WHERE is_bot = 1 AND banned = 0 AND id NOT IN (SELECT user_id FROM tournament_players WHERE tid = ?) ORDER BY RANDOM() LIMIT ?', t.id, n);
      for (const b of bots) db.prepare('INSERT OR IGNORE INTO tournament_players (tid, user_id) VALUES (?, ?)').run(t.id, b.id);
      audit(req.admin, 'tournament-player', '#' + t.id, `добавил ботов: ${bots.length}`);
    } else return bad(res, 'unknown action');
    res.json({ ok: true });
  });

  r.post('/tournaments/:id/cancel', (req, res) => {
    const t = one('SELECT * FROM tournaments WHERE id = ?', Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'not found' });
    db.prepare('UPDATE tournaments SET cancelled = 1 WHERE id = ?').run(t.id);
    audit(req.admin, 'tournament-cancel', '#' + t.id, t.title);
    res.json({ ok: true });
  });

  // завершить сейчас: награды раздаются сразу
  r.post('/tournaments/:id/finalize', (req, res) => {
    const t = one('SELECT * FROM tournaments WHERE id = ?', Number(req.params.id));
    if (!t || t.finalized) return bad(res, 'Уже завершён');
    db.prepare('UPDATE tournaments SET end_ts = ? WHERE id = ?').run(Math.min(t.end_ts, Date.now()), t.id);
    tournaments.finalize({ ...t, end_ts: Math.min(t.end_ts, Date.now()) });
    audit(req.admin, 'tournament-finish', '#' + t.id, t.title);
    res.json({ ok: true });
  });

  // ---- новости ----
  r.get('/news', (req, res) => res.json({ news: all('SELECT * FROM news ORDER BY ts DESC LIMIT 50') }));
  r.post('/news', (req, res) => {
    const b = req.body || {};
    const tr = clean(b.title_ru, 120), te = clean(b.title_en || b.title_ru, 120);
    if (!tr) return bad(res, 'Нужен заголовок');
    db.prepare('INSERT INTO news (ts, title_ru, title_en, body_ru, body_en) VALUES (?, ?, ?, ?, ?)').run(Date.now(), tr, te, clean(b.body_ru, 1000), clean(b.body_en || b.body_ru, 1000));
    audit(req.admin, 'news-add', '', tr);
    res.json({ ok: true });
  });
  r.delete('/news/:id', (req, res) => {
    const n = one('SELECT * FROM news WHERE id = ?', Number(req.params.id));
    if (n) { db.prepare('DELETE FROM news WHERE id = ?').run(n.id); audit(req.admin, 'news-delete', '', n.title_ru); }
    res.json({ ok: true });
  });

  r.get('/audit', (req, res) => res.json({ rows: all('SELECT * FROM audit ORDER BY id DESC LIMIT 200') }));
  r.get('/rooms', (req, res) => res.json({ rooms: rooms.listAll() }));
  r.post('/rooms/:code/close', (req, res) => {
    if (rooms.closeByCode(req.params.code)) audit(req.admin, 'close-room', req.params.code, '');
    res.json({ ok: true });
  });

  return r;
};
