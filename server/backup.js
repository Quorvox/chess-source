// Резервные копии базы: раз в сутки сервер делает полную копию (VACUUM INTO), хранит последние 20.
// Копию можно скачать из админки или забирать на свой компьютер по расписанию (scripts/backup-pull.ps1).
const fs = require('fs');
const path = require('path');
const { db, DATA } = require('./db');

const DIR = path.join(DATA, 'backups');
const KEEP = 20;
const DAY = 86400000;
const NAME_RE = /^quorchess-\d{8}-\d{4}\.db$/;

function list() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((n) => NAME_RE.test(n)).map((n) => { const st = fs.statSync(path.join(DIR, n)); return { name: n, size: st.size, ts: st.mtimeMs }; }).sort((a, b) => b.ts - a.ts);
}

function create() {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o750 });
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const name = `quorchess-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.db`;
  const file = path.join(DIR, name);
  fs.rmSync(file, { force: true });
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  fs.copyFileSync(file, path.join(DIR, 'latest.db')); // постоянное имя, чтобы забирать по расписанию
  for (const old of list().slice(KEEP)) fs.rmSync(path.join(DIR, old.name), { force: true });
  return name;
}

// имя файла из запроса: только наши копии, без путей
function fileOf(name) {
  if (!NAME_RE.test(String(name || ''))) return null;
  const f = path.join(DIR, name);
  return fs.existsSync(f) ? f : null;
}

function tick() {
  try {
    const last = list()[0];
    if (!last || Date.now() - last.ts > DAY) create();
  } catch (e) { console.error('backup:', e.message); }
}

function start() {
  setTimeout(tick, 15000).unref();
  setInterval(tick, 3600000).unref();
}

module.exports = { list, create, fileOf, start, DIR };
