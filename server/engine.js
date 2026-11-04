// один общий процесс Stockfish на сервере, запросы по очереди; гасим после простоя, чтобы не жрал RAM
const { spawn } = require('child_process');
const stockfish = require('stockfish');

const IDLE_MS = 5 * 60 * 1000;

class Engine {
  constructor() {
    this.proc = null;
    this.queue = [];
    this.cur = null;
    this.buf = '';
    this.idleTimer = null;
  }

  start() {
    const file = stockfish.findEngine('lite-single');
    this.proc = spawn(process.execPath, [file], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.proc.stdout.on('data', (d) => this.onData(d));
    this.proc.on('exit', () => {
      this.proc = null;
      if (this.cur) { clearTimeout(this.cur.timer); this.cur.resolve(null); this.cur = null; }
      this.pump();
    });
    this.send('uci');
    this.send('setoption name Hash value 8');
  }

  send(line) {
    if (this.proc && this.proc.stdin.writable) this.proc.stdin.write(line + '\n');
  }

  onData(chunk) {
    this.buf += chunk.toString();
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      const m = /^bestmove (\S+)/.exec(line);
      if (m && this.cur) {
        clearTimeout(this.cur.timer);
        const job = this.cur;
        this.cur = null;
        job.resolve(m[1] === '(none)' ? null : m[1]);
        this.pump();
      }
    }
  }

  pump() {
    if (this.cur || !this.queue.length) return;
    clearTimeout(this.idleTimer);
    if (!this.proc) this.start();
    const job = this.queue.shift();
    this.cur = job;
    job.timer = setTimeout(() => {
      // завис — убиваем, процесс поднимется заново на следующем запросе
      if (this.proc) this.proc.kill();
    }, 8000);
    const s = job.st;
    if (s.full) {
      this.send('setoption name UCI_LimitStrength value false');
      this.send('setoption name Skill Level value 20');
    } else if (s.elo) {
      this.send('setoption name UCI_LimitStrength value true');
      this.send('setoption name UCI_Elo value ' + s.elo);
    } else {
      this.send('setoption name UCI_LimitStrength value false');
      this.send('setoption name Skill Level value 0');
    }
    this.send('position fen ' + job.fen);
    this.send(s.movetime ? 'go movetime ' + s.movetime : 'go depth ' + s.depth);
  }

  bestMove(fen, st) {
    return new Promise((resolve) => {
      this.queue.push({ fen, st, resolve });
      this.pump();
      this.armIdle();
    });
  }

  armIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.proc && !this.cur && !this.queue.length) this.proc.kill();
    }, IDLE_MS);
  }
}

module.exports = new Engine();
