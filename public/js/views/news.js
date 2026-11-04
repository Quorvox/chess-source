// Новости: записи добавляет админ
import { api, esc } from '../util.js';
import { t, getLang } from '../i18n.js';

export async function mount(root) {
  root.innerHTML = `<div class="page-h"><div><h1>${t('nav.news')}</h1><p>${t('news.sub')}</p></div></div><div id="b" class="muted">${t('loading')}</div>`;
  const ru = getLang() === 'ru';
  const loc = ru ? 'ru-RU' : 'en-GB';
  try {
    const { news } = await api('/news');
    root.querySelector('#b').outerHTML = news.length
      ? `<div class="cards">${news.map((n) => `<div class="panel"><span class="muted">${new Date(n.ts).toLocaleDateString(loc, { dateStyle: 'long' })}</span><h3>${esc(ru ? n.title_ru : n.title_en)}</h3><span class="muted">${esc(ru ? n.body_ru : n.body_en)}</span></div>`).join('')}</div>`
      : `<div class="panel"><p class="muted" style="margin:0">${t('tourn.none')}</p></div>`;
  } catch { root.querySelector('#b').textContent = t('err.broken'); }
}
