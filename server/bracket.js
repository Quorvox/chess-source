// Турниры по сетке: швейцарская система и игра на выбывание.
// В момент старта игроки (и боты) получают случайные номера, на каждый раунд строятся пары.
// Партии между живыми игроками создаются сами, когда оба в сети. Бот против бота считается по таймеру.
const { db } = require('./db');
const games = require('./games');

const MIN = 60000;
let ctx = { isOnline: () => false, push: () => {}, attach: () => {}, notifyTg: () => {} };

const T = (id) => db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
const user = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const isBracket = (t) => t && (t.format === 'swiss' || t.format === 'elim');
const members = (tid) => db.prepare(`SELECT p.*, u.rating, u.is_bot, u.username, u.display, u.provider, u.provider_id FROM tournament_players p JOIN users u ON u.id = p.user_id WHERE p.tid = ? AND u.banned = 0`).all(tid);
const pairs = (tid, round) => db.prepare('SELECT * FROM tournament_games WHERE tid = ? AND round = ? ORDER BY board, id').all(tid, round);
const title = (t, lang) => String(t.title).split(' / ')[lang === 'en' ? 1 : 0] || t.title;

// ---- уведомления: окно на сайте и сообщение в Telegram (у тех, кто вошёл через бота) ----
function notify(uid, kind, t, extra = {}) {
  const u = user(uid);
  if (!u || u.is_bot) return;
  ctx.push(uid, { t: 'tourn-note', kind, tid: t.id, title: t.title, ...extra });
  const ru = { start: `Турнир «${title(t, 'ru')}» начался. Жеребьёвка проведена.`, round: extra.opp ? `Раунд ${extra.round} из ${extra.rounds}: твой соперник ${extra.opp}. Партия начнётся сама, когда вы оба на сайте.` : `Раунд ${extra.round}: тебе пауза, очки засчитаны.`, finish: `Турнир «${title(t, 'ru')}» завершён. Твоё место: ${extra.place}.` }[kind];
  const en = { start: `Tournament “${title(t, 'en')}” has started. The draw is done.`, round: extra.opp ? `Round ${extra.round} of ${extra.rounds}: your opponent is ${extra.opp}. The game starts automatically once you are both online.` : `Round ${extra.round}: you have a bye, points are counted.`, finish: `Tournament “${title(t, 'en')}” is over. Your place: ${extra.place}.` }[kind];
  ctx.notifyTg(u, ru + '\n' + en, '/tournaments/' + t.id);
}

// ---- старт: жеребьёвка ----
function start(t) {
  if (!t.bots_added && t.bots > 0) {
    const bots = db.prepare('SELECT id FROM users WHERE is_bot = 1 AND banned = 0 ORDER BY RANDOM() LIMIT ?').all(t.bots);
    const ins = db.prepare('INSERT OR IGNORE INTO tournament_players (tid, user_id) VALUES (?, ?)');
    for (const b of bots) ins.run(t.id, b.id);
    db.prepare('UPDATE tournaments SET bots_added = 1 WHERE id = ?').run(t.id);
  }
  const list = members(t.id);
  if (list.length < 2) { db.prepare('UPDATE tournaments SET cancelled = 1 WHERE id = ?').run(t.id); return; }
  shuffle(list).forEach((p, i) => db.prepare('UPDATE tournament_players SET seed = ?, points = 0, games = 0, wins = 0, out_round = 0, byes = 0 WHERE tid = ? AND user_id = ?').run(i + 1, t.id, p.user_id));
  const n = list.length;
  let rounds = t.format === 'elim' ? Math.ceil(Math.log2(n)) : (t.rounds > 0 ? t.rounds : Math.min(9, Math.max(3, Math.ceil(Math.log2(n)))));
  if (t.format === 'swiss') rounds = Math.min(rounds, Math.max(1, n - 1));
  db.prepare('UPDATE tournaments SET seeded = 1, rounds = ?, cur_round = 0 WHERE id = ?').run(rounds, t.id);
  for (const p of list) notify(p.user_id, 'start', t);
  pairRound(T(t.id), 1);
}

// ---- пары на раунд ----
function insertPair(t, round, board, w, b, bye = false) {
  const due = Date.now() + (20 + Math.random() * 110) * 1000;
  const r = db.prepare('INSERT INTO tournament_games (tid, round, board, white_id, black_id, status, result, due, attempt) VALUES (?,?,?,?,?,?,?,?,1)').run(t.id, round, board, w, b || 0, bye ? 'done' : 'wait', bye ? '1-0' : '', due);
  return Number(r.lastInsertRowid);
}

function pairRound(t, round) {
  const all = members(t.id);
  let pool;
  const pairsOut = [];
  let byes = [];
  if (t.format === 'swiss') {
    pool = all.slice().sort((a, b) => b.points - a.points || a.seed - b.seed);
    const met = new Set(db.prepare('SELECT white_id w, black_id b FROM tournament_games WHERE tid = ?').all(t.id).flatMap((r) => [r.w + '-' + r.b, r.b + '-' + r.w]));
    if (pool.length % 2) {
      let k = pool.length - 1;
      while (k > 0 && pool[k].byes > 0) k--;
      byes = pool.splice(k, 1);
    }
    const used = new Set();
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      let j = -1;
      for (let x = i + 1; x < pool.length; x++) if (!used.has(x) && !met.has(pool[i].user_id + '-' + pool[x].user_id)) { j = x; break; }
      if (j < 0) for (let x = i + 1; x < pool.length; x++) if (!used.has(x)) { j = x; break; }
      if (j < 0) continue;
      used.add(i); used.add(j);
      pairsOut.push([pool[i], pool[j]]);
    }
  }
  if (t.format === 'elim') {
    let alive;
    if (round === 1) {
      alive = all.slice().sort((a, b) => a.seed - b.seed);
      const size = 2 ** Math.ceil(Math.log2(alive.length));
      byes = alive.splice(0, size - alive.length); // бай-места получают первые по жребию, остальные играют
      pool = alive;
    } else {
      const prev = pairs(t.id, round - 1);
      const winners = prev.filter((r) => r.status === 'done' && (r.result === '1-0' || r.result === '0-1')).map((r) => (r.result === '1-0' ? r.white_id : r.black_id));
      pool = winners.map((id) => all.find((p) => p.user_id === id)).filter(Boolean);
      if (pool.length % 2) byes = pool.splice(pool.length - 1, 1);
    }
    for (let i = 0; i + 1 < pool.length; i += 2) pairsOut.push([pool[i], pool[i + 1]]);
  }
  let board = 1;
  for (const p of byes) {
    insertPair(t, round, board++, p.user_id, 0, true);
    db.prepare('UPDATE tournament_players SET points = points + 2, wins = wins + 1, byes = byes + 1 WHERE tid = ? AND user_id = ?').run(t.id, p.user_id);
  }
  for (const [a, b] of pairsOut) {
    const flip = Math.random() < 0.5;
    insertPair(t, round, board++, (flip ? b : a).user_id, (flip ? a : b).user_id);
  }
  db.prepare('UPDATE tournaments SET cur_round = ?, round_start = ?, round_done = 0 WHERE id = ?').run(round, Date.now(), t.id);
  const tt = T(t.id);
  for (const p of byes) notify(p.user_id, 'round', tt, { round, rounds: tt.rounds, opp: null });
  for (const [a, b] of pairsOut) { notify(a.user_id, 'round', tt, { round, rounds: tt.rounds, opp: b.display }); notify(b.user_id, 'round', tt, { round, rounds: tt.rounds, opp: a.display }); }
  checkRoundDone(tt);
}

// ---- результаты ----
function scoreOf(t, pr, result) {
  const upd = (uid, pts, win) => db.prepare('UPDATE tournament_players SET points = points + ?, wins = wins + ?, games = games + 1 WHERE tid = ? AND user_id = ?').run(pts, win, t.id, uid);
  const w = pr.white_id, b = pr.black_id;
  if (t.format === 'swiss') {
    if (result === '1-0') { upd(w, 2, 1); upd(b, 0, 0); }
    else if (result === '0-1') { upd(b, 2, 1); upd(w, 0, 0); }
    else if (result === '1/2-1/2') { upd(w, 1, 0); upd(b, 1, 0); }
  } else {
    const win = result === '1-0' ? w : b, lose = result === '1-0' ? b : w;
    upd(win, 2, 1); upd(lose, 0, 0);
    db.prepare('UPDATE tournament_players SET out_round = ? WHERE tid = ? AND user_id = ?').run(pr.round, t.id, lose);
  }
}

// закрыть пару с результатом '1-0' | '0-1' | '1/2-1/2' | 'void'
function settle(t, pr, result) {
  if (!db.prepare('SELECT 1 FROM tournament_games WHERE id = ? AND status <> ?').get(pr.id, 'done')) return;
  if (t.format === 'elim' && (result === '1/2-1/2' || result === 'void')) {
    db.prepare("UPDATE tournament_games SET status = 'done', result = ? WHERE id = ?").run(result === 'void' ? 'void' : '1/2-1/2', pr.id);
    if (pr.attempt < 3) { // ничья: переигровка с обменом цветов, после третьей решает жребий по сеялке
      const id = insertPair(t, pr.round, pr.board, pr.black_id, pr.white_id);
      db.prepare('UPDATE tournament_games SET attempt = ? WHERE id = ?').run(pr.attempt + 1, id);
      db.prepare("UPDATE tournament_games SET status = 'redo' WHERE id = ?").run(pr.id);
    } else {
      const sw = db.prepare('SELECT seed FROM tournament_players WHERE tid = ? AND user_id = ?').get(t.id, pr.white_id).seed;
      const sb = db.prepare('SELECT seed FROM tournament_players WHERE tid = ? AND user_id = ?').get(t.id, pr.black_id).seed;
      const res = sw <= sb ? '1-0' : '0-1';
      db.prepare("UPDATE tournament_games SET status = 'done', result = ? WHERE id = ?").run(res, pr.id);
      scoreOf(t, pr, res);
    }
  } else {
    db.prepare("UPDATE tournament_games SET status = 'done', result = ? WHERE id = ?").run(result, pr.id);
    if (result !== 'void') scoreOf(t, pr, result);
  }
  checkRoundDone(T(t.id));
}

function checkRoundDone(t) {
  if (!t || !t.cur_round || t.round_done) return;
  const open = db.prepare("SELECT COUNT(*) c FROM tournament_games WHERE tid = ? AND round = ? AND status NOT IN ('done', 'redo')").get(t.id, t.cur_round).c;
  if (!open) db.prepare('UPDATE tournaments SET round_done = ? WHERE id = ?').run(Date.now(), t.id);
}

// из tournaments.onGameEnd, когда закончилась партия турнира по сетке
function onGameEnd(g) {
  const pr = db.prepare("SELECT * FROM tournament_games WHERE game_id = ? AND status = 'play'").get(g.id);
  if (!pr) return;
  settle(T(pr.tid), pr, g.result || 'void');
}

// ---- ход турнира раз в несколько секунд ----
function stepPair(t, pr) {
  const w = user(pr.white_id), b = user(pr.black_id);
  if (!w || !b) { settle(t, pr, 'void'); return; }
  const now = Date.now();
  const humans = [w, b].filter((x) => !x.is_bot);
  if (!humans.length) {
    if (now >= pr.due) {
      const pw = 1 / (1 + Math.pow(10, (b.rating - w.rating) / 400));
      const x = Math.random();
      settle(t, pr, x < 0.12 ? '1/2-1/2' : x < 0.12 + 0.88 * pw ? '1-0' : '0-1');
    }
    return;
  }
  const present = humans.filter((h) => ctx.isOnline(h.id) && !games.isBusy(h.id));
  const botBusy = [w, b].some((x) => x.is_bot && games.busyBots.has(x.id));
  if (present.length === humans.length && !botBusy) {
    const g = games.create({ white: games.playerFromRow(w), black: games.playerFromRow(b), base: t.base, inc: t.inc, rated: !!t.rated, tid: t.id });
    db.prepare("UPDATE tournament_games SET status = 'play', game_id = ? WHERE id = ?").run(g.id, pr.id);
    ctx.attach(g, humans.map((h) => h.id));
    return;
  }
  if (now - t.round_start > (t.grace_sec || 120) * 1000) {
    const absent = humans.filter((h) => !present.includes(h));
    if (absent.length === humans.length && humans.length === 2) settle(t, pr, 'void');
    else settle(t, pr, absent.some((h) => h.id === pr.white_id) ? '0-1' : '1-0');
  }
}

function finish(t) {
  const standings = db.prepare(`SELECT p.user_id, u.is_bot FROM tournament_players p JOIN users u ON u.id = p.user_id WHERE p.tid = ? AND u.banned = 0
    ORDER BY p.points DESC, p.wins DESC, p.games ASC, p.seed ASC`).all(t.id);
  require('./tournaments').finalize(T(t.id));
  db.prepare('UPDATE tournaments SET end_ts = ? WHERE id = ?').run(Date.now(), t.id);
  standings.forEach((r, i) => notify(r.user_id, 'finish', t, { place: i + 1 }));
}

function tick() {
  const list = db.prepare("SELECT * FROM tournaments WHERE cancelled = 0 AND finalized = 0 AND format IN ('swiss', 'elim')").all();
  const now = Date.now();
  for (const t of list) {
    try {
      if (!t.seeded) { if (now >= t.start_ts) start(t); continue; }
      for (const pr of db.prepare("SELECT * FROM tournament_games WHERE tid = ? AND round = ? AND status IN ('wait')").all(t.id, t.cur_round)) stepPair(T(t.id), pr);
      const cur = T(t.id);
      if (cur.round_done && now - cur.round_done >= (cur.break_sec || 30) * 1000) {
        const alive = db.prepare('SELECT COUNT(*) c FROM tournament_players WHERE tid = ? AND out_round = 0').get(t.id).c;
        if (cur.cur_round >= cur.rounds || (cur.format === 'elim' && alive <= 1)) finish(cur);
        else pairRound(cur, cur.cur_round + 1);
      }
    } catch (e) { console.error('bracket:', e.message); }
  }
}

// ---- правки админа ----
function abortGame(pr) { if (pr.game_id) { db.prepare("UPDATE tournament_games SET game_id = '' WHERE id = ?").run(pr.id); games.forceAbort(pr.game_id); } }

function setResult(tid, prId, result) {
  const t = T(tid), pr = db.prepare('SELECT * FROM tournament_games WHERE id = ? AND tid = ?').get(prId, tid);
  if (!t || !pr || !isBracket(t)) throw new Error('Пара не найдена');
  if (pr.status === 'done' || pr.status === 'redo') throw new Error('Эта пара уже сыграна');
  if (!['1-0', '0-1', '1/2-1/2', 'void'].includes(result)) throw new Error('Неверный результат');
  abortGame(pr);
  settle(t, db.prepare('SELECT * FROM tournament_games WHERE id = ?').get(prId), result);
}

function forceNext(tid) {
  const t = T(tid);
  if (!t || !t.seeded || !isBracket(t)) throw new Error('Турнир ещё не начался');
  for (const pr of db.prepare("SELECT * FROM tournament_games WHERE tid = ? AND round = ? AND status NOT IN ('done', 'redo')").all(tid, t.cur_round)) {
    abortGame(pr);
    const sw = db.prepare('SELECT seed FROM tournament_players WHERE tid = ? AND user_id = ?').get(tid, pr.white_id), sb = db.prepare('SELECT seed FROM tournament_players WHERE tid = ? AND user_id = ?').get(tid, pr.black_id);
    // в сетке на выбывание кто-то должен пройти дальше: решает номер жеребьёвки
    settle(T(tid), db.prepare('SELECT * FROM tournament_games WHERE id = ?').get(pr.id), t.format === 'elim' ? (sw.seed <= sb.seed ? '1-0' : '0-1') : 'void');
  }
  db.prepare('UPDATE tournaments SET round_done = ? WHERE id = ?').run(Date.now() - 3600000, tid);
}

function redraw(tid) {
  const t = T(tid);
  if (!t || !t.seeded || !isBracket(t)) throw new Error('Турнир ещё не начался');
  const rows = pairs(tid, t.cur_round);
  if (rows.some((r) => r.status === 'done' && r.black_id)) throw new Error('В раунде уже есть сыгранные партии, пережеребьёвка невозможна');
  for (const pr of rows) abortGame(pr);
  for (const pr of rows.filter((r) => !r.black_id)) db.prepare('UPDATE tournament_players SET points = points - 2, wins = wins - 1, byes = byes - 1 WHERE tid = ? AND user_id = ?').run(tid, pr.white_id);
  db.prepare('DELETE FROM tournament_games WHERE tid = ? AND round = ?').run(tid, t.cur_round);
  pairRound(T(tid), t.cur_round);
}

function detail(tid) {
  const names = new Map(members(tid).map((p) => [p.user_id, p]));
  const who = (id) => { const p = names.get(id) || user(id); return p ? { id, username: p.username, display: p.display, bot: !!p.is_bot } : null; };
  const rounds = {};
  for (const r of db.prepare('SELECT * FROM tournament_games WHERE tid = ? ORDER BY round, board, id').all(tid)) {
    (rounds[r.round] = rounds[r.round] || []).push({ id: r.id, board: r.board, white: who(r.white_id), black: r.black_id ? who(r.black_id) : null, result: r.result, status: r.status, gameId: r.game_id, attempt: r.attempt });
  }
  return Object.entries(rounds).map(([round, list]) => ({ round: Number(round), pairs: list }));
}

function init(c) {
  ctx = { ...ctx, ...c };
  setInterval(tick, 4000).unref();
}

module.exports = { init, tick, onGameEnd, isBracket, setResult, forceNext, redraw, detail };
