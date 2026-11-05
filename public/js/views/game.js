// Онлайн-партия (рейтинговая) и просмотр сыгранных партий
import { app, go } from '../app.js';
import { createGameUI } from '../gameui.js';
import { Chess } from '../board.js';
import { api, toast } from '../util.js';
import * as net from '../net.js';
import { t } from '../i18n.js';
import { openReport } from '../report.js';

function normalize(g) {
  if (g.uci) return g;
  const c = new Chess();
  if (g.pgn) c.loadPgn(g.pgn);
  g.uci = c.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
  g.wt = g.bt = null;
  g.running = null;
  return g;
}

export async function mount(root, { params }) {
  const id = params[0];
  let first;
  try { first = (await api('/game/' + id)).game; } catch {
    root.innerHTML = '<div class="panel narrow"><h2>Партия не найдена</h2><p class="muted">Возможно, ссылка устарела. <a href="/" data-link>На главную</a></p></div>';
    return;
  }
  root.innerHTML = '<div id="g"></div>';
  const colorOf = (g) => {
    const u = app.user;
    if (!u) return null;
    return g.white.username === u.username ? 'w' : g.black.username === u.username ? 'b' : null;
  };
  const ui = createGameUI(root.firstChild, {
    move: (uci) => { net.send({ t: 'move', id, uci }); return true; },
    resign: () => net.send({ t: 'resign', id }),
    draw: () => net.send({ t: 'draw', id }),
    drawNo: () => net.send({ t: 'draw-no', id }),
    abort: () => net.send({ t: 'abort', id }),
    ...(colorOf(first) && first.status === 'play' ? { emote: (e) => net.send({ t: 'emote', id, e }), chat: (text) => net.send({ t: 'chat', id, text }) } : {}),
    leave: () => go('/'),
    ...(colorOf(first) ? { report: () => openReport(id) } : {}),
  });
  const warn = (e) => { e.preventDefault(); e.returnValue = t('resume.leave'); };
  const show = (g) => {
    ui.update(normalize(g), colorOf(g));
    // идёт моя рейтинговая партия: браузер спросит перед закрытием вкладки
    window.removeEventListener('beforeunload', warn);
    if (g.status === 'play' && colorOf(g) && (g.uci || []).length >= 2) window.addEventListener('beforeunload', warn);
  };
  show(first);

  const offs = [net.on('emote', (m) => { if (m.id === id) ui.showEmote(m.color, m.e); }), net.on('chat', (m) => { if (m.id === id) ui.showChat(m.color, m.text); }), net.on('notice', (m) => toast(t(m.m)))];
  if (first.status === 'play') {
    const watch = () => net.send({ t: 'watch', id });
    watch();
    offs.push(
      net.on('state', (m) => { if (m.game.id === id) show(m.game); }),
      net.on('open', watch),
      net.on('gone', async () => { try { show((await api('/game/' + id)).game); } catch { /* ok */ } }),
    );
  }
  return () => { offs.forEach((f) => f()); window.removeEventListener('beforeunload', warn); ui.destroy(); };
}
