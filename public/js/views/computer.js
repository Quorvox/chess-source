// Игра с ботом: всё считается в браузере, сервер не нужен
import { app, go } from '../app.js';
import { createGameUI } from '../gameui.js';
import { Chess } from '../board.js';
import { bestMove, hint, stop } from '../engine.js';
import { strength, LEVELS } from '../strength.js';
import { toast } from '../util.js';
import { t } from '../i18n.js';

export function mount(root) {
  const q = new URLSearchParams(location.search);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('qc_cpu') || '{}'); } catch { /* ok */ }
  const level = Math.min(10, Math.max(1, Number(q.get('level')) || saved.level || 4));
  const colorQ = ['w', 'b', 'r'].includes(q.get('color')) ? q.get('color') : saved.color || 'w';
  let ui = null, epoch = 0, thinking = false;

  function play() {
    const color = colorQ === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : colorQ;
    const lv = LEVELS[level - 1];
    const u = app.user;
    const me = u ? { display: u.display, username: u.username, avatar: u.avatar, country: u.country, rating: u.rating } : { display: t('you'), username: 'you', avatar: 'p1' };
    const bot = { display: t('cpu.botName', { n: lv.n, name: t('lvl.' + lv.n) }), username: 'bot', avatar: 'p2', rating: lv.elo };
    let uci = [], status = 'play', result = null, reason = null;
    epoch++;

    root.innerHTML = `<div class="page-h"><div><h1>${t('play.cpu')}</h1><p>${t('cpu.levelInfo', { n: lv.n, name: t('lvl.' + lv.n), elo: lv.elo })}</p></div><a class="btn ghost" href="/play" data-link>${t('back')}</a></div><div id="g"></div>`;
    ui = createGameUI(root.querySelector('#g'), {
      move: (m) => userMove(m),
      resign: () => { if (status === 'play') { status = 'over'; result = color === 'w' ? '0-1' : '1-0'; reason = 'resign'; refresh(); } },
      draw: () => toast(t('cpu.noDraw')),
      abort: () => { epoch++; stop(); go('/play'); },
      leave: () => { epoch++; go('/play'); },
      takeback: () => takeback(),
      hint: () => getHint(),
      emote: (e) => botEmote(e),
    });
    function chessNow() {
      const c = new Chess();
      for (const x of uci) c.move({ from: x.slice(0, 2), to: x.slice(2, 4), promotion: x[4] });
      return c;
    }
    async function getHint() {
      if (status !== 'play' || thinking) return null;
      const c = chessNow();
      const m = await hint(c.fen());
      if (!m) return null;
      const mv = new Chess(c.fen()).move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      return { from: mv.from, to: mv.to, san: mv.san };
    }
    function botEmote(code) {
      ui.showEmote(color, code);
      if (Math.random() < 0.5) setTimeout(() => ui.showEmote(color === 'w' ? 'b' : 'w', ['thumb', 'think', 'wow', 'gg', 'clap'][Math.floor(Math.random() * 5)]), 1200 + Math.random() * 1500);
    }
    function refresh() {
      ui.update({ white: color === 'w' ? me : bot, black: color === 'w' ? bot : me, uci, base: 0, inc: 0, status, result, reason, wt: null, bt: null, running: null, rated: false }, color);
    }
    function checkEnd() {
      const c = chessNow();
      if (c.isCheckmate()) { status = 'over'; result = c.turn() === 'w' ? '0-1' : '1-0'; reason = 'mate'; }
      else if (c.isStalemate()) { status = 'over'; result = '1/2-1/2'; reason = 'stalemate'; }
      else if (c.isInsufficientMaterial()) { status = 'over'; result = '1/2-1/2'; reason = 'insufficient'; }
      else if (c.isThreefoldRepetition()) { status = 'over'; result = '1/2-1/2'; reason = 'repetition'; }
      else if (c.isDraw()) { status = 'over'; result = '1/2-1/2'; reason = 'fifty'; }
    }
    function userMove(m) {
      if (status !== 'play' || thinking) return false;
      const c = chessNow();
      if (c.turn() !== color) return false;
      try { c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }); } catch { return false; }
      uci.push(m);
      checkEnd();
      refresh();
      botTurn();
      return true;
    }
    async function botTurn() {
      if (status !== 'play') return;
      const c = chessNow();
      if (c.turn() === color) return;
      const my = epoch;
      thinking = true;
      const st = strength(lv.elo);
      let m = null;
      const t0 = Date.now();
      if (Math.random() >= st.random) m = await bestMove(c.fen(), st);
      if (!m) { const legal = c.moves({ verbose: true }); const r = legal[Math.floor(Math.random() * legal.length)]; m = r.from + r.to + (r.promotion || ''); }
      await new Promise((r) => setTimeout(r, Math.max(0, 450 - (Date.now() - t0))));
      thinking = false;
      if (my !== epoch || status !== 'play') return;
      uci.push(m);
      checkEnd();
      refresh();
    }
    function takeback() {
      if (thinking || status !== 'play' || !uci.length) return;
      const c = chessNow();
      uci = uci.slice(0, Math.max(0, uci.length - (c.turn() === color ? 2 : 1)));
      refresh();
      botTurn();
    }
    refresh();
    botTurn();
  }

  if (!q.get('level')) { go('/play', true); return; }
  try { localStorage.setItem('qc_cpu', JSON.stringify({ level, color: colorQ })); } catch { /* ok */ }
  play();
  return () => { epoch++; stop(); ui?.destroy(); };
}
