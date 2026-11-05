import { api, esc, avatar, badge, toast } from './util.js';
import { tipOfDay } from './tips.js';
import { initPwa } from './pwa.js';
import * as net from './net.js';
import { applyPrefs } from './skins.js';
import { t, getLang, setLang } from './i18n.js';
import { sfx } from './sound.js';

export const app = { user: null, online: 0, hostRoom: null, active: null };

const ICON = {
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  puzzle: '<path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><circle cx="12" cy="12" r="4"/>',
  news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>',
  more: '<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>',
  swords: '<path d="m14.5 17.5 4 4 3-3-4-4"/><path d="M13 19 6 12l-3 3 7 7"/><path d="m5 3 7 7"/><path d="M3 5l3-3 7 7"/>',
};
export const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ''}</svg>`;

// группы меню: путь, ключ перевода, иконка, оттенок, на каких адресах пункт активен
const GROUPS = [
  { k: 'nav.g.play', items: [
    ['/play', 'nav.play', 'play', 42, ['/play', '/computer', '/local', '/game/']],
    ['/rooms', 'nav.friends', 'users', 190, ['/rooms', '/room/']],
    ['/tournaments', 'nav.tourn', 'calendar', 275, ['/tournaments']],
  ] },
  { k: 'nav.g.learn', items: [['/train', 'nav.train', 'book', 150, ['/train', '/study/']]] },
  { k: 'nav.g.club', items: [
    ['/friends', 'nav.myfriends', 'user', 170, ['/friends']],
    ['/leaders', 'nav.top', 'trophy', 38, ['/leaders', '/u/']],
    ['/news', 'nav.news', 'news', 340, ['/news']],
    ['/community', 'nav.community', 'chat', 215, ['/community']],
  ] },
];
const SETTINGS = ['/settings', 'nav.settings', 'sliders', 240, ['/settings']];
// нижняя панель на телефоне: самое частое, остальное в «Ещё»
const TABS = ['/play', '/train', '/leaders', '/tournaments'];

const routes = [
  [/^\/$/, 'home'], [/^\/news$/, 'news'], [/^\/play$/, 'play'], [/^\/train$/, 'train'], [/^\/community$/, 'community'], [/^\/tournaments$/, 'tournaments'], [/^\/tournaments\/(\d+)$/, 'tournament'],
  [/^\/computer$/, 'computer'], [/^\/friends$/, 'friends'], [/^\/local$/, 'local'], [/^\/study\/([a-z0-9-]+)$/, 'study'], [/^\/game\/([a-f0-9]+)$/, 'game'], [/^\/rooms$/, 'rooms'],
  [/^\/room\/([A-Za-z0-9]{6})$/, 'room'], [/^\/u\/([A-Za-z0-9_]+)$/, 'profile'], [/^\/leaders$/, 'leaders'],
  [/^\/settings$/, 'settings'], [/^\/reset$/, 'reset'], [/^\/login$/, 'auth'], [/^\/legal$/, 'legal'],
];

const view = document.getElementById('view');
let cleanup = null;
let token = 0;

export function go(path, replace = false) {
  document.querySelector('.modal.more')?.remove();
  if (path === location.pathname + location.search) return render();
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
  render();
}

export async function refreshMe() {
  try {
    const j = await api('/me');
    app.user = j.user;
    app.online = j.online;
  } catch { /* сервер недоступен */ }
  renderChrome();
}

const isOn = (match, path) => match.some((m) => path === m || (m.endsWith('/') && path.startsWith(m)));
const flatNav = () => [...GROUPS.flatMap((g) => g.items), SETTINGS].map(([p, k, i, h, match]) => ({ p, k, i, h, match }));

function renderChrome() {
  const path = location.pathname;
  const u = app.user;
  const link = (x) => `<a href="${x.p}" data-link class="${isOn(x.match, path) ? 'on' : ''}"><span class="ico" style="--h:${x.h}">${icon(x.i)}</span>${t(x.k)}</a>`;
  const to = (arr) => ({ p: arr[0], k: arr[1], i: arr[2], h: arr[3], match: arr[4] });
  document.getElementById('side').innerHTML = `
    <a class="brand" href="/" data-link><img src="/logo-new.svg" alt=""><span>Quor<b>Chess</b></span></a>
    <nav class="nav">
      ${GROUPS.map((g) => `<div class="grp">${t(g.k)}</div>${g.items.map((it) => link(to(it))).join('')}`).join('')}
      <div class="grp"></div>${link(to(SETTINGS))}
    </nav>
    <div class="side-foot">
      <div class="online"><i></i><span id="online-n">${app.online}</span>&nbsp;${t('nav.online')}</div>
      <div class="tipcard"><b>${t('side.tip')}</b>${esc(tipOfDay(getLang()))}</div>
      <div class="tgrow"><a href="https://t.me/QuorChess" target="_blank" rel="noopener noreferrer">${t('side.channel')}</a><a href="https://t.me/QuorChess_bot" target="_blank" rel="noopener noreferrer">${t('side.bot')}</a></div>
      ${u ? `<a class="me" href="/u/${esc(u.username)}" data-link>${avatar(u.avatar)}<span><b>${esc(u.display)}${badge(u.badge)}</b><small>${u.rating}</small></span></a>`
        : `<a class="btn" href="/login" data-link>${t('nav.login')}</a>`}
    </div>`;

  // телефон: верхняя полоска и нижняя панель
  document.getElementById('top').innerHTML = `<a class="logo" href="/" data-link><img src="/logo-new.svg" alt=""><span>Quor<b>Chess</b></span></a>
    <span class="top-r"><span class="online sm"><i></i>${app.online}</span>${u ? `<a href="/u/${esc(u.username)}" data-link class="top-me">${avatar(u.avatar, 'sm')}</a>` : `<a class="btn sm" href="/login" data-link>${t('nav.login')}</a>`}</span>`;
  const all = flatNav();
  const tabs = TABS.map((p) => all.find((x) => x.p === p));
  const moreOn = !tabs.some((x) => isOn(x.match, path)) && path !== '/';
  document.getElementById('tabs').innerHTML = tabs.map((x) => `<a href="${x.p}" data-link class="${isOn(x.match, path) ? 'on' : ''}">${icon(x.i)}<span>${t(x.k)}</span></a>`).join('')
    + `<button class="tab-more ${moreOn ? 'on' : ''}" data-more aria-label="${t('nav.more')}">${icon('more')}<span>${t('nav.more')}</span></button>`;
  document.getElementById('foot').textContent = 'QuorChess';
}

// лист «Ещё» на телефоне
function openMore() {
  document.querySelector('.modal.more')?.remove();
  const path = location.pathname;
  const u = app.user;
  const rest = flatNav().filter((x) => !TABS.includes(x.p));
  const m = document.createElement('div');
  m.className = 'modal more';
  m.innerHTML = `<div class="sheet">
    <div class="more-grid">${rest.map((x) => `<a href="${x.p}" data-link class="${isOn(x.match, path) ? 'on' : ''}"><span class="ico" style="--h:${x.h}">${icon(x.i)}</span><span>${t(x.k)}</span></a>`).join('')}</div>
    <div class="lang" style="margin-top:14px"><button data-lang="ru" class="${getLang() === 'ru' ? 'on' : ''}">Русский</button><button data-lang="en" class="${getLang() === 'en' ? 'on' : ''}">English</button></div>
    ${u ? '' : `<a class="btn big" href="/login" data-link style="width:100%;margin-top:14px">${t('nav.login')}</a>`}
  </div>`;
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('a[data-link]')) m.remove(); });
  document.body.append(m);
}

async function render() {
  const my = ++token;
  if (cleanup) { try { cleanup(); } catch { /* ok */ } cleanup = null; }
  const path = location.pathname;
  let name = null, params = [];
  for (const [re, n] of routes) { const m = re.exec(path); if (m) { name = n; params = m.slice(1); break; } }
  const TITLE_KEYS = { play: 'nav.play', train: 'nav.train', tournaments: 'nav.tourn', tournament: 'nav.tourn', leaders: 'nav.top', news: 'nav.news', community: 'nav.community', settings: 'nav.settings', friends: 'nav.myfriends', rooms: 'nav.friends' };
  if (name && TITLE_KEYS[name]) document.title = t(TITLE_KEYS[name]) + ' | QuorChess';
  else if (name === 'home') document.title = 'QuorChess: шахматы онлайн с рейтингом, ботами и турнирами';
  renderChrome();
  resumeBar();
  window.scrollTo(0, 0);
  if (!name) { view.innerHTML = `<div class="panel narrow"><h2>${t('err.404')}</h2><p class="muted"><a href="/" data-link>${t('err.home')}</a></p></div>`; return; }
  view.innerHTML = '';
  try {
    const mod = await import(`./views/${name}.js`);
    if (my !== token) return;
    const c = await mod.mount(view, { params });
    if (my !== token) { c?.(); return; }
    cleanup = c || null;
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="panel narrow"><h2>${t('err.broken')}</h2><p class="muted">${esc(e.message)}</p></div>`;
  }
}

document.addEventListener('click', (e) => {
  const lang = e.target.closest('[data-lang]');
  if (lang) { setLang(lang.dataset.lang); document.querySelector('.modal.more')?.remove(); render(); return; }
  if (e.target.closest('[data-more]')) { openMore(); return; }
  const a = e.target.closest('a[data-link]');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey || a.target) return;
  e.preventDefault();
  go(a.getAttribute('href'));
});
window.addEventListener('popstate', render);

net.on('online', (m) => { app.online = m.n; const el = document.getElementById('online-n'); if (el) el.textContent = m.n; });
// идущая рейтинговая партия: после ухода со страницы можно вернуться одной кнопкой
function resumeBar() {
  let bar = document.getElementById('resume-bar');
  const on = app.active && !location.pathname.endsWith('/game/' + app.active);
  if (!on) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'resume-bar'; document.body.append(bar); }
  bar.innerHTML = `<span>${t('resume.bar')}</span><a class="btn" href="/game/${app.active}" data-link>${t('resume.back')}</a>`;
}
export { resumeBar };
net.on('resume', (m) => { app.active = m.id; if (!location.pathname.endsWith('/game/' + m.id)) go('/game/' + m.id); });
net.on('start', (m) => { app.active = m.id; sfx.found(); go('/game/' + m.id); });
net.on('state', (m) => { if (m.game && m.game.id === app.active && m.game.status !== 'play') { app.active = null; resumeBar(); } });
// приглашения друзей сыграть
function inviteBar(m) {
  document.getElementById('invite-bar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'invite-bar';
  bar.innerHTML = `${avatar(m.from.avatar, 'sm')}<span><b>${esc(m.from.display)}</b> ${t('invite.title')} ${m.base}+${m.inc}</span><button data-yes>${t('invite.accept')}</button><button class="ghost" data-no>${t('invite.decline')}</button>`;
  const done = (accept) => { net.send({ t: accept ? 'invite-accept' : 'invite-decline', from: m.from.username }); bar.remove(); };
  bar.querySelector('[data-yes]').onclick = () => done(true);
  bar.querySelector('[data-no]').onclick = () => done(false);
  document.body.append(bar);
  sfx.challenge();
  setTimeout(() => bar.remove(), 60000);
}
net.on('invite', inviteBar);
net.on('tourn-note', (m) => {
  const name = String(m.title).split(' / ')[getLang() === 'en' ? 1 : 0] || m.title;
  const text = m.kind === 'start' ? t('tnote.start', { title: name }) : m.kind === 'round' ? (m.opp ? t('tnote.round', { round: m.round, rounds: m.rounds, opp: m.opp }) : t('tnote.bye', { round: m.round })) : t('tnote.finish', { title: name, place: m.place });
  document.getElementById('note-bar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'invite-bar';
  bar.className = 'note';
  bar.innerHTML = `<span>🏆 ${esc(text)}</span><a class="btn" href="/tournaments/${m.tid}" data-link>${t('tnote.open')}</a><button class="ghost" data-x>✕</button>`;
  bar.querySelector('[data-x]').onclick = () => bar.remove();
  bar.addEventListener('click', (e) => { if (e.target.closest('a')) bar.remove(); });
  document.getElementById('invite-bar')?.remove();
  document.body.append(bar);
  sfx.found();
  setTimeout(() => bar.remove(), 20000);
});
net.on('invite-sent', () => toast(t('invite.sent')));
net.on('friend-declined', (m) => toast(t('fr.botDeclined', { name: m.name })));
net.on('invite-error', (m) => toast(t(m.m)));
net.on('invite-declined', (m) => toast(t('invite.declined', { name: m.by })));
net.on('start', () => document.getElementById('invite-bar')?.remove());
net.on('gone', (m) => { if (m.id === app.active) { app.active = null; resumeBar(); } });
addEventListener('pointerdown', () => sfx.unlock(), { once: true });

applyPrefs();
initPwa();
await refreshMe();
net.connect();
render();
