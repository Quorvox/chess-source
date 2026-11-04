// Рейтинговые партии: судья здесь, на сервере (ходы, часы, результат, рейтинг)
const crypto = require('crypto');
const { Chess } = require('chess.js');
const { db } = require('./db');
const engine = require('./engine');
const { strength } = require('./strength');

const BOT_BADGE = process.env.BOT_BADGE === '1'; // показывать пометку «бот» игрокам

const DEFAULT_PHRASES = ['Хороший ход', 'Интересно...', 'Думаю', 'Удачи!', 'gl hf', 'Ого', 'Посмотрим'];
const games = new Map(); // id -> Game
const userGame = new Map(); // userId -> gameId
const busyBots = new Set();

const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const { badgeOf } = require('./badge');
const pubP = (p) => ({ badge: p.badge || undefined, username: p.username, display: p.display, rating: Math.round(p.rating), avatar: p.avatar, country: p.country, bot: (BOT_BADGE || p.showBot) && p.isBot ? true : undefined });

class Game {
  constructor(o) {
    this.id = crypto.randomBytes(5).toString('hex');
    this.w = o.white;
    this.b = o.black;
    this.base = o.base;
    this.inc = o.inc;
    this.rated = !!o.rated;
    this.tid = o.tid || null;
    this.chess = new Chess();
    this.uci = [];
    this.clock = { w: o.base * 60000, b: o.base * 60000 };
    this.last = Date.now();
    this.status = 'play';
    this.result = null;
    this.reason = null;
    this.delta = null;
    this.drawFrom = null;
    this.sockets = new Set();
    this.gone = { w: null, b: null }; // таймеры «игрок отключился»
    this.penalty = null;
    this.created = Date.now();
    this.flagTimer = null;
    this.botTimer = null;
    // не начали играть за 40 секунд — отмена
    this.abortTimer = setTimeout(() => { if (this.status === 'play' && this.uci.length < 2) this.finish(null, 'aborted'); }, 40000);
    for (const p of [this.w, this.b]) {
      if (p.isBot) busyBots.add(p.id); else userGame.set(p.id, this.id);
    }
    games.set(this.id, this);
    this.maybeBot();
  }

  running() { return this.status === 'play' && this.uci.length >= 2 ? this.chess.turn() : null; }

  remaining(c) {
    let t = this.clock[c];
    if (this.running() === c) t -= Date.now() - this.last;
    return Math.max(0, t);
  }

  state() {
    return {
      id: this.id, white: pubP(this.w), black: pubP(this.b), base: this.base, inc: this.inc, rated: this.rated,
      fen: this.chess.fen(), uci: this.uci, san: this.chess.history(),
      wt: this.remaining('w'), bt: this.remaining('b'), running: this.running(), turn: this.chess.turn(),
      status: this.status, result: this.result, reason: this.reason, delta: this.delta, drawFrom: this.drawFrom,
    };
  }

  broadcast(o) { for (const ws of this.sockets) send(ws, o); }
  sync() { this.broadcast({ t: 'state', game: this.state() }); }

  colorOf(userId) { return this.w.id === userId && !this.w.isBot ? 'w' : this.b.id === userId && !this.b.isBot ? 'b' : null; }

  applyMove(color, uci) {
    if (this.status !== 'play') return 'over';
    if (this.chess.turn() !== color) return 'turn';
    if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return 'illegal';
    const now = Date.now();
    const timed = this.uci.length >= 2;
    if (timed) {
      this.clock[color] -= now - this.last;
      if (this.clock[color] <= 0) { this.clock[color] = 0; this.flag(color); return 'flag'; }
    }
    try {
      this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      if (timed) this.clock[color] += now - this.last;
      return 'illegal';
    }
    if (timed) this.clock[color] += this.inc * 1000;
    this.uci.push(uci);
    this.last = now;
    this.drawFrom = null;
    clearTimeout(this.flagTimer);
    if (this.chess.isCheckmate()) return this.finish(color === 'w' ? '1-0' : '0-1', 'mate');
    if (this.chess.isStalemate()) return this.finish('1/2-1/2', 'stalemate');
    if (this.chess.isInsufficientMaterial()) return this.finish('1/2-1/2', 'insufficient');
    if (this.chess.isThreefoldRepetition()) return this.finish('1/2-1/2', 'repetition');
    if (this.chess.isDraw()) return this.finish('1/2-1/2', 'fifty');
    if (this.uci.length >= 2) {
      const next = this.chess.turn();
      this.flagTimer = setTimeout(() => this.flag(next), this.remaining(next) + 50);
    }
    this.sync();
    // бот сам иногда предлагает ничью (шанс на каждый его ход, не чаще раза в 20 ходов)
    const mover = color === 'w' ? this.w : this.b;
    if (mover.isBot && this.uci.length >= 24 && !this.drawFrom && this.uci.length - (this.botOfferPly || -99) > 20 && Math.random() * 100 < (mover.drawOffer ?? 3)) {
      this.botOfferPly = this.uci.length;
      this.drawFrom = color;
      this.sync();
    }
    this.maybeBot();
    return 'ok';
  }

  flag(color) {
    if (this.status !== 'play' || this.chess.turn() !== color || this.remaining(color) > 0) return;
    const opp = color === 'w' ? 'b' : 'w';
    const onlyKing = this.chess.board().flat().filter((s) => s && s.color === opp).length === 1;
    if (onlyKing) this.finish('1/2-1/2', 'timeout-vs-king');
    else this.finish(opp === 'w' ? '1-0' : '0-1', 'timeout');
  }

  // игрок отвалился (закрыл вкладку, пропал интернет): минута на возвращение, потом поражение и штраф −20
  playerLeft(userId) {
    const c = this.colorOf(userId);
    if (!c || this.status !== 'play' || this.uci.length < 2 || this.gone[c]) return;
    this.gone[c] = setTimeout(() => this.abandon(c), 60000);
  }
  playerBack(userId) {
    const c = this.colorOf(userId);
    if (!c || !this.gone[c]) return;
    clearTimeout(this.gone[c]);
    this.gone[c] = null;
  }
  abandon(c) {
    if (this.status !== 'play') return;
    this.penalty = c;
    this.finish(c === 'w' ? '0-1' : '1-0', 'abandon');
  }

  resign(color) { if (this.status === 'play' && this.uci.length >= 2) this.finish(color === 'w' ? '0-1' : '1-0', 'resign'); }
  abort() { if (this.status === 'play' && this.uci.length < 2) this.finish(null, 'aborted'); }

  // реакции: GG, смайлы. Бот иногда отвечает
  emote(color, code) {
    if (!['gg', 'thumb', 'laugh', 'think', 'wow', 'fire', 'clap', 'sad'].includes(code) || this.status !== 'play') return;
    const now = Date.now();
    if (this.lastEmote && now - this.lastEmote[color] < 1500) return;
    this.lastEmote = { ...(this.lastEmote || { w: 0, b: 0 }), [color]: now };
    this.broadcast({ t: 'emote', id: this.id, color, e: code });
    const opp = color === 'w' ? 'b' : 'w';
    if ((opp === 'w' ? this.w : this.b).isBot && Math.random() < 0.4) {
      const pool = ['thumb', 'think', 'wow', 'gg', 'clap'];
      setTimeout(() => { if (this.status === 'play') this.broadcast({ t: 'emote', id: this.id, color: opp, e: pool[Math.floor(Math.random() * pool.length)] }); }, 1200 + Math.random() * 1800);
    }
  }

  // чат в партии: короткие сообщения, бот иногда отвечает своей фразой
  chat(color, text) {
    text = String(text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120);
    if (!text || this.status !== 'play') return;
    const now = Date.now();
    this.lastChat = this.lastChat || { w: 0, b: 0 };
    if (now - this.lastChat[color] < 1200) return;
    this.lastChat[color] = now;
    this.broadcast({ t: 'chat', id: this.id, color, text });
    const opp = color === 'w' ? 'b' : 'w';
    const bot = opp === 'w' ? this.w : this.b;
    if (bot.isBot && Math.random() < 0.7) {
      const row = db.prepare('SELECT phrases FROM users WHERE id = ?').get(bot.id);
      const list = String(row && row.phrases || '').split('\n').map((x) => x.trim()).filter(Boolean);
      const pool = list.length ? list : DEFAULT_PHRASES;
      const phrase = pool[Math.floor(Math.random() * pool.length)].slice(0, 120);
      setTimeout(() => { if (this.status === 'play') this.broadcast({ t: 'chat', id: this.id, color: opp, text: phrase }); }, 1500 + Math.random() * 3000);
    }
  }

  offerDraw(color) {
    if (this.status !== 'play' || this.uci.length < 2) return;
    if (this.drawFrom && this.drawFrom !== color) return this.finish('1/2-1/2', 'agreed');
    this.drawFrom = color;
    this.sync();
    // бот отвечает не сразу: соглашается с шансом из настроек бота
    const opp = color === 'w' ? this.b : this.w;
    if (opp.isBot) {
      setTimeout(() => {
        if (this.status !== 'play' || this.drawFrom !== color) return;
        if (Math.random() * 100 < (opp.drawAccept ?? 20)) this.finish('1/2-1/2', 'agreed');
        else { this.drawFrom = null; this.sync(); this.broadcast({ t: 'notice', m: 'draw.declined' }); }
      }, 1500 + Math.random() * 2500);
    }
  }
  declineDraw(color) { if (this.drawFrom && this.drawFrom !== color) { this.drawFrom = null; this.sync(); } }

  maybeBot() {
    if (this.status !== 'play') return;
    const color = this.chess.turn();
    const p = color === 'w' ? this.w : this.b;
    if (!p.isBot) return;
    const t0 = Date.now();
    const think = this.uci.length < 2 ? 700 + Math.random() * 1800 : Math.min(3500, 500 + Math.random() * 2200, this.remaining(color) / 15);
    const st = strength(p.rating);
    (async () => {
      let uci = null;
      if (Math.random() >= st.random) uci = await engine.bestMove(this.chess.fen(), st);
      if (!uci) {
        const legal = this.chess.moves({ verbose: true });
        if (!legal.length) return;
        const m = legal[Math.floor(Math.random() * legal.length)];
        uci = m.from + m.to + (m.promotion || '');
      }
      const wait = Math.max(0, think - (Date.now() - t0));
      this.botTimer = setTimeout(() => {
        if (this.status === 'play' && this.chess.turn() === color) this.applyMove(color, uci);
      }, wait);
    })();
  }

  finish(result, reason) {
    if (this.status !== 'play') return 'over';
    this.status = result ? 'over' : 'aborted';
    this.result = result;
    this.reason = reason;
    for (const t of [this.flagTimer, this.abortTimer, this.botTimer, this.gone.w, this.gone.b]) clearTimeout(t);
    for (const p of [this.w, this.b]) { if (p.isBot) busyBots.delete(p.id); else userGame.delete(p.id); }
    if (result && this.rated) this.delta = this.updateRatings();
    this.save();
    try { require('./tournaments').onGameEnd(this); } catch (e) { console.error('турнир:', e.message); }
    this.sync();
    setTimeout(() => games.delete(this.id), 60000);
    return 'end';
  }

  updateRatings() {
    const score = this.result === '1-0' ? 1 : this.result === '0-1' ? 0 : 0.5;
    const out = { w: 0, b: 0 };
    const apply = (p, own, opp, key) => {
      if (p.isBot) return;
      const row = db.prepare('SELECT rating, games FROM users WHERE id = ?').get(p.id);
      const k = row.games < 30 ? 40 : 24;
      const exp = 1 / (1 + Math.pow(10, (opp.rating - row.rating) / 400));
      let nr = Math.max(100, row.rating + k * (own - exp));
      if (this.reason === 'abandon' && this.penalty === key) nr = Math.max(100, nr - 20); // штраф за выход из партии
      const col = own === 1 ? 'wins' : own === 0 ? 'losses' : 'draws';
      db.prepare(`UPDATE users SET rating = ?, games = games + 1, ${col} = ${col} + 1 WHERE id = ?`).run(nr, p.id);
      out[key] = Math.round(nr) - Math.round(row.rating);
      p.rating = nr;
    };
    apply(this.w, score, this.b, 'w');
    apply(this.b, 1 - score, this.w, 'b');
    return out;
  }

  save() {
    db.prepare(`INSERT INTO games (id, white_id, black_id, white_name, black_name, white_rating, black_rating,
      white_bot, black_bot, result, reason, pgn, base, inc, rated, moves, created, ended, tid)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      this.id, this.w.id, this.b.id, this.w.username, this.b.username, Math.round(this.w.rating), Math.round(this.b.rating),
      this.w.isBot ? 1 : 0, this.b.isBot ? 1 : 0, this.result, this.reason, this.chess.pgn(), this.base, this.inc,
      this.rated ? 1 : 0, this.uci.length, this.created, Date.now(), this.tid);
  }
}

function playerFromRow(u, ratingOverride) {
  return { showBot: !!u.show_bot, drawAccept: u.draw_accept ?? 20, drawOffer: u.draw_offer ?? 3, badge: badgeOf(u), id: u.id, username: u.username, display: u.display, rating: ratingOverride ?? u.rating, avatar: u.avatar, country: u.country, isBot: !!u.is_bot };
}

function create(o) { return new Game(o); }
const get = (id) => games.get(id);
const activeOf = (userId) => games.get(userGame.get(userId));
const isBusy = (userId) => userGame.has(userId);
const liveList = () => [...games.values()].filter((g) => g.status === 'play' && g.uci.length >= 2)
  .sort((a, b) => b.uci.length - a.uci.length).slice(0, 8)
  .map((g) => ({ id: g.id, white: pubP(g.w), black: pubP(g.b), base: g.base, inc: g.inc, moves: g.uci.length }));
// для админки: все идущие партии (и ещё не начатые), с игроками и ходами
const adminList = () => [...games.values()].filter((g) => g.status === 'play').map((g) => ({
  id: g.id, white: { id: g.w.id, username: g.w.username, rating: Math.round(g.w.rating), bot: !!g.w.isBot },
  black: { id: g.b.id, username: g.b.username, rating: Math.round(g.b.rating), bot: !!g.b.isBot },
  base: g.base, inc: g.inc, rated: g.rated, tid: g.tid, moves: g.uci.length, created: g.created,
}));
const forceAbort = (id) => { const g = games.get(id); if (!g || g.status !== 'play') return false; g.finish(null, 'aborted'); return true; };
const activeCount = () => [...games.values()].filter((g) => g.status === 'play').length;

module.exports = { create, get, activeOf, isBusy, liveList, adminList, forceAbort, activeCount, playerFromRow, busyBots, pubP };
