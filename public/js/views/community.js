import { api } from '../util.js';
import { t } from '../i18n.js';

// Telegram-ссылку задаёт админ в настройках (пока пусто, показываем «скоро»)
export async function mount(root) {
  let tg = '';
  try { tg = (await api('/community')).telegram; } catch { /* сеть */ }
  const links = [
    { k: 'tg', url: tg || 'https://t.me/QuorChess' },
    { k: 'bot', url: 'https://t.me/QuorChess_bot' },
    { k: 'gh', url: 'https://github.com/Quorvox' },
    { k: 'site', url: 'https://quorvox.github.io/' },
  ];
  root.innerHTML = `
  <div class="page-h"><div><h1>${t('nav.community')}</h1><p>${t('comm.sub')}</p></div></div>
  <div class="cards">${links.map((l) => `<div class="panel"><h3>${t('comm.' + l.k)}</h3><span class="muted">${t('comm.' + l.k + '.d')}</span>
    ${l.url ? `<a class="btn" href="${l.url}" target="_blank" rel="noopener noreferrer">${t('comm.open')}</a>` : `<span class="tag" style="margin-top:auto;align-self:flex-start">${t('soon')}</span>`}</div>`).join('')}</div>`;
}
