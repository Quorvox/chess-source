// Нагрузочный тест: N игроков одновременно ищут рейтинговую партию, получают бота и играют случайными ходами.
// Запуск: LOAD_N=40 LOAD_SEC=45 node scripts/loadtest.js
const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const WebSocket = require('ws');
const { Chess } = require('chess.js');

const N = Number(process.env.LOAD_N || 30), SEC = Number(process.env.LOAD_SEC || 45), PORT = 3495;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-load-'));
process.env.DATA_DIR = dataDir;
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT, DATA_DIR: dataDir }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rss = () => {
  try {
    if (process.platform === 'win32') return Math.round(Number(execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${srv.pid} -or $_.ProcessId -eq ${srv.pid} } | Measure-Object WorkingSetSize -Sum).Sum"`).toString().trim()) / 1048576);
    const kb = execSync(`ps -o rss= -p ${srv.pid} --ppid ${srv.pid}`).toString().trim().split(/\s+/).reduce((a, x) => a + Number(x || 0), 0);
    return Math.round(kb / 1024);
  } catch { return -1; }
};

(async () => {
  await sleep(2500);
  const { db } = require('../server/db');
  const auth = require('../server/auth');
  const now = Date.now();
  const users = [];
  for (let i = 0; i < N; i++) {
    const id = Number(db.prepare("INSERT INTO users (username, pass, display, rating, created, last_seen) VALUES (?, '!', ?, ?, ?, ?)").run('load' + i, 'load' + i, 700 + (i % 8) * 120, now, now).lastInsertRowid);
    users.push({ id, token: auth.createSession(id) });
  }
  const replies = [];
  let moves = 0, games = 0, errors = 0;
  const cpu0 = os.cpus().reduce((a, c) => a + c.times.user + c.times.sys, 0), idle0 = os.cpus().reduce((a, c) => a + c.times.idle, 0);

  const clients = users.map((u, i) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`, { headers: { cookie: 'qc=' + u.token, origin: `http://localhost:${PORT}` } });
    let gid = null, myColor = null, sentAt = 0, lastLen = 0;
    ws.on('error', () => { errors++; });
    ws.on('open', () => setTimeout(() => ws.send(JSON.stringify({ t: 'seek', base: 3, inc: 0 })), (i * 200) % 3000));
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.t === 'start') { gid = m.id; games++; ws.send(JSON.stringify({ t: 'watch', id: gid })); }
      if (m.t === 'state' && m.game.id === gid) {
        const g = m.game;
        if (g.status !== 'play') return;
        if (!myColor) myColor = g.white.username === 'load' + i ? 'w' : 'b';
        if (g.uci.length > lastLen && g.turn === myColor && sentAt) { replies.push(Date.now() - sentAt); sentAt = 0; }
        lastLen = g.uci.length;
        if (g.turn === myColor) {
          setTimeout(() => {
            const c = new Chess(g.fen);
            const mv = c.moves({ verbose: true });
            if (!mv.length) return;
            const x = mv[Math.floor(Math.random() * mv.length)];
            sentAt = Date.now(); moves++;
            if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'move', id: gid, uci: x.from + x.to + (x.promotion || '') }));
          }, 300 + Math.random() * 700);
        }
      }
    });
    setTimeout(() => { try { ws.close(); } catch { /* ok */ } resolve(); }, SEC * 1000);
  }));

  const samples = [];
  const iv = setInterval(() => samples.push(rss()), 3000);
  await Promise.all(clients);
  clearInterval(iv);
  const cpu1 = os.cpus().reduce((a, c) => a + c.times.user + c.times.sys, 0), idle1 = os.cpus().reduce((a, c) => a + c.times.idle, 0);
  const busy = (cpu1 - cpu0) / ((cpu1 - cpu0) + (idle1 - idle0)) * 100;
  replies.sort((a, b) => a - b);
  const p = (q) => replies.length ? replies[Math.min(replies.length - 1, Math.floor(replies.length * q))] : 0;
  console.log(JSON.stringify({ игроков: N, секунд: SEC, партийНачато: games, ходовИгроков: moves, ответовБота: replies.length, ответБота_мс: { медиана: p(0.5), p90: p(0.9), макс: replies[replies.length - 1] || 0 }, памятьСервераМБ: { максимум: Math.max(...samples), конец: samples[samples.length - 1] }, загрузкаЦП_весьПК_проц: Math.round(busy), ошибокСокета: errors }, null, 1));
  srv.kill();
  process.exit(0);
})();
