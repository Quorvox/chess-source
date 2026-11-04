const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA, 'avatars'), { recursive: true });

const db = new DatabaseSync(path.join(DATA, 'quorchess.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass TEXT NOT NULL,
  display TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT 'p1',
  rating REAL NOT NULL DEFAULT 1200,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  is_bot INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT NOT NULL DEFAULT '',
  hidden INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  last_ip TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- журнал действий админов: кто, что и над кем сделал
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  admin_id INTEGER NOT NULL,
  admin_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  white_id INTEGER NOT NULL,
  black_id INTEGER NOT NULL,
  white_name TEXT NOT NULL,
  black_name TEXT NOT NULL,
  white_rating INTEGER NOT NULL,
  black_rating INTEGER NOT NULL,
  white_bot INTEGER NOT NULL DEFAULT 0,
  black_bot INTEGER NOT NULL DEFAULT 0,
  result TEXT,
  reason TEXT,
  pgn TEXT NOT NULL DEFAULT '',
  base INTEGER NOT NULL,
  inc INTEGER NOT NULL,
  rated INTEGER NOT NULL DEFAULT 1,
  moves INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  ended INTEGER
);
CREATE INDEX IF NOT EXISTS games_white ON games(white_id);
CREATE INDEX IF NOT EXISTS games_black ON games(black_id);
CREATE INDEX IF NOT EXISTS games_ended ON games(ended);
`);

// имена ботов для «живого» ММ: выглядят как обычные ники
const BOT_NAMES = ['Kirill_M', 'anna_k', 'Dmitry87', 'Leon_Fischer', 'Max_Berger', 'SashaChess', 'TimurG', 'julia_w',
  'Nico_Braun', 'Oleg_P', 'Felix_Hahn', 'MarkusK', 'ivan_pawn', 'Lena_S', 'DaniilV', 'Jonas_Weber', 'Artem_Z',
  'Sofia_R', 'Paul_Schmidt', 'Egor77', 'Katja_N', 'Tim_Wolf', 'Vlad_K', 'Emil_B', 'Roman_T', 'Luka_M', 'Hannah_L',
  'Pavel_D', 'Stefan_O', 'Yuri_A', 'Mia_Koch', 'Ben_Richter', 'Denis_F', 'Alex_Neu', 'Igor_S', 'Marta_V', 'Tom_Lange',
  'Ruslan_H', 'Elias_W', 'Nikita_B'];
const COUNTRIES = ['DE', 'RU', 'UA', 'KZ', 'BY', 'PL', 'TR', 'AT'];

// стартовых ботов создаём один раз, при самой первой установке. Если админ их удалил, они не возвращаются
function seedBots() {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'bots_seeded'").get()) return;
  const anyone = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('bots_seeded', '1')").run();
  if (anyone > 0) return; // база уже живёт: ничего не досоздаём
  const n = db.prepare('SELECT COUNT(*) c FROM users WHERE is_bot = 1').get().c;
  if (n >= BOT_NAMES.length) return;
  const ins = db.prepare(`INSERT OR IGNORE INTO users
    (username, pass, display, country, avatar, rating, games, wins, losses, draws, is_bot, created, last_seen)
    VALUES (?, '!', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`);
  const now = Date.now();
  for (const name of BOT_NAMES) {
    const rating = 800 + Math.floor(Math.random() * 1400);
    const country = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
    const avatar = 'p' + (1 + Math.floor(Math.random() * 12));
    // у бота «история» под рейтинг: сильнее рейтинг, больше побед
    const games = 40 + Math.floor(Math.random() * 360);
    const draws = Math.floor(games * 0.08);
    const winRate = Math.min(0.75, Math.max(0.3, 0.3 + (rating - 800) / 1400 * 0.4));
    const wins = Math.floor((games - draws) * winRate);
    ins.run(name, name, country, avatar, rating, games, wins, games - draws - wins, draws, now - Math.floor(Math.random() * 90) * 86400000, now);
  }
}
seedBots();

// ---- миграции: новые поля и таблицы (безопасно для уже существующей базы) ----
function ensureColumn(table, col, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
}
ensureColumn('users', 'email', "TEXT NOT NULL DEFAULT ''");
ensureColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'provider', "TEXT NOT NULL DEFAULT 'password'");
ensureColumn('users', 'provider_id', "TEXT NOT NULL DEFAULT ''");
ensureColumn('users', 'reg_ip', "TEXT NOT NULL DEFAULT ''");
ensureColumn('games', 'tid', 'INTEGER');
ensureColumn('users', 'badge', "TEXT NOT NULL DEFAULT ''");
ensureColumn('users', 'phrases', "TEXT NOT NULL DEFAULT ''");
ensureColumn('users', 'draw_accept', 'INTEGER NOT NULL DEFAULT 20');
ensureColumn('users', 'draw_offer', 'INTEGER NOT NULL DEFAULT 3');
ensureColumn('users', 'show_bot', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'always_on', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'consent_at', 'INTEGER NOT NULL DEFAULT 0');
db.exec(`CREATE TABLE IF NOT EXISTS friends (a INTEGER NOT NULL, b INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', ts INTEGER NOT NULL, PRIMARY KEY (a, b));
CREATE INDEX IF NOT EXISTS friends_b ON friends(b);`);
db.exec(`
CREATE TABLE IF NOT EXISTS tg_panels (chat TEXT PRIMARY KEY, mid INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tg_tokens (h TEXT PRIMARY KEY, user_id INTEGER NOT NULL, ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS verify_requests (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, tg_id TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', answer TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL, decided INTEGER NOT NULL DEFAULT 0, decided_by TEXT NOT NULL DEFAULT ''
);`);

db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email) WHERE email <> '';
CREATE UNIQUE INDEX IF NOT EXISTS users_provider ON users(provider, provider_id) WHERE provider_id <> '';

-- награды: скины и значки, которые выдаёт админ или турнир
CREATE TABLE IF NOT EXISTS awards (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  by_name TEXT NOT NULL DEFAULT '',
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS awards_user ON awards(user_id);

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'special',
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  base INTEGER NOT NULL,
  inc INTEGER NOT NULL,
  rated INTEGER NOT NULL DEFAULT 1,
  bots INTEGER NOT NULL DEFAULT 0,
  bots_added INTEGER NOT NULL DEFAULT 0,
  prize TEXT NOT NULL DEFAULT '',
  cancelled INTEGER NOT NULL DEFAULT 0,
  finalized INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tournament_players (
  tid INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tid, user_id)
);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  title_ru TEXT NOT NULL,
  title_en TEXT NOT NULL,
  body_ru TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL DEFAULT ''
);

-- админы скрытого сайта: отдельные от игроков, с одноразовыми кодами
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass TEXT NOT NULL,
  totp_secret TEXT NOT NULL,
  last_step INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
`);

if (db.prepare('SELECT COUNT(*) c FROM news').get().c === 0) {
  const now = Date.now();
  db.prepare('INSERT INTO news (ts, title_ru, title_en, body_ru, body_en) VALUES (?, ?, ?, ?, ?)').run(now,
    'Запуск QuorChess', 'QuorChess is live',
    'Рейтинговые партии, боты десяти уровней, комнаты для друзей, настройки доски и звуки. Дальше: турниры и награды.',
    'Rated games, ten bot levels, friend rooms, board settings and sounds. Next: tournaments and rewards.');
}

const getSetting = (key, def) => {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return r ? r.value : def;
};
const setSetting = (key, value) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));

function audit(admin, action, target, details) {
  db.prepare('INSERT INTO audit (ts, admin_id, admin_name, action, target, details) VALUES (?, ?, ?, ?, ?, ?)')
    .run(Date.now(), admin.id, admin.username, action, target || '', details || '');
}

ensureColumn('tournaments', 'prizes', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('tournaments', 'info', "TEXT NOT NULL DEFAULT ''");
ensureColumn('tournaments', 'format', "TEXT NOT NULL DEFAULT 'arena'");
for (const [c, d] of [['rounds', 0], ['win_places', 3], ['cur_round', 0], ['round_start', 0], ['round_done', 0], ['seeded', 0], ['max_players', 0], ['grace_sec', 120], ['break_sec', 30]]) ensureColumn('tournaments', c, `INTEGER NOT NULL DEFAULT ${d}`);
for (const c of ['seed', 'out_round', 'byes']) ensureColumn('tournament_players', c, 'INTEGER NOT NULL DEFAULT 0');
db.exec(`CREATE TABLE IF NOT EXISTS tournament_games (
  id INTEGER PRIMARY KEY, tid INTEGER NOT NULL, round INTEGER NOT NULL, board INTEGER NOT NULL DEFAULT 0, white_id INTEGER NOT NULL, black_id INTEGER NOT NULL DEFAULT 0,
  game_id TEXT NOT NULL DEFAULT '', result TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'wait', attempt INTEGER NOT NULL DEFAULT 1, due INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tg_tid ON tournament_games(tid, round);
CREATE INDEX IF NOT EXISTS tg_game ON tournament_games(game_id);`);

// с этого рейтинга начинают новые игроки (шкала близка к chess.com)
const START_RATING = 500;

module.exports = { db, DATA, getSetting, setSetting, audit, START_RATING };
