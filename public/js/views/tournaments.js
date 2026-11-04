import { api, esc } from '../util.js';
import { t, getLang } from '../i18n.js';

// заголовок хранится как «Русский / English», показываем нужную половину
export const tTitle = (s) => { const p = String(s).split(' / '); return getLang() === 'en' && p[1] ? p[1] : p[0]; };
export const fmtDate = (ts) => new Date(ts).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export async function mount(root) {
  root.innerHTML = `<div class="page-h"><div><h1>${t('nav.tourn')}</h1><p>${t('tourn.sub')}</p></div></div><div id="b" class="muted">${t('loading')}</div>`;
  let d;
  try { d = await api('/tournaments'); } catch { root.querySelector('#b').textContent = t('err.broken'); return; }

  const card = (x) => `<div class="panel"><div class="row" style="justify-content:space-between"><span class="tag">${t('tourn.status.' + x.status)}</span><span class="muted">${x.base}+${x.inc}${x.rated ? '' : ', ' + t('tourn.unrated')}</span></div>
    <h3>${esc(tTitle(x.title))}</h3>
    <span class="muted">${fmtDate(x.start)}</span><span class="muted">${x.players} ${t('tourn.players')}${x.prize ? ', ' + t('tourn.prize') + ': ' + esc(x.prize) : ''}</span>
    <a class="btn" href="/tournaments/${x.id}" data-link>${x.status === 'finished' ? t('tourn.results') : t('tourn.open')}</a></div>`;
  const sec = (key, arr) => (arr.length ? `<div class="panel"><h2>${t('tourn.' + key)}</h2><div class="cards">${arr.map(card).join('')}</div></div>` : '');
  root.querySelector('#b').outerHTML = (sec('running', d.running) + sec('upcoming', d.upcoming) + sec('finished', d.finished)) || `<div class="panel"><p class="muted" style="margin:0">${t('tourn.none')}</p></div>`;
}
