import { t } from '../i18n.js';
import { api, esc, avatar, flag, badge } from '../util.js';
import { icon } from '../app.js';
import { toast } from '../util.js';

export async function mount(root) {
  const v = new URLSearchParams(location.search).get('verified');
  if (v !== null) { toast(t(v === '1' ? 'verified.ok' : 'verified.bad')); history.replaceState({}, '', '/'); }
  root.innerHTML = `
  <section class="hero">
    <div class="hero-art" aria-hidden="true">
      <div class="hboard"></div>
      <div class="hp cg-wrap k"><piece class="king black"></piece></div>
      <div class="hp cg-wrap q"><piece class="queen white"></piece></div>
      <div class="hp cg-wrap n"><piece class="knight white"></piece></div>
      <div class="hp cg-wrap b"><piece class="bishop black"></piece></div>
    </div>
    <div class="hero-text">
      <h1>${t('home.title')}</h1>
      <p>${t('home.sub')}</p>
      <div class="cta">
        <a class="btn big" href="/play" data-link>${t('home.play')}</a>
        <a class="btn big ghost" href="/computer" data-link>${t('home.bot')}</a>
      </div>
    </div>
  </section>
  <div class="strip">
    <div class="panel"><div class="stat-n" id="s-online">–</div><span class="muted">${t('home.online')}</span></div>
    <div class="panel"><div class="stat-n" id="s-top">–</div><span class="muted">${t('home.leader')}</span></div>
    <div class="panel"><div class="stat-n" id="s-live">–</div><span class="muted">${t('home.live')}</span></div>
  </div>
  <div class="feat">
    <div class="panel"><span class="ico" style="--h:38">${icon('play')}</span><div><b>${t('home.f.hints')}</b><span class="muted">${t('home.f.hints.d')}</span></div></div>
    <div class="panel"><span class="ico" style="--h:210">${icon('bot')}</span><div><b>${t('home.f.bots')}</b><span class="muted">${t('home.f.bots.d')}</span></div></div>
    <div class="panel"><span class="ico" style="--h:190">${icon('users')}</span><div><b>${t('home.f.rooms')}</b><span class="muted">${t('home.f.rooms.d')}</span></div></div>
    <div class="panel"><span class="ico" style="--h:275">${icon('trophy')}</span><div><b>${t('home.f.skins')}</b><span class="muted">${t('home.f.skins.d')}</span></div></div>
  </div>
  <div class="two">
    <div class="panel"><h2>${t('home.top')}</h2><div class="list" id="top5"><div class="empty">${t('loading')}</div></div><p style="margin:10px 0 0"><a href="/leaders" data-link>${t('home.all')}</a></p></div>
    <div class="panel"><h2>${t('home.liveGames')}</h2><div class="list" id="live"><div class="empty">${t('loading')}</div></div></div>
  </div>`;

  try {
    const [me, lead, live] = await Promise.all([api('/me'), api('/leaderboard'), api('/live')]);
    root.querySelector('#s-online').textContent = me.online;
    root.querySelector('#s-top').innerHTML = lead.users[0] ? `${esc(lead.users[0].display)} <small class="muted">${lead.users[0].rating}</small>` : '–';
    root.querySelector('#s-live').textContent = live.games.length;
    root.querySelector('#top5').innerHTML = lead.users.slice(0, 5).map((u, i) => `<a href="/u/${esc(u.username)}" data-link><span class="num muted" style="width:18px">${i + 1}</span>${avatar(u.avatar, 'sm')}<span class="grow"><b>${esc(u.display)}${badge(u.badge)} ${flag(u.country)}</b></span><span class="num">${u.rating}</span></a>`).join('') || `<div class="empty">${t('top.empty')}</div>`;
    root.querySelector('#live').innerHTML = live.games.map((g) => `<a href="/game/${g.id}" data-link><span class="grow"><b>${esc(g.white.display)} — ${esc(g.black.display)}</b><span class="muted">${g.base}+${g.inc}</span></span></a>`).join('') || `<div class="empty">${t('home.noLive')}</div>`;
  } catch { /* сеть */ }

}
