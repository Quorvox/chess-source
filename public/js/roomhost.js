// Хост комнаты: судья партии живёт в браузере хоста (как лобби в R.E.P.O.). Без рейтинга.
import { Chess } from './board.js';

export class RoomHost {
  constructor(room, hostUser, onChange) {
    this.room = room;
    this.host = hostUser;
    this.onChange = onChange; // вызывается после любого изменения, чтобы разослать состояние
    this.opp = null; // {id, user}
    this.peers = new Map(); // id -> user
    this.reset();
  }

  reset() {
    this.chess = new Chess();
    this.uci = [];
    this.status = 'wait';
    this.result = null;
    this.reason = null;
    this.drawFrom = null;
    this.clock = { w: this.room.base * 60000, b: this.room.base * 60000 };
    this.last = Date.now();
    this.hostColor = Math.random() < 0.5 ? 'w' : 'b';
    clearTimeout(this.flagTimer);
  }

  addPeer(id, user) {
    this.peers.set(id, user);
    if (!this.opp) this.opp = { id, user };
    if (this.status === 'wait' && this.opp) this.start();
    this.onChange();
  }

  removePeer(id) {
    this.peers.delete(id);
    if (this.opp && this.opp.id === id) {
      if (this.status === 'play') this.finish(this.hostColor === 'w' ? '1-0' : '0-1', 'abandon');
      this.opp = null;
      const next = [...this.peers.entries()][0];
      if (next) this.opp = { id: next[0], user: next[1] };
      this.status = 'wait';
      this.reset();
    }
    this.onChange();
  }

  start() {
    this.status = 'play';
    this.last = Date.now();
    this.abortTimer = setTimeout(() => { if (this.status === 'play' && this.uci.length < 2) { this.finish(null, 'aborted'); } }, 60000);
  }

  rematch() {
    if (this.status === 'over' || this.status === 'aborted') {
      this.reset();
      if (this.opp) this.start();
      this.onChange();
    }
  }

  colorOfPeer(id) { return this.opp && this.opp.id === id ? (this.hostColor === 'w' ? 'b' : 'w') : null; }

  running() { return this.status === 'play' && this.uci.length >= 2 ? this.chess.turn() : null; }

  remaining(c) {
    let t = this.clock[c];
    if (this.running() === c) t -= Date.now() - this.last;
    return Math.max(0, t);
  }

  move(color, uci) {
    if (this.status !== 'play' || this.chess.turn() !== color || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci || '')) return false;
    const now = Date.now();
    const timed = this.uci.length >= 2;
    if (timed) {
      this.clock[color] -= now - this.last;
      if (this.clock[color] <= 0) { this.clock[color] = 0; this.flag(color); return true; }
    }
    try { this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { if (timed) this.clock[color] += now - this.last; return false; }
    if (timed) this.clock[color] += this.room.inc * 1000;
    this.uci.push(uci);
    this.last = now;
    this.drawFrom = null;
    clearTimeout(this.flagTimer);
    const c = this.chess;
    if (c.isCheckmate()) this.finish(color === 'w' ? '1-0' : '0-1', 'mate');
    else if (c.isStalemate()) this.finish('1/2-1/2', 'stalemate');
    else if (c.isInsufficientMaterial()) this.finish('1/2-1/2', 'insufficient');
    else if (c.isThreefoldRepetition()) this.finish('1/2-1/2', 'repetition');
    else if (c.isDraw()) this.finish('1/2-1/2', 'fifty');
    else {
      if (this.uci.length >= 2) { const n = c.turn(); this.flagTimer = setTimeout(() => this.flag(n), this.remaining(n) + 50); }
      this.onChange();
    }
    return true;
  }

  flag(color) {
    if (this.status !== 'play' || this.chess.turn() !== color || this.remaining(color) > 0) return;
    const opp = color === 'w' ? 'b' : 'w';
    const onlyKing = this.chess.board().flat().filter((s) => s && s.color === opp).length === 1;
    if (onlyKing) this.finish('1/2-1/2', 'timeout-vs-king');
    else this.finish(opp === 'w' ? '1-0' : '0-1', 'timeout');
  }

  resign(color) { if (this.status === 'play' && this.uci.length >= 2) this.finish(color === 'w' ? '0-1' : '1-0', 'resign'); }
  abort() { if (this.status === 'play' && this.uci.length < 2) this.finish(null, 'aborted'); }

  draw(color) {
    if (this.status !== 'play' || this.uci.length < 2) return;
    if (this.drawFrom && this.drawFrom !== color) return this.finish('1/2-1/2', 'agreed');
    this.drawFrom = color;
    this.onChange();
  }
  drawNo(color) { if (this.drawFrom && this.drawFrom !== color) { this.drawFrom = null; this.onChange(); } }

  finish(result, reason) {
    if (this.status !== 'play') return;
    this.status = result ? 'over' : 'aborted';
    this.result = result;
    this.reason = reason;
    clearTimeout(this.flagTimer);
    clearTimeout(this.abortTimer);
    this.onChange();
  }

  // снимок для рассылки (формат такой же, как у серверной партии)
  snapshot() {
    const pubU = (u) => u && { username: u.username, display: u.display, rating: u.rating, avatar: u.avatar, country: u.country };
    const hostU = pubU(this.host), oppU = this.opp ? pubU(this.opp.user) : null;
    const white = this.hostColor === 'w' ? hostU : oppU;
    const black = this.hostColor === 'w' ? oppU : hostU;
    return {
      white, black, uci: this.uci, base: this.room.base, inc: this.room.inc, rated: false,
      status: this.opp ? this.status : 'wait', note: this.opp ? undefined : 'room.waitFriend',
      result: this.result, reason: this.reason, drawFrom: this.drawFrom,
      wt: this.remaining('w'), bt: this.remaining('b'), running: this.running(), hostColor: this.hostColor,
      oppId: this.opp ? this.opp.id : null,
    };
  }
}
