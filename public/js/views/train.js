import { t } from '../i18n.js';
import { esc } from '../util.js';
import { GAMES } from '../studies.js';

const BOOKS = [
  { title: 'Chess Fundamentals', author: 'José Raúl Capablanca', q: 'Capablanca chess fundamentals' },
  { title: 'Common Sense in Chess', author: 'Emanuel Lasker', q: 'Lasker common sense in chess' },
  { title: 'The Game of Chess', author: 'Harold Murray / Howard Staunton', q: 'Staunton chess' },
];

export function mount(root) {
  const lessons = ['moves', 'values', 'rules', 'notation', 'mate', 'open', 'tactics', 'plan', 'endgame', 'mistakes', 'rating', 'study'].map((k) => `<details class="panel" style="margin:0"><summary style="cursor:pointer;font-weight:800">${t('train.l.' + k)}</summary><p class="muted" style="margin:10px 0 0">${t('train.l.' + k + '.t')}</p></details>`).join('');
  root.innerHTML = `
  <div class="page-h"><div><h1>${t('nav.train')}</h1><p>${t('train.sub')}</p></div><div class="row"><a class="btn ghost" href="/local" data-link>${t('play.local')}</a><a class="btn" href="/computer" data-link>${t('train.vsbot')}</a></div></div>

  <div class="panel"><h2>${t('train.basics')}</h2><div style="display:grid;gap:10px">${lessons}</div></div>

  <div class="panel"><h2>${t('train.games')}</h2>
    <div class="cards">${GAMES.map((g) => `<div class="panel"><h3>${t('game.' + g.id)}</h3><span class="muted">${esc(g.white)} — ${esc(g.black)}</span><span class="muted">${g.year}, ${esc(g.place)}</span>
      <a class="btn" href="/study/${g.id}" data-link>${t('train.watch')}</a></div>`).join('')}</div></div>

  <div class="panel"><h2>${t('train.books')}</h2><p class="muted" style="margin-top:0">${t('train.books.d')}</p>
    <div class="cards">${BOOKS.map((b) => `<div class="panel"><h3>${esc(b.title)}</h3><span class="muted">${esc(b.author)}</span>
      <a class="btn ghost" href="https://www.gutenberg.org/ebooks/search/?query=${encodeURIComponent(b.q)}" target="_blank" rel="noopener noreferrer">${t('train.find')}</a></div>`).join('')}</div></div>`;
}
