// быстрая проверка: сервер, регистрация, поиск (бот), ход, комната
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const WebSocket = require('ws');
const http = require('http');
const totp = require('../server/totp');

const PORT = 3499;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-'));
// поддельный Telegram: отдаёт очередь апдейтов и записывает всё, что бот отправил
const TGPORT = 3498;
const tgQueue = [], tgSent = [];
http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', async () => {
    const method = req.url.split('/').pop();
    let body = {}; try { body = JSON.parse(b || '{}'); } catch { /* пусто */ }
    let result = true;
    if (method === 'getUpdates') {
      for (let i = 0; i < 20 && !tgQueue.length; i++) await new Promise((r) => setTimeout(r, 100));
      result = tgQueue.splice(0);
    } else if (method === 'sendMessage') { tgSent.push(body); result = { message_id: 1 }; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, result }));
  });
}).listen(TGPORT);
let tgUp = 100;
const tgSay = (from, text) => tgQueue.push({ update_id: ++tgUp, message: { text, from: { id: from, first_name: 'Tg' + from, username: 'tguser' + from, language_code: 'ru' }, chat: { id: from, type: 'private' } } });
const tgTap = (from, data) => tgQueue.push({ update_id: ++tgUp, callback_query: { id: 'c' + tgUp, data, from: { id: from, first_name: 'Tg' + from, username: 'tguser' + from, language_code: 'ru' }, message: { chat: { id: from, type: 'private' } } } });
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
  env: { ...process.env, PORT, DATA_DIR: dataDir, ADMIN_HOST: 'admin.test', MAIL_OUTBOX: path.join(dataDir, 'outbox.jsonl'), TELEGRAM_BOT_TOKEN: 'test:token', TELEGRAM_API: 'http://127.0.0.1:3498', PUBLIC_URL: 'http://localhost:' + PORT }, stdio: 'inherit',
});
const H = { 'content-type': 'application/json', 'x-requested-with': 'qc' };
const base = 'http://localhost:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => { console.error('FAIL:', m); srv.kill(); process.exit(1); };

async function user(name) {
  const r = await fetch(base + '/api/register', { method: 'POST', headers: H, body: JSON.stringify({ username: name, email: name + '@test.local', password: 'password123', agree: true }) });
  if (!r.ok) fail('register ' + name + ' ' + (await r.text()));
  const cookie = r.headers.getSetCookie()[0].split(';')[0];
  const ws = new WebSocket('ws://localhost:' + PORT + '/ws', { headers: { cookie, origin: base } });
  const msgs = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d)));
  await new Promise((res) => ws.on('open', res));
  return { ws, msgs, cookie };
}
// запрос на скрытый админ-сайт: подставляем нужный Host (fetch этого не умеет)
function areq(method, p, { body, cookie, host = 'admin.test' } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { host, 'x-requested-with': 'qc' };
    if (data) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(data); }
    if (cookie) headers.cookie = cookie;
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => { let json = null; try { json = JSON.parse(b); } catch { /* не json */ } resolve({ status: res.statusCode, json, headers: res.headers, text: b }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const waitFor = async (msgs, pred, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const m = msgs.find(pred); if (m) return m; await sleep(100); }
  fail('timeout waiting message');
};

(async () => {
  await sleep(1500);
  const a = await user('alice_t');
  a.ws.send(JSON.stringify({ t: 'seek', base: 5, inc: 0 }));
  const st = await waitFor(a.msgs, (m) => m.t === 'start', 20000);
  console.log('game started', st.id);
  a.ws.send(JSON.stringify({ t: 'watch', id: st.id }));
  let s = (await waitFor(a.msgs, (m) => m.t === 'state')).game;
  const meWhite = s.white.username === 'alice_t';
  console.log('I am', meWhite ? 'white' : 'black', 'vs', meWhite ? s.black.display : s.white.display, meWhite ? s.black.rating : s.white.rating);
  if (meWhite) a.ws.send(JSON.stringify({ t: 'move', id: st.id, uci: 'e2e4' }));
  // ждём ход бота
  const botMoved = await (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      const last = [...a.msgs].reverse().find((m) => m.t === 'state');
      if (last && last.game.uci.length >= (meWhite ? 2 : 1)) return last.game;
      await sleep(200);
    }
    return null;
  })();
  if (!botMoved) fail('bot did not move');
  console.log('uci:', botMoved.uci.join(' '));
  if (!meWhite) a.ws.send(JSON.stringify({ t: 'move', id: st.id, uci: botMoved.uci.length ? 'e7e5' : 'e7e5' }));
  // античит: сервер не принимает нелегальные, чужие и мусорные ходы
  const bad = ['a1h8', 'xx', 'e2e4e4', '', 'a1a1', 'e8e1', 'h7h8q', 'e1e8', 'a2a5', 'b1b3'];
  for (const u of bad) a.ws.send(JSON.stringify({ t: 'move', id: st.id, uci: u }));
  a.ws.send(JSON.stringify({ t: 'move', id: st.id, uci: { from: 'e2', to: 'e4' } }));
  a.ws.send(JSON.stringify({ t: 'move', id: st.id }));
  await sleep(1500);
  const live2 = (await (await fetch(base + '/api/game/' + st.id)).json()).game;
  const { Chess: Ch } = require('chess.js');
  const rp = new Ch();
  for (const u of live2.uci) { try { rp.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { fail('server accepted illegal move ' + u); } }
  if (live2.uci.some((u) => ['a1h8', 'e8e1', 'a1a1', 'xx'].includes(u))) fail('bad move in game');
  // часы считает сервер: при отключённом интернете время идёт, а не стоит
  const clk = live2.running ? live2 : null;
  console.log('anticheat ok, moves', live2.uci.length);
  // жалоба на соперника из партии: один раз, повтор отклоняется
  const rep1 = await fetch(base + '/api/report', { method: 'POST', headers: { ...H, cookie: a.cookie }, body: JSON.stringify({ game: st.id, reason: 'cheat', text: 'подозрительно быстрые ходы' }) });
  if (rep1.status !== 200) fail('report ' + rep1.status);
  const rep2 = await fetch(base + '/api/report', { method: 'POST', headers: { ...H, cookie: a.cookie }, body: JSON.stringify({ game: st.id, reason: 'abuse' }) });
  if (rep2.status !== 409) fail('duplicate report allowed');
  const rep3 = await fetch(base + '/api/report', { method: 'POST', headers: { ...H, cookie: a.cookie }, body: JSON.stringify({ game: 'ffffffffff', reason: 'abuse' }) });
  if (rep3.status !== 400) fail('report on foreign game allowed');
  // нажал «Играть» посреди партии: сервер возвращает в неё, а не молчит
  a.msgs.length = 0;
  a.ws.send(JSON.stringify({ t: 'seek', base: 5, inc: 0 }));
  const back = await waitFor(a.msgs, (m) => m.t === 'resume' && m.id === st.id, 3000).catch(() => null);
  if (!back) fail('seek during game did not resume');
  a.ws.send(JSON.stringify({ t: 'abort', id: st.id }));

  // комната
  const h = await user('host_t'), g = await user('guest_t');
  h.ws.send(JSON.stringify({ t: 'room-create', title: 'Test', base: 5, inc: 0, open: true }));
  const rc = await waitFor(h.msgs, (m) => m.t === 'room-created');
  g.ws.send(JSON.stringify({ t: 'room-join', code: rc.room.code }));
  await waitFor(g.msgs, (m) => m.t === 'room-joined');
  const peer = await waitFor(h.msgs, (m) => m.t === 'room-peer');
  h.ws.send(JSON.stringify({ t: 'room-msg', to: peer.id, data: { hello: 1 } }));
  await waitFor(g.msgs, (m) => m.t === 'room-data' && m.data.hello === 1);
  g.ws.send(JSON.stringify({ t: 'room-msg', data: { move: 'e2e4' } }));
  await waitFor(h.msgs, (m) => m.t === 'room-data' && m.data.move === 'e2e4');
  const list = await (await fetch(base + '/api/rooms')).json();
  if (list.rooms.length !== 1) fail('rooms list');
  console.log('room code', rc.room.code, 'relay ok');

  // публичный сайт: админки нет вообще
  for (const ck of [undefined, a.cookie]) {
    const pub = await fetch(base + '/api/admin/stats', { headers: ck ? { cookie: ck } : {} });
    if (pub.status !== 404) fail('admin API visible on public host: ' + pub.status);
  }
  // вход по почте
  const li = await fetch(base + '/api/login', { method: 'POST', headers: H, body: JSON.stringify({ username: 'ALICE_T@test.local', password: 'password123' }) });
  if (li.status !== 200) fail('login by email ' + li.status);
  const dup = await fetch(base + '/api/register', { method: 'POST', headers: H, body: JSON.stringify({ username: 'other_t', email: 'alice_t@test.local', password: 'password123', agree: true }) });
  if (dup.status !== 409) fail('duplicate email allowed');
  const noAgree = await fetch(base + '/api/register', { method: 'POST', headers: H, body: JSON.stringify({ username: 'noagree_t', email: 'noagree@test.local', password: 'password123' }) });
  if (noAgree.status !== 400) fail('registration without consent allowed');
  const nomail = await fetch(base + '/api/register', { method: 'POST', headers: H, body: JSON.stringify({ username: 'nomail_t', email: 'x', password: 'password123', agree: true }) });
  if (nomail.status !== 400) fail('bad email allowed');

  // ---- скрытый админ-сайт ----
  const { execFileSync } = require('child_process');
  const mkAdmin = (login) => {
    const f = path.join(dataDir, login + '.txt');
    execFileSync(process.execPath, [path.join(__dirname, 'admin-create.js'), login, f], { env: { ...process.env, DATA_DIR: dataDir }, stdio: 'ignore' });
    const c = fs.readFileSync(f, 'utf8');
    return { password: /Пароль: (\S+)/.exec(c)[1], secret: /по времени»\): (\S+)/.exec(c)[1] };
  };
  const sq = mkAdmin('sqlen'), lk = mkAdmin('locky');
  const step = () => Math.floor(Date.now() / 30000);
  const page = await areq('GET', '/');
  if (page.status !== 200 || !page.text.includes('/main.js')) fail('admin page not served');
  if ((await fetch(base + '/main.js')).headers.get('content-type')?.includes('javascript')) fail('admin script reachable on public host');
  if ((await areq('GET', '/api/admin/stats')).status !== 403) fail('admin API open without login');
  // блокировка: 5 неверных кодов, потом даже верные данные не пускают
  for (let i = 0; i < 5; i++) {
    const r = await areq('POST', '/api/admin-login', { body: { login: 'locky', password: lk.password, code: '000000' } });
    if (r.status !== 401) fail('wrong code accepted ' + r.status);
  }
  const locked = await areq('POST', '/api/admin-login', { body: { login: 'locky', password: lk.password, code: totp.codeAt(lk.secret, step()) } });
  if (locked.status !== 429 || locked.json.code !== 'locked') fail('lock did not work ' + locked.status);
  // верный вход и защита от повторного кода
  const code = totp.codeAt(sq.secret, step());
  const ok = await areq('POST', '/api/admin-login', { body: { login: 'sqlen', password: sq.password, code } });
  if (ok.status !== 200) fail('admin login ' + ok.status);
  const ck = ok.headers['set-cookie'][0].split(';')[0];
  if (!/HttpOnly/i.test(ok.headers['set-cookie'][0]) || !/SameSite=Strict/i.test(ok.headers['set-cookie'][0])) fail('admin cookie flags');
  const replay = await areq('POST', '/api/admin-login', { body: { login: 'sqlen', password: sq.password, code } });
  if (replay.status !== 401) fail('code replay accepted ' + replay.status);
  const AF = (m, p, body) => areq(m, p, { body, cookie: ck });
  const stats = (await AF('GET', '/api/admin/stats')).json;
  if (!(stats.users >= 3)) fail('admin stats');
  const found = (await AF('GET', '/api/admin/users?q=' + encodeURIComponent('guest_t@test'))).json;
  if (found.users.length !== 1 || found.users[0].email !== 'guest_t@test.local') fail('admin search by email');
  const gid = found.users[0].id;
  if ((await AF('POST', `/api/admin/user/${gid}`, { action: 'rating', value: 1500 })).status !== 400) fail('rating without reason');
  const aw = await AF('POST', `/api/admin/user/${gid}`, { action: 'award', kind: 'skin', award: 'board:neon', reason: 'test' });
  if (aw.status !== 200) fail('award ' + aw.text);
  const meG = await (await fetch(base + '/api/me', { headers: { cookie: g.cookie } })).json();
  if (!meG.user.skins.includes('board:neon')) fail('skin not in /api/me');
  if (!((await AF('POST', '/api/admin/bots/generate', { count: 5 })).json.made >= 3)) fail('bot generate');

  // турнир: создать, записаться, встать в поиск
  const tc = (await AF('POST', '/api/admin/tournaments', { title: 'Test cup', start: Date.now() - 1000, minutes: 30, base: 3, inc: 0, bots: 0, rated: true })).json;
  if (!tc.id) fail('tournament create');
  const jn = await fetch(base + `/api/tournaments/${tc.id}/join`, { method: 'POST', headers: { ...H, cookie: g.cookie } });
  if (jn.status !== 200) fail('tournament join');
  const td = await (await fetch(base + `/api/tournaments/${tc.id}`)).json();
  if (td.tournament.status !== 'running' || td.standings.length !== 1) fail('tournament detail');
  g.ws.send(JSON.stringify({ t: 'seek', tid: tc.id }));
  const sk = await waitFor(g.msgs, (m) => m.t === 'seeking' && m.tid === tc.id);
  console.log('tournament seek ok', sk.base + '+' + sk.inc);
  const tlist = await (await fetch(base + '/api/tournaments')).json();
  if (tlist.upcoming.length < 2) fail('auto tournaments missing (' + tlist.upcoming.length + ')');
  const audit = (await AF('GET', '/api/admin/audit')).json;
  if (!audit.rows.some((x) => x.action === 'award' && x.admin_name === 'sqlen')) fail('audit missing');
  // игры и боты в админке
  const live = (await AF('GET', '/api/admin/games/live')).json;
  if (!Array.isArray(live.games)) fail('admin live games');
  const hist = (await AF('GET', '/api/admin/games?q=alice_t')).json;
  if (hist.total === undefined) fail('admin games list');
  if ((await AF('GET', '/api/admin/series')).json.days.length !== 14) fail('admin series');
  const ul = (await AF('GET', '/api/admin/users?filter=unverified')).json;
  if (!ul.users.every((x) => x.email && !x.email_verified)) fail('admin user filter');
  const bl = (await AF('GET', '/api/admin/users?bots=1')).json;
  if (!bl.total) fail('no bots');
  const b0 = bl.users[0];
  const ed = await AF('POST', `/api/admin/user/${b0.id}`, { action: 'edit', username: 'Renamed_Bot1', display: 'Renamed', wins: 5, losses: 3, draws: 2, games: 10 });
  if (ed.status !== 200) fail('bot edit ' + ed.text);
  const bd = (await AF('GET', `/api/admin/user/${b0.id}`)).json;
  if (bd.user.username !== 'Renamed_Bot1' || bd.user.games !== 10 || !bd.stats) fail('bot edit not saved');
  const one = await AF('POST', `/api/admin/user/${b0.id}`, { action: 'delete' });
  if (one.status !== 200) fail('bot delete ' + one.text);
  const noConf = await AF('POST', '/api/admin/bots/bulk', { action: 'delete' });
  if (noConf.status !== 400) fail('bulk delete without confirm');
  const before = (await AF('GET', '/api/admin/users?bots=1')).json.total;
  const sel = (await AF('GET', '/api/admin/users?bots=1')).json.users.slice(0, 3).map((x) => x.id);
  const bulk = (await AF('POST', '/api/admin/bots/bulk', { action: 'delete', ids: sel })).json;
  if (bulk.done !== 3) fail('bulk delete selected ' + JSON.stringify(bulk));
  const shift = (await AF('POST', '/api/admin/bots/bulk', { action: 'shift', value: 50, ids: [] })).status;
  const all = await AF('POST', '/api/admin/bots/bulk', { action: 'delete', confirm: 'УДАЛИТЬ' });
  if (all.status !== 200) fail('delete all bots ' + all.text);
  if ((await AF('GET', '/api/admin/users?bots=1')).json.total !== all.json.skipped) fail('bots remain after delete all (' + before + ' before, shift ' + shift + ')');
  // Telegram-бот: регистрация, вход по одноразовой ссылке, заявка на галочку
  tgSay(777, '/start');
  const waitSent = async (pred) => { for (let i = 0; i < 60; i++) { const m = tgSent.find(pred); if (m) return m; await sleep(100); } fail('bot did not answer'); };
  await waitSent((m) => m.chat_id === 777 && /QuorChess/.test(m.text) && m.reply_markup);
  tgTap(777, 'login');
  const lm = await waitSent((m) => m.chat_id === 777 && m.reply_markup?.inline_keyboard?.[0]?.[0]?.url?.includes('/api/auth/tg?t='));
  const link = lm.reply_markup.inline_keyboard[0][0].url;
  const l1 = await fetch(link, { redirect: 'manual' });
  const tgCookie = (l1.headers.getSetCookie()[0] || '').split(';')[0];
  if (!tgCookie.startsWith('qc=')) fail('tg link did not log in');
  const meTg = await (await fetch(base + '/api/me', { headers: { cookie: tgCookie } })).json();
  if (!meTg.user || meTg.user.username !== 'tguser777') fail('tg account not created');
  const l2 = await fetch(link, { redirect: 'manual' });
  if ((l2.headers.getSetCookie()[0] || '').startsWith('qc=') || !/login/.test(l2.headers.get('location') || '')) fail('tg link reusable');
  if ((await fetch(base + '/api/auth/tg?t=' + 'a'.repeat(48), { redirect: 'manual' })).headers.getSetCookie().length) fail('fake tg token accepted');
  if ((await (await fetch(base + '/api/user/tguser777')).json()).user.badge !== 'green') fail('telegram account should have green badge');
  tgTap(777, 'req:blue');
  await waitSent((m) => m.chat_id === 777 && /одним сообщением/.test(m.text));
  tgSay(777, 'коротко');
  await waitSent((m) => m.chat_id === 777 && /подробнее/.test(m.text));
  tgSay(777, 'Я тренер по шахматам, веду канал на 10 тысяч подписчиков');
  await waitSent((m) => m.chat_id === 777 && /Заявка отправлена/.test(m.text));
  tgTap(777, 'req:blue');
  await waitSent((m) => m.chat_id === 777 && /на рассмотрении/.test(m.text));
  const vr = (await AF('GET', '/api/admin/verify')).json;
  if (vr.requests.length !== 1 || vr.requests[0].kind !== 'blue') fail('verify request not listed');
  const dec = await AF('POST', `/api/admin/verify/${vr.requests[0].id}`, { approve: true, answer: 'ок' });
  if (dec.status !== 200) fail('verify approve ' + dec.text);
  await waitSent((m) => m.chat_id === '777' || (m.chat_id === 777 && /одобрена/.test(m.text)) || /одобрена/.test(m.text));
  if ((await (await fetch(base + '/api/user/tguser777')).json()).user.badge !== 'blue') fail('blue badge not set');
  if ((await AF('POST', `/api/admin/verify/${vr.requests[0].id}`, { approve: false })).status !== 400) fail('verify decided twice');
  const gold = await AF('POST', `/api/admin/user/${(await AF('GET', '/api/admin/users?q=tguser777')).json.users[0].id}`, { action: 'badge', value: 'gold' });
  if (gold.status !== 200) fail('admin badge');
  if ((await (await fetch(base + '/api/user/tguser777')).json()).user.badge !== 'gold') fail('gold badge not set');
  const lb = (await (await fetch(base + '/api/leaderboard')).json()).users;
  if (!lb.some((x) => x.username === 'tguser777')) fail('new player without games missing from leaderboard');
  const jsH = (await fetch(base + '/js/util.js')).headers.get('cache-control');
  if (jsH !== 'no-cache') fail('js cache header ' + jsH);
  // друзья, приглашение, чат
  const FR = (m, name, who) => fetch(base + '/api/friends/' + name, { method: m, headers: { ...H, cookie: who.cookie } });
  if ((await (await FR('POST', 'guest_t', h)).json()).status !== 'out') fail('friend request');
  if ((await (await fetch(base + '/api/friends/status/host_t', { headers: { ...H, cookie: g.cookie } })).json()).status !== 'in') fail('incoming status');
  if ((await (await FR('POST', 'host_t', g)).json()).status !== 'friends') fail('friend accept');
  const fl = await (await fetch(base + '/api/friends', { headers: { ...H, cookie: h.cookie } })).json();
  if (fl.friends.length !== 1 || !fl.friends[0].online) fail('friend list ' + JSON.stringify(fl));
  g.msgs.length = 0; h.msgs.length = 0;
  h.ws.send(JSON.stringify({ t: 'invite', to: 'guest_t', base: 5, inc: 0 }));
  const inv = await waitFor(g.msgs, (m) => m.t === 'invite');
  if (inv.from.username !== 'host_t') fail('invite sender');
  g.ws.send(JSON.stringify({ t: 'invite-accept', from: 'host_t' }));
  const sg = await waitFor(g.msgs, (m) => m.t === 'start'), sh = await waitFor(h.msgs, (m) => m.t === 'start');
  if (sg.id !== sh.id) fail('invite game ids differ');
  h.ws.send(JSON.stringify({ t: 'chat', id: sg.id, text: 'привет <b>друг</b>' }));
  const ch = await waitFor(g.msgs, (m) => m.t === 'chat');
  if (ch.text.includes('<')) fail('chat not sanitized');
  await sleep(1400);
  h.ws.send(JSON.stringify({ t: 'chat', id: sg.id, text: 'ты сука, fuck you, спасибо за игру' }));
  const ch2 = await waitFor(g.msgs, (m) => m.t === 'chat' && m.text !== ch.text);
  if (/сука|fuck/i.test(ch2.text) || !ch2.text.includes('спасибо')) fail('chat filter: ' + ch2.text);
  if ((await (await FR('DELETE', 'guest_t', h)).json()).status !== 'none') fail('friend remove');

  // турнир: призы, сетка, правка
  const tp = (await AF('POST', '/api/admin/tournaments', { title: 'Prize cup', start: Date.now() - 1000, minutes: 30, base: 3, inc: 0, bots: 0, rated: true, info: 'Играем быстро', prizes: [{ place: 1, type: 'text', value: 'Чемпион теста' }, { place: 2, type: 'skin', value: 'board:gold' }, { place: 3, type: 'skin', value: 'bad value' }] })).json;
  const pd = (await AF('GET', '/api/admin/tournaments/' + tp.id)).json;
  if (pd.tournament.prizes.length !== 2 || pd.tournament.info !== 'Играем быстро') fail('tournament prizes ' + JSON.stringify(pd.tournament.prizes));
  if ((await AF('PATCH', '/api/admin/tournaments/' + tp.id, { title: 'Prize cup 2', minutes: 45 })).status !== 200) fail('tournament patch');
  if ((await AF('POST', `/api/admin/tournaments/${tp.id}/players`, { action: 'add', username: 'guest_t' })).status !== 200) fail('grid add');
  if ((await AF('POST', `/api/admin/tournaments/${tp.id}/players`, { action: 'add', username: 'host_t' })).status !== 200) fail('grid add 2');
  const gp = (await AF('GET', '/api/admin/tournaments/' + tp.id)).json.players;
  const gId = gp.find((x) => x.username === 'guest_t').id, hId = gp.find((x) => x.username === 'host_t').id;
  await AF('POST', `/api/admin/tournaments/${tp.id}/players`, { action: 'points', userId: gId, points: 6, games: 3, wins: 3 });
  await AF('POST', `/api/admin/tournaments/${tp.id}/players`, { action: 'points', userId: hId, points: 4, games: 3, wins: 2 });
  if ((await AF('POST', `/api/admin/tournaments/${tp.id}/finalize`)).status !== 200) fail('tournament finalize');
  const gprof = await (await fetch(base + '/api/user/guest_t')).json();
  if (!gprof.badges.some((x) => x.value === 'Чемпион теста')) fail('text prize not awarded');
  const hme = await (await fetch(base + '/api/me', { headers: { cookie: h.cookie } })).json();
  if (!hme.user.skins.includes('board:gold')) fail('skin prize not awarded');
  console.log('friends+tournament prizes ok');
  // турнир по сетке: жеребьёвка, уведомления, автоматическое создание партии двум игрокам онлайн
  h.ws.send(JSON.stringify({ t: 'abort', id: sg.id }));
  await sleep(500);
  const sw = (await AF('POST', '/api/admin/tournaments', { title: 'Swiss test', start: Date.now() + 600000, minutes: 60, base: 3, inc: 0, bots: 0, rated: false, format: 'swiss', rounds: 1, maxPlayers: 4 })).json;
  for (const who of [h, g]) if ((await fetch(base + `/api/tournaments/${sw.id}/join`, { method: 'POST', headers: { ...H, cookie: who.cookie } })).status !== 200) fail('swiss join');
  h.msgs.length = 0; g.msgs.length = 0;
  if ((await AF('POST', `/api/admin/tournaments/${sw.id}/round`, { action: 'start' })).status !== 200) fail('swiss start');
  const noteS = await waitFor(h.msgs, (m) => m.t === 'tourn-note' && m.kind === 'start', 15000);
  if (noteS.tid !== sw.id) fail('tourn-note tid');
  const startG = await waitFor(g.msgs, (m) => m.t === 'start', 15000);
  const sd = await (await fetch(base + `/api/tournaments/${sw.id}`, { headers: { cookie: g.cookie } })).json();
  if (!sd.rounds.length || !sd.myPair || sd.myPair.status !== 'play' || sd.myPair.gameId !== startG.id) fail('swiss pairing ' + JSON.stringify(sd.myPair));
  if ((await fetch(base + `/api/tournaments/${sw.id}/join`, { method: 'POST', headers: { ...H, cookie: a.cookie } })).status !== 400) fail('join after seeding');
  console.log('swiss tournament live ok');
  // своя картинка для аккаунта из админки
  const avUser = (await AF('GET', '/api/admin/users?q=guest_t')).json.users[0];
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
  const up = (buf, type) => new Promise((resolve) => {
    const rq = http.request({ host: '127.0.0.1', port: PORT, path: `/api/admin/user/${avUser.id}/avatar`, method: 'POST', headers: { host: 'admin.test', 'x-requested-with': 'qc', 'content-type': type, 'content-length': buf.length, cookie: ck } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    rq.end(buf);
  });
  if ((await up(png, 'image/png')) !== 200) fail('admin avatar upload');
  if ((await up(Buffer.alloc(300, 7), 'image/png')) !== 400) fail('admin avatar fake png accepted');
  const avp = await (await fetch(base + '/api/user/guest_t')).json();
  if (!String(avp.user.avatar).startsWith('/avatars/' + avUser.id + '.png')) fail('avatar not saved ' + avp.user.avatar);
  if ((await areq('GET', '/avatars/' + avUser.id + '.png')).status !== 200) fail('avatar not served on admin host');
  console.log('admin avatar ok');
  // приложение: service worker и manifest
  const swr = await fetch(base + '/sw.js');
  const swt = await swr.text();
  if (swr.status !== 200 || !swt.includes('PRECACHE') || !swt.includes('/vendor/stockfish/') || !(swr.headers.get('content-type') || '').includes('javascript')) fail('sw.js');
  const mf = await (await fetch(base + '/manifest.webmanifest')).json();
  if (mf.display !== 'standalone' || !mf.icons.some((i) => i.purpose === 'maskable')) fail('manifest');
  for (const ic of mf.icons) if ((await fetch(base + ic.src)).status !== 200) fail('icon ' + ic.src);
  // для поисковиков
  const rob = await (await fetch(base + '/robots.txt')).text();
  if (!rob.includes('Disallow: /api/') || !rob.includes('Sitemap:')) fail('robots.txt');
  const sm = await (await fetch(base + '/sitemap.xml')).text();
  if (!sm.includes('<urlset') || !sm.includes('/leaders')) fail('sitemap.xml');
  const idx = await (await fetch(base + '/')).text();
  if (!idx.includes('name="description"') || !idx.includes('QuorChess')) fail('index meta');
  // жалобы видны в админке
  const rl = (await AF('GET', '/api/admin/reports')).json;
  if (rl.pending < 1 || rl.reports[0].reason !== 'cheat') fail('reports in admin');
  if ((await AF('POST', `/api/admin/reports/${rl.reports[0].id}`, { action: 'done' })).status !== 200) fail('report close');
  // забыл пароль: письмо, ссылка, новый пароль, старый не работает, ссылка одноразовая
  const outbox = path.join(dataDir, 'outbox.jsonl');
  const mails = () => (fs.existsSync(outbox) ? fs.readFileSync(outbox, 'utf8').trim().split(String.fromCharCode(10)).filter(Boolean).map((x) => JSON.parse(x)) : []);
  const mailsBefore = mails().length;
  const fg = await fetch(base + '/api/forgot', { method: 'POST', headers: H, body: JSON.stringify({ email: 'nobody@test.local' }) });
  if (fg.status !== 200 || mails().length !== mailsBefore) fail('forgot unknown email must be silent');
  const fg2 = await fetch(base + '/api/forgot', { method: 'POST', headers: H, body: JSON.stringify({ email: 'alice_t@test.local' }) });
  if (fg2.status !== 200) fail('forgot');
  const mailR = mails().filter((m) => m.subject.includes('новый пароль')).pop();
  const tokenR = /reset\?token=([a-f0-9]+)/.exec(mailR.text)[1];
  if ((await fetch(base + '/reset?token=' + tokenR)).status !== 200) fail('reset page');
  if ((await fetch(base + '/api/reset', { method: 'POST', headers: H, body: JSON.stringify({ token: tokenR, password: 'short' }) })).status !== 400) fail('weak password reset');
  if ((await fetch(base + '/api/reset', { method: 'POST', headers: H, body: JSON.stringify({ token: tokenR, password: 'brandnewpass1' }) })).status !== 200) fail('reset');
  if ((await fetch(base + '/api/reset', { method: 'POST', headers: H, body: JSON.stringify({ token: tokenR, password: 'another12345' }) })).status !== 400) fail('reset token reusable');
  if ((await fetch(base + '/api/login', { method: 'POST', headers: H, body: JSON.stringify({ username: 'alice_t', password: 'password123' }) })).status === 200) fail('old password still works');
  if ((await fetch(base + '/api/login', { method: 'POST', headers: H, body: JSON.stringify({ username: 'alice_t', password: 'brandnewpass1' }) })).status !== 200) fail('new password login');
  console.log('password reset + reports ok');
  // резервные копии: создать, увидеть в списке, скачать, чужое имя не отдаётся
  const bk = await AF('POST', '/api/admin/backups', {});
  if (bk.status !== 200) fail('backup create ' + bk.text);
  const bkl = (await AF('GET', '/api/admin/backups')).json.backups;
  if (!bkl.length || bkl[0].size < 4096) fail('backup list');
  const dl = await AF('GET', '/api/admin/backups/file?name=' + bkl[0].name);
  if (dl.status !== 200 || !dl.text.startsWith('SQLite format 3')) fail('backup download');
  if ((await AF('GET', '/api/admin/backups/file?name=' + encodeURIComponent('../quorchess.db'))).status !== 404) fail('backup path traversal');
  console.log('backups ok');
  // заявки ботам: с плашкой «бот» нельзя, без плашки уходит (бот отклонит позже)
  await AF('POST', '/api/admin/bot', { username: 'FrBotShown', rating: 1300, showBot: true });
  await AF('POST', '/api/admin/bot', { username: 'FrBotHidden', rating: 1300 });
  if ((await FR('POST', 'FrBotShown', h)).status !== 400) fail('friend request to shown bot allowed');
  if ((await (await FR('POST', 'FrBotHidden', h)).json()).status !== 'out') fail('friend request to hidden bot');
  if ((await (await fetch(base + '/api/friends/status/FrBotShown', { headers: { ...H, cookie: h.cookie } })).json()).status !== 'bot') fail('bot status');
  console.log('bot friend requests ok');
  console.log('telegram bot ok');
  console.log('admin+tournaments ok');
  console.log('SMOKE OK');
  srv.kill();
  process.exit(0);
})().catch((e) => fail(e.stack));
