import { app, go } from '../app.js';
import { api, esc, avatar, flag, COUNTRIES, badge, toast } from '../util.js';
import { t, getLang } from '../i18n.js';
import * as net from '../net.js';
import { rankOf } from '../rank.js';
import { openProfileEditor } from '../profileedit.js';

export async function mount(root, { params }) {
  let j;
  try { j = await api('/user/' + params[0]); } catch {
    root.innerHTML = `<div class="panel narrow"><h2>${t('prof.notFound')}</h2><p class="muted"><a href="/leaders" data-link>${t('nav.top')}</a></p></div>`;
    return;
  }
  const u = j.user;
  const mine = app.user && app.user.username === u.username;
  const loc = getLang() === 'ru' ? 'ru-RU' : 'en-GB';
  const since = new Date(u.created).toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  const rows = j.recent.map((g) => {
    const white = g.white_name === u.username;
    const r = g.result === '1/2-1/2' ? 'd' : (g.result === '1-0') === white ? 'w' : 'l';
    const opp = white ? g.black_name : g.white_name;
    const oppR = white ? g.black_rating : g.white_rating;
    return `<a href="/game/${g.id}" data-link><span class="res ${r}">${t('prof.res.' + r)}</span>
      <span class="grow"><b>${t('prof.vs')} ${esc(opp)}</b><span class="muted">${g.base}+${g.inc}, ${t('prof.oppRating')} ${oppR}</span></span>
      <span class="muted">${new Date(g.ended).toLocaleDateString(loc)}</span></a>`;
  }).join('');

  const trophies = (j.badges || []).map((b) => { const [pl, ...rest] = String(b.value).split('|'); const isMedal = /^[1-9]\d?$/.test(pl) && rest.length; const nameOf = (s) => esc(s.split(' / ')[getLang() === 'en' && s.includes(' / ') ? 1 : 0]); return `<div class="li"><span style="font-size:24px">${isMedal ? (['🥇', '🥈', '🥉'][pl - 1] || '🏅') : '★'}</span><span class="grow"><b>${isMedal ? nameOf(rest.join('|')) : esc(b.value)}</b><span class="muted">${isMedal ? pl + ' ' + t('prof.place') : t('tourn.prizeText')} · ${new Date(b.ts).toLocaleDateString(loc)}</span></span></div>`; }).join('');
  const medals = (j.badges || []).map((b) => { const [pl, ...rest] = String(b.value).split('|'); const m = /^[123]$/.test(pl) && rest.length; return `<span class="tag" style="font-size:13px;padding:3px 10px">${m ? ['🥇', '🥈', '🥉'][pl - 1] + ' ' + esc(rest.join('|').split(' / ')[getLang() === 'en' && rest.join('|').includes(' / ') ? 1 : 0]) : '★ ' + esc(b.value)}</span>`; }).join(' ');
  root.innerHTML = `
  <div class="panel">
    <div class="head">
      ${avatar(u.avatar, 'lg')}
      <div style="flex:1;min-width:200px">
        <h1>${esc(u.display)}${badge(u.badge)} ${u.bot ? `<span class="tag-bot">${t('ui.bot')}</span>` : ''} ${flag(u.country)}</h1>
        <div class="muted"><i class="${u.online ? 'dot-on' : 'dot-off'}" style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:${u.online ? 'var(--green)' : '#ffffff33'}"></i>${u.online ? t('fr.online') : t('fr.offline')} · @${esc(u.username)}${u.country && COUNTRIES[u.country] ? ', ' + COUNTRIES[u.country] : ''}. ${t('prof.since')} ${since}</div>
        ${u.bio ? `<p style="margin:10px 0 0">${esc(u.bio)}</p>` : ''}
      </div>
      ${mine ? `<div class="row"><button id="editprof">${t('prof.edit')}</button><a class="btn ghost" href="/settings" data-link>${t('nav.settings')}</a></div>` : (app.user && !u.bot ? '<div class="row" id="frbtn"></div>' : '')}
    </div>
    <div class="stats">
      <div class="stat"><b>${u.rating}</b><span>${t('ui.rating')} · ${t('rank.' + rankOf(u.rating))}</span></div>
      <div class="stat"><b>${u.games}</b><span>${t('prof.games')}</span></div>
      <div class="stat"><b>${u.wins}</b><span>${t('prof.wins')}</span></div>
      <div class="stat"><b>${u.draws}</b><span>${t('prof.draws')}</span></div>
    </div>
  </div>
  ${trophies ? `<div class="panel"><h2>${t('prof.trophies')}</h2><div class="list">${trophies}</div></div>` : ''}
  <div class="panel"><h2>${t('prof.recent')}</h2><div class="list">${rows || `<div class="empty">${t('prof.none')}</div>`}</div></div>`;

  root.querySelector('#editprof')?.addEventListener('click', () => openProfileEditor(() => go(location.pathname, true)));
  // кнопки дружбы
  const box = root.querySelector('#frbtn');
  if (box) {
    const draw = async () => {
      let st = 'none';
      try { st = (await api('/friends/status/' + u.username)).status; } catch { /* не вошёл */ }
      box.innerHTML = st === 'friends' ? `<button data-inv>${t('fr.invite')}</button><button class="ghost" data-rm>${t('fr.remove')}</button>`
        : st === 'out' ? `<button class="ghost" data-rm>${t('fr.cancelReq')}</button>`
        : st === 'in' ? `<button data-add>${t('fr.accept')}</button><button class="ghost" data-rm>${t('fr.decline')}</button>`
        : `<button data-add>${t('fr.add')}</button>`;
    };
    box.addEventListener('click', async (e) => {
      try {
        if (e.target.closest('[data-add]')) await api('/friends/' + u.username, { method: 'POST' });
        else if (e.target.closest('[data-rm]')) await api('/friends/' + u.username, { method: 'DELETE' });
        else if (e.target.closest('[data-inv]')) { net.send({ t: 'invite', to: u.username, base: 5, inc: 0 }); return; }
        draw();
      } catch (ex) { toast(ex.message); }
    });
    draw();
  }
}
