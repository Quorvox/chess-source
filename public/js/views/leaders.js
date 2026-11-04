import { api, esc, avatar, flag, badge } from '../util.js';
import { t } from '../i18n.js';

export async function mount(root) {
  root.innerHTML = `<div class="page-h"><div><h1>${t('nav.top')}</h1><p>${t('top.sub')}</p></div></div>
    <div class="panel"><div id="t" class="muted">${t('loading')}</div></div>`;
  const { users } = await api('/leaderboard');
  root.querySelector('#t').outerHTML = users.length ? `<table>
    <thead><tr><th style="width:44px">#</th><th>${t('top.player')}</th><th>${t('prof.games')}</th><th>${t('prof.wins')}</th><th style="text-align:right">${t('ui.rating')}</th></tr></thead>
    <tbody>${users.map((u, i) => `<tr>
      <td class="num ${i < 3 ? 'rank-' + (i + 1) : 'muted'}">${i + 1}</td>
      <td class="pl"><a href="/u/${esc(u.username)}" data-link style="display:flex;align-items:center;gap:8px;color:var(--ink);min-width:0">${avatar(u.avatar, 'sm')}<b class="nm">${esc(u.display)}</b>${badge(u.badge)} ${u.bot ? `<span class="tag-bot">${t('ui.bot')}</span>` : ''} ${flag(u.country)}</a></td>
      <td class="num">${u.games}</td><td class="num">${u.wins}</td><td class="num" style="text-align:right"><b>${u.rating}</b></td></tr>`).join('')}</tbody></table>`
    : `<p class="muted">${t('top.empty')}</p>`;
}
