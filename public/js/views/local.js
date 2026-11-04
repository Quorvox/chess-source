// Двое за одним экраном: без сервера, без рейтинга, можно выйти когда угодно
import { createGameUI } from '../gameui.js';
import { Chess } from '../board.js';
import { t } from '../i18n.js';
import { app } from '../app.js';

export function mount(root) {
  let rot = false;
  try { rot = localStorage.getItem('qc_local_rot') === '1'; } catch { /* ok */ }
  let uci = [], status = 'play', result = null, reason = null;

  root.innerHTML = `<div class="page-h"><div><h1>${t('play.local')}</h1><p>${t('local.sub')}</p></div><a class="btn ghost" href="/play" data-link>${t('back')}</a></div>
    <div id="g"></div>`;

  const ui = createGameUI(root.querySelector('#g'), {
    move: (m) => userMove(m),
    resign: () => { if (status === 'play') { status = 'over'; result = uci.length % 2 === 0 ? '0-1' : '1-0'; reason = 'resign'; refresh(); } },
    draw: () => { if (status === 'play' && confirm(t('local.drawq'))) { status = 'over'; result = '1/2-1/2'; reason = 'agreed'; refresh(); } },
    abort: () => { uci = []; status = 'play'; refresh(); },
    takeback: () => { if (status === 'play' && uci.length) { uci.pop(); refresh(); } },
    leave: () => { uci = []; status = 'play'; result = reason = null; refresh(); },
  });

  const rotBox = document.createElement('label');
  rotBox.className = 'switch';
  rotBox.style.margin = '8px 0 0';
  rotBox.innerHTML = `<span>${t('local.rot')}</span><input type="checkbox" ${rot ? 'checked' : ''}>`;
  rotBox.querySelector('input').onchange = (e) => { rot = e.target.checked; try { localStorage.setItem('qc_local_rot', rot ? '1' : '0'); } catch { /* ok */ } refresh(); };
  ui.extra.append(rotBox);

  const chessNow = () => { const c = new Chess(); for (const x of uci) c.move({ from: x.slice(0, 2), to: x.slice(2, 4), promotion: x[4] }); return c; };
  function checkEnd() {
    const c = chessNow();
    if (c.isCheckmate()) { status = 'over'; result = c.turn() === 'w' ? '0-1' : '1-0'; reason = 'mate'; }
    else if (c.isStalemate()) { status = 'over'; result = '1/2-1/2'; reason = 'stalemate'; }
    else if (c.isInsufficientMaterial()) { status = 'over'; result = '1/2-1/2'; reason = 'insufficient'; }
    else if (c.isThreefoldRepetition()) { status = 'over'; result = '1/2-1/2'; reason = 'repetition'; }
    else if (c.isDraw()) { status = 'over'; result = '1/2-1/2'; reason = 'fifty'; }
  }
  function userMove(m) {
    if (status !== 'play') return false;
    const c = chessNow();
    try { c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }); } catch { return false; }
    uci.push(m);
    checkEnd();
    refresh();
    return true;
  }
  const who = (n, rating) => ({ display: n === 1 ? t('local.p1') : t('local.p2'), username: 'p' + n, avatar: n === 1 ? (app.user?.avatar || 'p1') : 'p2', rating });
  function refresh() {
    ui.update({
      white: who(1), black: who(2), uci, base: 0, inc: 0, status, result, reason, wt: null, bt: null, running: null, rated: false,
      local: true, orient: rot && uci.length % 2 === 1 ? 'b' : 'w',
    }, 'w');
  }
  refresh();
  return () => ui.destroy();
}
