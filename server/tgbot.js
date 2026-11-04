// Telegram-бот QuorChess: регистрация и вход на сайт по одноразовой ссылке, заявки на галочки.
// Работает через long polling прямо в процессе сайта, webhook не нужен.
// Реакции в канале этот же бот ставит отдельным процессом (sqlens-bots), здесь это не трогаем.
const crypto = require('crypto');
const { db, audit } = require('./db');
const social = require('./social');
const { badgeOf } = require('./badge');

const API = process.env.TELEGRAM_API || 'https://api.telegram.org';
const token = () => process.env.TELEGRAM_BOT_TOKEN || '';
const site = () => process.env.PUBLIC_URL || 'http://localhost:' + (process.env.PORT || 3410);
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

// эмодзи в шахматном стиле. Премиум-эмодзи подставляются, если их id заданы в TG_EMOJI (json),
// а Telegram разрешает боту их использовать; иначе молча падаем на обычные
let customOk = true;
let EMOJI_IDS = {};
try { EMOJI_IDS = JSON.parse(process.env.TG_EMOJI || '{}'); } catch { /* без премиум-эмодзи */ }
const E = { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟', ok: '✅', blue: '🔵', gold: '🟡', green: '🟢', link: '🔗', star: '⭐', trophy: '🏆', clock: '⏱', warn: '⚠️' };
const em = (k) => (customOk && EMOJI_IDS[k] ? `<tg-emoji emoji-id="${EMOJI_IDS[k]}">${E[k]}</tg-emoji>` : E[k]);
const plain = (s) => s.replace(/<tg-emoji[^>]*>(.*?)<\/tg-emoji>/g, '$1');

const T = {
  ru: {
    hello: (n) => `${em('king')} <b>QuorChess</b>  ·  <i>шахматы без лишнего шума</i>\n━━━━━━━━━━━━━\nПривет, <b>${n}</b>! Я помогаю зайти на сайт без пароля и получить галочку у ника.\n\n<blockquote>${em('knight')} Рейтинговые партии и боты\n${em('rook')} Комнаты и партии с друзьями\n${em('queen')} Турниры, призы и скины\n${em('bishop')} Тренировка и разборы</blockquote>`,
    btnTop: 'Топ игроков', btnTourn: 'Турниры', btnChannel: 'Канал',
    topTitle: 'Топ игроков', tournTitle: 'Турниры', tournNone: 'Ближайших турниров пока нет.', tRunning: 'идёт', tStarts: 'старт', tPlayers: 'участников',
    friendReq: (n) => `${em('pawn')} <b>${n}</b> хочет добавить тебя в друзья на QuorChess. Открой сайт, раздел «Друзья».`,
    btnLogin: 'Войти на сайт', btnVerify: 'Галочки', btnProfile: 'Мой профиль', btnSite: 'Открыть сайт', btnBack: 'Назад',
    loginText: (name) => `${em('pawn')} Аккаунт <b>${name}</b> готов.\n\nНажми кнопку ниже. Ссылка одноразовая и живёт 10 минут, никому её не пересылай.\n\n<i>Входя, ты принимаешь <a href="${site()}/legal#rules">соглашение</a> и <a href="${site()}/legal#data">политику конфиденциальности</a>.</i>`,
    rating: 'Рейтинг', games: 'Партий', wins: 'Побед', badge: 'Галочка', cancel: 'Отмена',
    loginBtn: 'Открыть QuorChess', banned: `${em('warn')} Этот аккаунт заблокирован.`, limit: `${em('clock')} Слишком часто. Попробуй через несколько минут.`,
    profile: (u, b) => `${em('king')} <b>${u.display}</b> (@${u.username})\nРейтинг: <b>${Math.round(u.rating)}</b>\nПартий: ${u.games}, побед: ${u.wins}\nГалочка: ${b}`,
    badgeNone: 'нет', badgeGreen: 'зелёная', badgeBlue: 'синяя', badgeGold: 'золотая',
    noAccount: 'Сначала нажми «Войти на сайт», чтобы создать аккаунт.',
    verifyInfo: (cur) => `${em('star')} <b>Галочки</b>\n\n${em('green')} <b>Зелёная</b>: аккаунт подтверждён (почта или вход через Telegram). Ставится сама.\n${em('blue')} <b>Синяя</b>: заслуги или известность (стример, тренер, автор, сильный игрок). Решает администрация.\n${em('gold')} <b>Золотая</b>: команда проекта и партнёры.\n\nСейчас у тебя: <b>${cur}</b>`,
    reqBlue: 'Заявка на синюю', reqGold: 'Заявка на золотую',
    ask: (k) => `${k === 'gold' ? em('gold') : em('blue')} Напиши одним сообщением, почему тебе должны дать ${k === 'gold' ? 'золотую' : 'синюю'} галочку. Можно со ссылками на соцсети или канал (до 500 символов).\n\n/cancel, чтобы отменить.`,
    sent: `${em('ok')} Заявка отправлена. Как только администрация её рассмотрит, я напишу сюда.`,
    pending: 'Твоя заявка уже на рассмотрении. Подожди ответа.', have: 'У тебя уже есть эта галочка или выше.',
    cool: 'Прошлую заявку отклонили недавно. Новую можно подать через неделю.', short: 'Напиши чуть подробнее (хотя бы 15 символов).', cancelled: 'Отменил.',
    approved: (k) => `${k === 'gold' ? em('gold') : em('blue')} <b>Заявка одобрена!</b> Галочка уже у твоего ника на сайте.`,
    rejected: (a) => `${em('warn')} Заявку отклонили.${a ? '\nКомментарий: ' + a : ''}`,
    help: '/start — меню\n/login — ссылка для входа\n/verify — галочки\n/me — мой профиль',
    desc: 'Вход на сайт QuorChess без пароля и заявки на галочки. Шахматы: рейтинг, боты, друзья, турниры.', short2: 'Вход в QuorChess и галочки',
  },
  en: {
    hello: (n) => `${em('king')} <b>QuorChess</b>  ·  <i>chess without the noise</i>\n━━━━━━━━━━━━━\nHi <b>${n}</b>! I help you sign in without a password and get a badge next to your name.\n\n<blockquote>${em('knight')} Rated games and bots\n${em('rook')} Rooms and games with friends\n${em('queen')} Tournaments, prizes and skins\n${em('bishop')} Training and game reviews</blockquote>`,
    btnTop: 'Leaderboard', btnTourn: 'Tournaments', btnChannel: 'Channel',
    topTitle: 'Top players', tournTitle: 'Tournaments', tournNone: 'No upcoming tournaments yet.', tRunning: 'live', tStarts: 'starts', tPlayers: 'players',
    friendReq: (n) => `${em('pawn')} <b>${n}</b> wants to add you as a friend on QuorChess. Open the site, Friends section.`,
    btnLogin: 'Sign in to the site', btnVerify: 'Badges', btnProfile: 'My profile', btnSite: 'Open site', btnBack: 'Back',
    loginText: (name) => `${em('pawn')} Account <b>${name}</b> is ready.\n\nPress the button below. The link is single-use, valid for 10 minutes. Do not forward it.\n\n<i>By signing in you accept the <a href="${site()}/legal#rules">terms of use</a> and the <a href="${site()}/legal#data">privacy policy</a>.</i>`,
    rating: 'Rating', games: 'Games', wins: 'Wins', badge: 'Badge', cancel: 'Cancel',
    loginBtn: 'Open QuorChess', banned: `${em('warn')} This account is blocked.`, limit: `${em('clock')} Too often. Try again in a few minutes.`,
    profile: (u, b) => `${em('king')} <b>${u.display}</b> (@${u.username})\nRating: <b>${Math.round(u.rating)}</b>\nGames: ${u.games}, wins: ${u.wins}\nBadge: ${b}`,
    badgeNone: 'none', badgeGreen: 'green', badgeBlue: 'blue', badgeGold: 'gold',
    noAccount: 'Press “Sign in to the site” first to create an account.',
    verifyInfo: (cur) => `${em('star')} <b>Badges</b>\n\n${em('green')} <b>Green</b>: account is confirmed (email or Telegram login). Automatic.\n${em('blue')} <b>Blue</b>: merit or notability (streamer, coach, author, strong player). Decided by the team.\n${em('gold')} <b>Gold</b>: the project team and partners.\n\nYour badge now: <b>${cur}</b>`,
    reqBlue: 'Apply for blue', reqGold: 'Apply for gold',
    ask: (k) => `${k === 'gold' ? em('gold') : em('blue')} Write in one message why you should get the ${k} badge. Links to socials or a channel are welcome (up to 500 characters).\n\n/cancel to abort.`,
    sent: `${em('ok')} Request sent. I will write here as soon as the team reviews it.`,
    pending: 'Your request is already pending. Please wait.', have: 'You already have this badge or a higher one.',
    cool: 'Your last request was declined recently. You can apply again in a week.', short: 'Please write a bit more (at least 15 characters).', cancelled: 'Cancelled.',
    approved: (k) => `${k === 'gold' ? em('gold') : em('blue')} <b>Request approved!</b> The badge is already next to your name on the site.`,
    rejected: (a) => `${em('warn')} Your request was declined.${a ? '\nComment: ' + a : ''}`,
    help: '/start — menu\n/login — sign-in link\n/verify — badges\n/me — my profile',
    desc: 'Passwordless sign-in to QuorChess and badge requests. Chess: ratings, bots, friends, tournaments.', short2: 'QuorChess sign-in and badges',
  },
};
const langOf = (from) => (from && /^ru|^uk|^be|^kk/.test(from.language_code || '') ? 'ru' : 'en');
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function call(method, body) {
  const r = await fetch(`${API}/bot${token()}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(method === 'getUpdates' ? 45000 : 15000) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) { const e = new Error(j.description || 'telegram ' + r.status); e.code = j.error_code; throw e; }
  return j.result;
}

// отправка: если Telegram не принял премиум-эмодзи, повторяем с обычными
async function say(chat, text, extra = {}) {
  const body = { chat_id: chat, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra };
  try { return await call('sendMessage', body); } catch (e) {
    if (customOk && /emoji|entit/i.test(e.message)) { customOk = false; return call('sendMessage', { ...body, text: plain(text) }); }
    throw e;
  }
}

// цветные кнопки (style поддерживают новые клиенты, старые игнорируют)
const btn = (text, data, style) => ({ text, callback_data: data, ...(style ? { style } : {}) });
const menu = (l) => ({ inline_keyboard: [
  [btn(l.btnLogin, 'login', 'success')],
  [btn(l.btnTop, 'top'), btn(l.btnTourn, 'tourn')],
  [btn(l.btnVerify, 'verify', 'primary'), btn(l.btnProfile, 'me')],
  [{ text: l.btnSite, url: site() }, { text: l.btnChannel, url: 'https://t.me/QuorChess' }],
] });
const back = (l) => ({ inline_keyboard: [[btn('« ' + l.btnBack, 'home')]] });

const userOf = (id) => db.prepare("SELECT * FROM users WHERE provider = 'telegram' AND provider_id = ?").get(String(id));
const badgeName = (l, u) => ({ '': l.badgeNone, green: '🟢 ' + l.badgeGreen, blue: '🔵 ' + l.badgeBlue, gold: '🟡 ' + l.badgeGold }[badgeOf(u)]);
const hits = new Map(); // защита от спама ссылками
function limited(id) {
  const now = Date.now();
  const a = (hits.get(id) || []).filter((x) => now - x < 600000);
  if (a.length >= 5) return true;
  a.push(now); hits.set(id, a);
  return false;
}
const waiting = new Map(); // chat -> {kind}
const quiet = (p) => p.catch(() => {});

// В чате всегда одно сообщение-панель: кнопки её правят, команды стирают своё сообщение и старую панель
const getPanel = (chat) => (db.prepare('SELECT mid FROM tg_panels WHERE chat = ?').get(String(chat)) || {}).mid;
const setPanel = (chat, mid) => db.prepare('INSERT INTO tg_panels (chat, mid) VALUES (?, ?) ON CONFLICT(chat) DO UPDATE SET mid = excluded.mid').run(String(chat), mid);
async function show(chat, text, markup, editId) {
  if (editId) {
    try {
      await call('editMessageText', { chat_id: chat, message_id: editId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: markup });
      setPanel(chat, editId);
      return;
    } catch (e) {
      if (/not modified/i.test(e.message)) return;
      if (customOk && /emoji|entit/i.test(e.message)) { customOk = false; return show(chat, plain(text), markup, editId); }
    }
  }
  const old = getPanel(chat);
  const sent = await say(chat, text, { reply_markup: markup });
  setPanel(chat, sent.message_id);
  if (old && old !== sent.message_id) quiet(call('deleteMessage', { chat_id: chat, message_id: old }));
}

function makeLink(userId) {
  const raw = crypto.randomBytes(24).toString('hex');
  db.prepare('DELETE FROM tg_tokens WHERE ts < ?').run(Date.now() - 3600000);
  db.prepare('INSERT INTO tg_tokens (h, user_id, ts) VALUES (?, ?, ?)').run(hash(raw), userId, Date.now());
  return `${site()}/api/auth/tg?t=${raw}`;
}

// сайт зовёт при переходе по ссылке: вернёт пользователя один раз
function consume(raw) {
  if (typeof raw !== 'string' || !/^[a-f0-9]{48}$/.test(raw)) return null;
  const row = db.prepare('SELECT * FROM tg_tokens WHERE h = ?').get(hash(raw));
  if (!row) return null;
  db.prepare('DELETE FROM tg_tokens WHERE h = ?').run(row.h);
  if (Date.now() - row.ts > 600000) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) || null;
}

const LINE = '━━━━━━━━━━━━━';
async function screen(name, chat, from, l, editId) {
  const u = userOf(from.id);
  if (name === 'home') { waiting.delete(chat); return show(chat, l.hello(esc(from.first_name || from.username || '')), menu(l), editId); }
  if (name === 'login') {
    if (limited(from.id)) return show(chat, l.limit, back(l), editId);
    const acc = social.findOrCreate({ provider: 'telegram', pid: String(from.id), nameHint: from.username || from.first_name, display: from.first_name || from.username, ip: 'telegram' });
    if (acc.banned) return show(chat, l.banned, back(l), editId);
    return show(chat, l.loginText(esc(acc.username)), { inline_keyboard: [[{ text: l.loginBtn, url: makeLink(acc.id), style: 'success' }], [btn('« ' + l.btnBack, 'home')]] }, editId);
  }
  if (name === 'top') {
    const rows = db.prepare("SELECT username, display, rating, badge, email_verified, provider, is_bot FROM users WHERE (games > 0 OR is_bot = 0) AND hidden = 0 AND banned = 0 AND username NOT LIKE 'deleted!_%' ESCAPE '!' ORDER BY rating DESC, games DESC LIMIT 10").all();
    const medal = ['🥇', '🥈', '🥉'];
    const lines = rows.map((r, i) => `${medal[i] || '<code>' + String(i + 1).padStart(2, ' ') + '</code>'} <b>${esc(r.display)}</b> ${{ green: '🟢', blue: '🔵', gold: '🟡' }[badgeOf(r)] || ''} <code>${Math.round(r.rating)}</code>`);
    return show(chat, `${em('trophy')} <b>${l.topTitle}</b>\n${LINE}\n${lines.join('\n')}`, { inline_keyboard: [[{ text: l.btnSite, url: site() + '/leaders' }], [btn('« ' + l.btnBack, 'home')]] }, editId);
  }
  if (name === 'tourn') {
    const tn = require('./tournaments');
    const list = db.prepare('SELECT * FROM tournaments WHERE cancelled = 0 AND finalized = 0 ORDER BY start_ts LIMIT 4').all().map(tn.pub).filter((x) => x.status !== 'finished');
    const fmt = (ts) => new Date(ts).toLocaleString(langOf(from) === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
    const lines = list.map((x) => `${x.status === 'running' ? '🟢' : '⏱'} <b>${esc(String(x.title).split(' / ')[langOf(from) === 'en' ? 1 : 0] || x.title)}</b>\n   ${x.base}+${x.inc} · ${x.status === 'running' ? l.tRunning : l.tStarts + ' ' + fmt(x.start)} · ${l.tPlayers}: ${x.players}`);
    return show(chat, `${em('trophy')} <b>${l.tournTitle}</b>\n${LINE}\n${lines.join('\n\n') || l.tournNone}`, { inline_keyboard: [[{ text: l.btnSite, url: site() + '/tournaments' }], [btn('« ' + l.btnBack, 'home')]] }, editId);
  }
  if (!u) return show(chat, l.noAccount, menu(l), editId);
  if (name === 'me') {
    const wr = u.games ? Math.round(u.wins / u.games * 100) : 0;
    return show(chat, `${em('king')} <b>${esc(u.display)}</b> ${{ green: '🟢', blue: '🔵', gold: '🟡' }[badgeOf(u)] || ''}\n<i>@${esc(u.username)}</i>\n${LINE}\n${em('pawn')} ${l.rating}: <b>${Math.round(u.rating)}</b>\n${em('knight')} ${l.games}: <b>${u.games}</b> · ${l.wins}: <b>${u.wins}</b> (${wr}%)\n${em('star')} ${l.badge}: <b>${badgeName(l, u)}</b>`, { inline_keyboard: [[btn(l.btnVerify, 'verify', 'primary')], [btn('« ' + l.btnBack, 'home')]] }, editId);
  }
  if (name === 'verify') return show(chat, l.verifyInfo(badgeName(l, u)), { inline_keyboard: [[btn(l.reqBlue, 'req:blue', 'primary'), btn(l.reqGold, 'req:gold')], [btn('« ' + l.btnBack, 'home')]] }, editId);
}

async function request(chat, from, l, kind, editId) {
  const u = userOf(from.id);
  const note = (t) => show(chat, t, { inline_keyboard: [[btn('« ' + l.btnBack, 'verify')]] }, editId);
  if (!u) return show(chat, l.noAccount, menu(l), editId);
  const rank = { '': 0, green: 0, blue: 1, gold: 2 }[badgeOf(u)];
  if (rank >= (kind === 'gold' ? 2 : 1)) return note(l.have);
  if (db.prepare("SELECT 1 FROM verify_requests WHERE user_id = ? AND status = 'new'").get(u.id)) return note(l.pending);
  if (db.prepare("SELECT 1 FROM verify_requests WHERE user_id = ? AND status = 'rejected' AND decided > ?").get(u.id, Date.now() - 7 * 86400000)) return note(l.cool);
  waiting.set(chat, { kind });
  return show(chat, l.ask(kind), { inline_keyboard: [[btn('✖ ' + l.cancel, 'home')]] }, editId);
}

async function onMessage(m) {
  const from = m.from;
  if (!from || from.is_bot || m.chat.type !== 'private') return;
  const l = T[langOf(from)];
  const text = String(m.text || '').trim();
  const chat = m.chat.id;
  const cmd = text.split(/[\s@]/)[0].toLowerCase();
  quiet(call('deleteMessage', { chat_id: chat, message_id: m.message_id })); // чат остаётся чистым

  const w = waiting.get(chat);
  if (w && !text.startsWith('/')) {
    if (text.length < 15) return show(chat, l.short + '\n\n' + l.ask(w.kind), { inline_keyboard: [[btn('✖ ' + l.cancel, 'home')]] });
    const u = userOf(from.id);
    waiting.delete(chat);
    if (!u) return screen('home', chat, from, l);
    db.prepare('INSERT INTO verify_requests (user_id, tg_id, kind, text, status, ts) VALUES (?, ?, ?, ?, ?, ?)').run(u.id, String(from.id), w.kind, text.slice(0, 500), 'new', Date.now());
    return show(chat, l.sent, back(l));
  }
  if (cmd === '/cancel') return screen('home', chat, from, l);
  if (cmd === '/login' || /^\/start\s+login/i.test(text)) return screen('login', chat, from, l);
  if (cmd === '/verify') return screen('verify', chat, from, l);
  if (cmd === '/me') return screen('me', chat, from, l);
  return screen('home', chat, from, l);
}

async function onCallback(q) {
  const from = q.from, chat = q.message && q.message.chat.id;
  quiet(call('answerCallbackQuery', { callback_query_id: q.id }));
  if (!chat || !from || from.is_bot) return;
  const l = T[langOf(from)], id = q.message.message_id;
  if (q.data === 'req:blue' || q.data === 'req:gold') return request(chat, from, l, q.data.slice(4), id);
  if (['home', 'login', 'verify', 'me', 'top', 'tourn'].includes(q.data)) return screen(q.data, chat, from, l, id);
}

// админка вызывает после решения по заявке
async function notifyDecision(req, approved, answer) {
  if (!token() || !req.tg_id) return;
  const l = T.ru; // у заявки нет языка, пишем по-русски и по-английски
  const en = T.en;
  try {
    const t1 = approved ? l.approved(req.kind) : l.rejected(esc(answer));
    const t2 = approved ? en.approved(req.kind) : en.rejected(esc(answer));
    await say(req.tg_id, t1 + '\n\n' + t2);
  } catch (e) { console.error('tgbot notify:', e.message); }
}

let running = false;
async function loop() {
  let offset = 0;
  while (running) {
    try {
      const ups = await call('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] });
      for (const u of ups) {
        offset = u.update_id + 1;
        try { if (u.message) await onMessage(u.message); else if (u.callback_query) await onCallback(u.callback_query); } catch (e) { console.error('tgbot update:', e.message); }
      }
    } catch (e) {
      if (e.code === 401) { console.error('tgbot: токен не подошёл, бот выключен'); running = false; return; }
      await new Promise((r) => setTimeout(r, e.code === 409 ? 30000 : 5000)); // 409: тот же бот читает другой процесс
    }
  }
}

async function start() {
  if (!token() || process.env.TG_POLL === '0' || running) return;
  running = true;
  try {
    await call('deleteWebhook', {});
    await call('setMyCommands', { commands: [{ command: 'start', description: 'Меню / Menu' }, { command: 'login', description: 'Войти на сайт / Sign in' }, { command: 'verify', description: 'Галочки / Badges' }, { command: 'me', description: 'Мой профиль / Profile' }] });
    await call('setMyDescription', { description: T.en.desc }); await call('setMyDescription', { description: T.ru.desc, language_code: 'ru' });
    await call('setMyShortDescription', { short_description: T.en.short2 }); await call('setMyShortDescription', { short_description: T.ru.short2, language_code: 'ru' });
  } catch (e) { console.error('tgbot setup:', e.message); }
  loop();
  console.log('Telegram-бот QuorChess слушает сообщения');
}
const stop = () => { running = false; };

// уведомление о заявке в друзья тем, кто вошёл через Telegram
async function notifyFriend(target, from) {
  if (!token() || !target || target.provider !== 'telegram' || !target.provider_id) return;
  try { const l = T.ru; await say(target.provider_id, l.friendReq(esc(from.display || from.username))); } catch (e) { console.error('tgbot friend:', e.message); }
}

// сообщение игроку о турнире (только тем, кто вошёл через Telegram)
async function notifyUser(u, text, path) {
  if (!token() || !u || u.provider !== 'telegram' || !u.provider_id) return;
  try { await say(u.provider_id, `${em('trophy')} ${esc(text)}`, { reply_markup: { inline_keyboard: [[{ text: 'QuorChess', url: site() + path }]] } }); } catch (e) { console.error('tgbot notify:', e.message); }
}

module.exports = { start, stop, consume, notifyDecision, notifyFriend, notifyUser };
