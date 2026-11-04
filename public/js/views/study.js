// Разбор знаменитой партии: те же доска и ходы, только без игры
import { createGameUI } from '../gameui.js';
import { Chess } from '../board.js';
import { GAMES } from '../studies.js';
import { t } from '../i18n.js';

export function mount(root, { params }) {
  const g = GAMES.find((x) => x.id === params[0]);
  if (!g) { root.innerHTML = `<div class="panel narrow"><h2>${t('err.404')}</h2><a href="/train" data-link>${t('nav.train')}</a></div>`; return; }
  const c = new Chess();
  c.loadPgn(g.pgn);
  const uci = c.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
  root.innerHTML = `<div class="page-h"><div><h1>${t('game.' + g.id)}</h1><p>${g.white} — ${g.black}, ${g.year}</p></div><a class="btn ghost" href="/train" data-link>${t('back')}</a></div><div id="g"></div>`;
  const ui = createGameUI(root.querySelector('#g'), { leave: () => {} });
  const P = (n) => ({ display: n, username: n, avatar: 'p1' });
  ui.update({ white: P(g.white), black: P(g.black), uci, base: 0, inc: 0, status: 'over', result: '1-0', reason: 'mate', wt: null, bt: null, running: null, rated: false, study: true }, null);
  return () => ui.destroy();
}
