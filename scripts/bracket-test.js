// Проверка движка турниров по сетке без запуска сервера: швейцарская система и игра на выбывание
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-br-'));
const { db } = require('../server/db');
const tournaments = require('../server/tournaments');
const bracket = require('../server/bracket');
const fail = (m) => { console.error('FAIL:', m); process.exit(1); };

bracket.init({ isOnline: () => false });
const now = Date.now();
const mk = (name, bot, rating) => Number(db.prepare(`INSERT INTO users (username, pass, display, rating, is_bot, created, last_seen) VALUES (?, '!', ?, ?, ?, ?, ?)`).run(name, name, rating, bot ? 1 : 0, now, now).lastInsertRowid);

function run(format, nBots, nHumans, extra = {}) {
  const ids = [];
  for (let i = 0; i < nBots; i++) ids.push(mk(`${format}_b${i}`, true, 1000 + i * 40));
  for (let i = 0; i < nHumans; i++) ids.push(mk(`${format}_h${i}`, false, 1200));
  const tid = tournaments.create({ title: format + ' test', start: now - 1000, end: now + 3600000, base: 3, inc: 0, format, bots: 0, prizes: [{ place: 1, type: 'text', value: 'Кубок' }], winPlaces: 3, ...extra }, 'test');
  for (const id of ids) db.prepare('INSERT INTO tournament_players (tid, user_id) VALUES (?, ?)').run(tid, id);
  for (let i = 0; i < 80; i++) {
    bracket.tick();
    const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
    if (t.finalized) break;
    // ускоряем ожидание: боты «доигрывают», время на явку истекло, перерыв прошёл
    db.prepare("UPDATE tournament_games SET due = 0 WHERE tid = ? AND status = 'wait'").run(tid);
    db.prepare('UPDATE tournaments SET round_start = ?, round_done = CASE WHEN round_done > 0 THEN 1 ELSE 0 END WHERE id = ?').run(now - 100000000, tid);
  }
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
  if (!t.finalized) fail(format + ': не завершился, раунд ' + t.cur_round + ' из ' + t.rounds);
  return { t, tid, ids };
}

// швейцарка: 6 ботов + 2 человека (оффлайн, проиграют по неявке), автоматические раунды
{
  const { t, tid, ids } = run('swiss', 6, 2);
  const n = ids.length;
  if (t.rounds < 3) fail('swiss rounds ' + t.rounds);
  const rows = db.prepare('SELECT * FROM tournament_games WHERE tid = ?').all(tid);
  for (let r = 1; r <= t.rounds; r++) {
    const rr = rows.filter((x) => x.round === r);
    const playing = new Set(rr.flatMap((x) => [x.white_id, x.black_id].filter(Boolean)));
    if (playing.size !== n) fail(`swiss round ${r}: в паре не все игроки (${playing.size} из ${n})`);
    if (rr.some((x) => x.status !== 'done')) fail('swiss open pair');
  }
  const seeds = db.prepare('SELECT seed FROM tournament_players WHERE tid = ? ORDER BY seed').all(tid).map((x) => x.seed);
  if (seeds.join() !== Array.from({ length: n }, (_, i) => i + 1).join()) fail('seeds not 1..n ' + seeds);
  console.log('swiss ok, раундов', t.rounds);
}
// игра на выбывание: 5 ботов + 1 человек (6 → бай в первом раунде)
{
  const { t, tid } = run('elim', 5, 1);
  const alive = db.prepare('SELECT COUNT(*) c FROM tournament_players WHERE tid = ? AND out_round = 0').get(tid).c;
  if (alive !== 1) fail('elim alive ' + alive);
  if (t.rounds !== 3) fail('elim rounds ' + t.rounds);
  console.log('elim ok, раундов', t.rounds);
}
// нечётное число и ручной результат
{
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push(mk('man_b' + i, true, 1100));
  const tid = tournaments.create({ title: 'manual', start: now - 1000, end: now + 3600000, base: 3, inc: 0, format: 'swiss', rounds: 2 }, 'test');
  for (const id of ids) db.prepare('INSERT INTO tournament_players (tid, user_id) VALUES (?, ?)').run(tid, id);
  bracket.tick();
  const pr = db.prepare("SELECT * FROM tournament_games WHERE tid = ? AND status = 'wait'").all(tid);
  if (pr.length !== 2) fail('manual pairs ' + pr.length);
  bracket.setResult(tid, pr[0].id, '1-0');
  bracket.setResult(tid, pr[1].id, '1/2-1/2');
  let threw = false;
  try { bracket.setResult(tid, pr[0].id, '0-1'); } catch { threw = true; }
  if (!threw) fail('finished pair editable');
  bracket.forceNext(tid);
  bracket.tick();
  if (db.prepare('SELECT cur_round FROM tournaments WHERE id = ?').get(tid).cur_round !== 2) fail('next round not started');
  bracket.redraw(tid);
  console.log('manual ok');
}
console.log('BRACKET OK');
process.exit(0);
