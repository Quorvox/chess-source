// Общий экран партии: доска, часы, ходы, меню «три точки», полный экран, реакции.
// Используется онлайн-игрой, комнатами, игрой с ботом и разбором партий.
import { Chess, createBoard, dests, askPromotion, isPromotion } from './board.js';
import { esc, avatar, flag, fmtClock, toast, badge } from './util.js';
import { t } from './i18n.js';
import { getPrefs, setPrefs } from './skins.js';
import { moveSound, sfx } from './sound.js';
import { confetti } from './confetti.js';

const reasonText = (r) => (r ? t('reason.' + r) : '');

export const EMOTES = { gg: 'GG', thumb: '👍', laugh: '😂', think: '🤔', wow: '😱', fire: '🔥', clap: '👏', sad: '😢' };

const ICO = {
  max: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  min: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
  dots: '<circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.500 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k]}</svg>`;

const RES = {
  crown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 8l4.500 4L12 5l4.500 7L21 8l-2 11H5z"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.400" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v18"/><path d="M6 4h12l-2.500 4L18 12H6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.400" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
const DRAWS = ['agreed', 'stalemate', 'repetition', 'fifty', 'insufficient', 'timeout-vs-king'];
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };

export function createGameUI(root, cb) {
  root.innerHTML = `
  <div class="game">
    <div class="board-col">
      <div class="toolbar">
        <button class="icon-btn" data-tool="focus" title="${t('ui.focus')}" aria-label="${t('ui.focus')}">${svg('max')}</button>
        <span class="tb-space"></span>
        ${cb.emote ? `<button class="icon-btn" data-tool="emote" title="${t('ui.emotes')}" aria-label="${t('ui.emotes')}">${svg('smile')}</button>` : ''}
        <button class="icon-btn" data-tool="menu" title="${t('ui.menu')}" aria-label="${t('ui.menu')}">${svg('dots')}</button>
        <div class="popmenu" hidden></div>
        <div class="emotebar" hidden>${Object.entries(EMOTES).map(([k, e]) => `<button data-emote="${k}">${e}</button>`).join('')}</div>
      </div>
      <div class="pbar" data-pos="top"></div>
      <div class="board-wrap"><div class="board"></div><div class="badges"></div><div class="overlay" hidden></div></div>
      <div class="result-pill" hidden></div>
      <div class="pbar" data-pos="bottom"></div>
    </div>
    <aside class="side panel">
      <div class="status"></div>
      <div class="hintline" hidden></div>
      <div class="moves"></div>
      <div class="nav-btns">
        <button data-nav="first" title="${t('ui.first')}">⏮</button><button data-nav="prev" title="${t('ui.prev')}">◀</button>
        <button data-nav="next" title="${t('ui.next')}">▶</button><button data-nav="last" title="${t('ui.last')}">⏭</button>
      </div>
      <div class="offer" hidden></div>
      <div class="actions"></div>
      <div class="extra"></div>
      ${cb.chat ? `<div class="chat"><div class="chat-log" id="chatlog"></div><form id="chatform" autocomplete="off"><input id="chatin" maxlength="120" placeholder="${t('chat.ph')}"><button>${t('chat.send')}</button></form></div>` : ''}
    </aside>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const game = $('.game');
  const overlay = $('.overlay');
  let st = null, myColor = null, chess = new Chess(), plies = [], fens = [], view = null, flipped = false, recvAt = 0;
  let timer = null, lowPlayed = false, hint = null;
  const baseTitle = document.title;

  const cg = createBoard($('.board'), { movable: { free: false, events: { after: onAfter } }, events: {} });
  const ro = new ResizeObserver(() => cg.state.dom.bounds.clear());
  ro.observe($('.board-col'));

  function rebuild() {
    chess = new Chess();
    plies = [];
    fens = [chess.fen()];
    for (const u of st.uci) {
      const m = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      plies.push(m);
      fens.push(chess.fen());
    }
  }

  async function onAfter(from, to) {
    let promo = '';
    if (isPromotion(chess, from, to)) promo = await askPromotion(overlay, myColor);
    const ok = cb.move && cb.move(from + to + promo);
    if (ok === false) render();
  }

  const orientation = () => st && st.local ? ((st.orient === 'b') !== flipped ? 'black' : 'white') : (flipped ? (myColor === 'b' ? 'white' : 'black') : myColor === 'b' ? 'black' : 'white');

  // что взял этот цвет и перевес в материале
  function captured(color) {
    const sum = (c) => plies.filter((m) => m.color === c && m.captured).reduce((a, m) => a + VAL[m.captured], 0);
    const diff = sum(color) - sum(color === 'w' ? 'b' : 'w');
    const side = color === 'w' ? 'black' : 'white';
    const pcs = plies.filter((m) => m.color === color && m.captured).map((m) => m.captured).sort((a, b) => VAL[b] - VAL[a])
      .map((x) => `<span class="cg-wrap cp"><piece class="${NAME[x]} ${side}"></piece></span>`).join('');
    return pcs || diff > 0 ? `<span class="caps">${pcs}${diff > 0 ? `<b>+${diff}</b>` : ''}</span>` : '';
  }

  function barHtml(color) {
    const p = color === 'w' ? st.white : st.black;
    if (!p) return `<div class="who"><span class="av">?</span><b>${t('ui.waitOpp')}</b></div><div class="clock" data-c="${color}">--:--</div>`;
    return `<div class="who">${avatar(p.avatar)}<div><b>${esc(p.display || p.username)}</b>${badge(p.badge)} ${flag(p.country)}
      ${p.bot ? `<span class="tag-bot">${t('ui.bot')}</span>` : ''}<div class="sub">${p.rating ? p.rating : ''}${captured(color)}</div></div></div>
      <div class="clock" data-c="${color}">--:--</div>`;
  }

  function movesHtml() {
    let h = '';
    for (let i = 0; i < plies.length; i += 2) {
      h += `<div class="mrow"><span class="mn">${i / 2 + 1}.</span>`;
      for (const j of [i, i + 1]) if (plies[j]) h += `<span class="mv${(view ?? plies.length) === j + 1 ? ' cur' : ''}" data-ply="${j + 1}">${esc(plies[j].san)}</span>`;
      h += '</div>';
    }
    return h;
  }

  function statusText() {
    if (st.status === 'wait') return st.note ? t(st.note) : t('ui.waiting');
    if (st.status === 'play') {
      const mine = myColor && chess.turn() === myColor;
      return myColor ? (mine ? t('ui.yourTurn') : t('ui.oppTurn')) : t(chess.turn() === 'w' ? 'ui.whiteTurn' : 'ui.blackTurn');
    }
    if (st.status === 'aborted') return t('reason.aborted');
    const w = st.result === '1-0' ? t('ui.whiteWon') : st.result === '0-1' ? t('ui.blackWon') : t('ui.draw');
    let d = '';
    if (st.delta && myColor) { const v = st.delta[myColor]; d = ` · ${t('ui.rating')} ${v >= 0 ? '+' : ''}${v}`; }
    return `${w} (${reasonText(st.reason)})${d}`;
  }

  function kingSquare(color) {
    const b = chess.board();
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = b[r][f]; if (p && p.type === 'k' && p.color === color) return { r, f }; }
    return null;
  }

  // значки на королях и плашка с итогом
  function renderResult(live) {
    const box = $('.badges'), pill = $('.result-pill');
    box.innerHTML = '';
    const over = st.status === 'over' || st.status === 'aborted';
    if (!over || !live) { pill.hidden = true; return; }
    const draw = st.result === '1/2-1/2';
    const winner = st.result === '1-0' ? 'w' : st.result === '0-1' ? 'b' : null;
    const mine = myColor && winner ? (winner === myColor ? 'win' : 'lose') : 'neutral';
    const black = orientation() === 'black';
    const put = (color, cls, html) => {
      const k = kingSquare(color);
      if (!k) return;
      const d = document.createElement('div');
      d.className = 'badge ' + cls;
      d.style.left = ((black ? 7 - k.f : k.f) + 1) * 12.5 + '%';
      d.style.top = (black ? 7 - k.r : k.r) * 12.5 + '%';
      d.innerHTML = html;
      box.append(d);
    };
    let icon = RES.x;
    if (st.status === 'over') {
      if (draw || (DRAWS.includes(st.reason) && !winner)) {
        icon = '<b>½</b>';
        put('w', 'draw', '<b>½</b>'); put('b', 'draw', '<b>½</b>');
      } else if (winner) {
        const loser = winner === 'w' ? 'b' : 'w';
        icon = RES.crown;
        put(winner, 'win', RES.crown);
        if (st.reason === 'mate') put(loser, 'lose', '<b>#</b>');
        else if (st.reason === 'timeout') put(loser, 'lose', RES.clock);
        else put(loser, 'lose', RES.flag);
      }
    }
    pill.hidden = false;
    pill.className = 'result-pill ' + (st.status === 'aborted' || draw ? 'neutral' : mine);
    pill.innerHTML = `<span class="pi">${icon}</span><span>${esc(statusText())}</span>`;
  }

  function render() {
    if (!st) return;
    const idx = view ?? plies.length;
    const live = idx === plies.length;
    const canMove = live && st.status === 'play' && myColor && chess.turn() === myColor;
    const last = idx > 0 ? [plies[idx - 1].from, plies[idx - 1].to] : undefined;
    const o = orientation();
    cg.set({
      fen: fens[idx], orientation: o, lastMove: last,
      check: live && chess.isCheck() ? (chess.turn() === 'w' ? 'white' : 'black') : false,
      turnColor: idx % 2 === 0 ? 'white' : 'black',
      movable: { free: false, color: canMove ? (myColor === 'w' ? 'white' : 'black') : undefined, dests: canMove ? dests(chess) : new Map(), events: { after: onAfter } },
    });
    const topC = o === 'white' ? 'b' : 'w';
    $('.pbar[data-pos=top]').innerHTML = barHtml(topC);
    $('.pbar[data-pos=bottom]').innerHTML = barHtml(topC === 'w' ? 'b' : 'w');
    $('.moves').innerHTML = movesHtml();
    cg.state.dom.bounds.clear(); // панели игроков сдвигают доску, кэш положения надо сбросить
    $('.mv.cur')?.scrollIntoView({ block: 'nearest' });
    $('.status').innerHTML = (st.status === 'play' ? `<i class="dot ${chess.turn()}"></i>` : '') + esc(statusText());
    renderResult(live);
    tick();

    const offer = $('.offer');
    if (st.status === 'play' && st.drawFrom && myColor && st.drawFrom !== myColor) {
      offer.hidden = false;
      offer.innerHTML = `${t('ui.drawOffer')} <button data-act="draw">${t('ui.accept')}</button><button data-act="draw-no" class="ghost">${t('ui.no')}</button>`;
    } else offer.hidden = true;
    $('.actions').innerHTML = st.status !== 'play' && st.status !== 'wait' && !st.study ? `<button data-act="leave">${t('ui.newGame')}</button>` : '';
    document.title = st.status === 'play' && myColor && chess.turn() === myColor ? `● ${t('ui.yourTurn')} | ${baseTitle}` : baseTitle;
  }

  function tick() {
    if (!st) return;
    for (const c of ['w', 'b']) {
      const el = root.querySelector(`.clock[data-c=${c}]`);
      if (!el) continue;
      let ms = c === 'w' ? st.wt : st.bt;
      if (ms == null) { el.textContent = '∞'; continue; }
      if (st.running === c) ms -= Date.now() - recvAt;
      el.textContent = fmtClock(ms);
      el.classList.toggle('low', ms < 10000 && st.status === 'play');
      el.classList.toggle('active', st.running === c && st.status === 'play');
      if (c === myColor && ms < 10000 && ms > 0 && st.status === 'play' && st.running === c && !lowPlayed && st.base >= 1) { lowPlayed = true; sfx.lowTime(); }
    }
  }
  timer = setInterval(tick, 100);

  function go(i) {
    const n = plies.length;
    i = Math.max(0, Math.min(n, i));
    view = i === n ? null : i;
    render();
  }

  // ---- подсказка: стрелка и круг на доске + строка в панели ----
  function showHint(h) {
    hint = h;
    const line = $('.hintline');
    if (!h) { cg.setAutoShapes([]); line.hidden = true; return; }
    cg.setAutoShapes([{ orig: h.from, brush: 'green' }, { orig: h.from, dest: h.to, brush: 'green' }]);
    line.hidden = false;
    line.textContent = `${t('cpu.hintIs')} ${h.san}`;
    toast(`${t('cpu.hintIs')} ${h.san}`);
  }

  // ---- чат партии ----
  function showChat(color, text) {
    const log = $('#chatlog');
    if (!log || !st) return;
    const p = color === 'w' ? st.white : st.black;
    const row = document.createElement('div');
    if (color === myColor) row.className = 'me';
    const name = document.createElement('b');
    name.textContent = (color === myColor ? t('chat.you') : (p && (p.display || p.username)) || '?') + ':';
    row.append(name, document.createTextNode(' ' + text));
    log.append(row);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 60) log.firstChild.remove();
  }
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'chatform') return;
    e.preventDefault();
    const inp = $('#chatin');
    const v = inp.value.trim();
    if (v) cb.chat?.(v);
    inp.value = '';
  });

  // ---- реакции ----
  function showEmote(color, code) {
    if (!EMOTES[code] || !st) return;
    const top = (orientation() === 'white' ? 'b' : 'w') === color;
    const bar = $(`.pbar[data-pos=${top ? 'top' : 'bottom'}]`);
    const d = document.createElement('div');
    d.className = 'emote-pop';
    d.textContent = EMOTES[code];
    bar.append(d);
    setTimeout(() => d.remove(), 2600);
  }

  // ---- полный экран ----
  function setFocus(on) {
    game.classList.toggle('focus', on);
    document.body.classList.toggle('focus-mode', on);
    const b = $('[data-tool=focus]');
    b.innerHTML = svg(on ? 'min' : 'max');
    cg.state.dom.bounds.clear();
    if (on) game.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  const onFs = () => { if (!document.fullscreenElement && game.classList.contains('focus')) setFocus(false); };
  document.addEventListener('fullscreenchange', onFs);

  // ---- меню «три точки» ----
  function closeMenus() { $('.popmenu').hidden = true; $('.emotebar').hidden = true; }
  function openMenu() {
    const p = getPrefs();
    const playing = st && st.status === 'play' && myColor;
    const item = (id, label, cls = '') => `<button class="pm ${cls}" data-m="${id}">${label}</button>`;
    const sw = (k, label) => `<label class="pm sw"><span>${label}</span><input type="checkbox" data-pref="${k}" ${p[k] ? 'checked' : ''}></label>`;
    let h = item('flip', t('ui.flip'));
    if (playing) {
      if (plies.length < 2) { if (cb.abort) h += item('abort', t('ui.abort')); }
      else {
        if (cb.draw) h += st.drawFrom === myColor ? `<button class="pm" disabled>${t('ui.drawSent')}</button>` : item('draw', t('ui.offerDraw'));
        if (cb.resign) h += item('resign', t('ui.resign'), 'danger');
      }
      if (cb.takeback) h += item('takeback', t('cpu.takeback'));
      if (cb.hint) h += item('hint', t('cpu.hint'));
    }
    h += `<div class="pm-sep"></div>${sw('sound', t('set.sound'))}${sw('legal', t('set.dots'))}${sw('coords', t('set.coords'))}
      <div class="pm-sep"></div><a class="pm" href="/settings" data-link>${t('nav.settings')}</a>`;
    const m = $('.popmenu');
    m.innerHTML = h;
    m.hidden = false;
    $('.emotebar').hidden = true;
  }

  function onMenu(id) {
    closeMenus();
    if (id === 'flip') { flipped = !flipped; render(); }
    else if (id === 'abort') cb.abort?.();
    else if (id === 'draw') cb.draw?.();
    else if (id === 'resign') { if (confirm(t('ui.confirmResign'))) cb.resign?.(); }
    else if (id === 'takeback') { showHint(null); cb.takeback?.(); }
    else if (id === 'hint') {
      Promise.resolve(cb.hint?.()).then((h) => { if (h) showHint(h); });
    }
  }

  root.addEventListener('click', (e) => {
    const tool = e.target.closest('[data-tool]')?.dataset.tool;
    if (tool === 'focus') { closeMenus(); setFocus(!game.classList.contains('focus')); return; }
    if (tool === 'menu') { if ($('.popmenu').hidden) openMenu(); else closeMenus(); return; }
    if (tool === 'emote') { const b = $('.emotebar'); const open = b.hidden; closeMenus(); b.hidden = !open; return; }
    const em = e.target.closest('[data-emote]')?.dataset.emote;
    if (em) { closeMenus(); cb.emote?.(em); return; }
    const mi = e.target.closest('[data-m]')?.dataset.m;
    if (mi) { onMenu(mi); return; }
    if (e.target.closest('.popmenu a')) { closeMenus(); return; }
    const nav = e.target.closest('[data-nav]')?.dataset.nav;
    const mv = e.target.closest('[data-ply]')?.dataset.ply;
    const act = e.target.closest('[data-act]')?.dataset.act;
    const cur = view ?? plies.length;
    if (nav === 'first') go(0);
    else if (nav === 'prev') go(cur - 1);
    else if (nav === 'next') go(cur + 1);
    else if (nav === 'last') go(plies.length);
    else if (mv) go(Number(mv));
    else if (act) cb[act === 'draw-no' ? 'drawNo' : act]?.();
  });

  root.addEventListener('change', (e) => {
    const k = e.target.dataset?.pref;
    if (!k) return;
    setPrefs({ [k]: e.target.checked });
    if (k === 'legal') cg.set({ movable: { showDests: e.target.checked } });
    if (k === 'sound' && e.target.checked) sfx.move();
  });

  // клик мимо меню закрывает его
  const onDoc = (e) => { if (!e.target.closest('.popmenu, .emotebar, [data-tool]')) closeMenus(); };
  document.addEventListener('pointerdown', onDoc);

  function onKey(e) {
    if (e.target.matches('input, textarea')) return;
    const cur = view ?? plies.length;
    if (e.key === 'ArrowLeft') go(cur - 1);
    else if (e.key === 'ArrowRight') go(cur + 1);
    else if (e.key === 'Escape') closeMenus();
  }
  document.addEventListener('keydown', onKey);

  return {
    update(state, color) {
      if (!st) lowPlayed = false;
      const first = !st, prevLen = plies.length, prevStatus = st?.status;
      st = state;
      myColor = color;
      recvAt = Date.now();
      rebuild();
      if (st.local) myColor = st.status === 'play' ? chess.turn() : null; // два игрока за одним экраном: ходит тот, чья очередь
      if (view != null && view >= plies.length) view = null;
      showHint(null);
      if (!first) {
        if (plies.length > prevLen) {
          const last = plies[plies.length - 1];
          moveSound(last.san);
          if (myColor && !st.local && last.color !== myColor) navigator.vibrate?.(/[+#]/.test(last.san) ? [40, 40, 60] : 14);
        }
        if (prevStatus === 'play' && st.status === 'over') {
          const w = st.result === '1-0' ? 'w' : st.result === '0-1' ? 'b' : null;
          setTimeout(() => (!w || !myColor ? sfx.draw() : w === myColor ? sfx.win() : sfx.lose()), 420);
          if (w && myColor && w === myColor) setTimeout(confetti, 500);
        }
      }
      render();
    },
    extra: $('.extra'),
    showEmote,
    showChat,
    showHint,
    destroy() {
      clearInterval(timer);
      ro.disconnect();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('fullscreenchange', onFs);
      document.body.classList.remove('focus-mode');
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      document.title = baseTitle;
      cg.destroy();
    },
  };
}
