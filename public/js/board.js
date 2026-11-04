import { Chessground } from '/vendor/chessground/chessground.js';
import { Chess } from '/vendor/chess.js/chess.js';
import { getPrefs } from './skins.js';

export { Chess };

export function dests(chess) {
  const m = new Map();
  for (const mv of chess.moves({ verbose: true })) {
    if (!m.has(mv.from)) m.set(mv.from, []);
    m.get(mv.from).push(mv.to);
  }
  return m;
}

export function createBoard(el, config = {}) {
  const p = getPrefs();
  return Chessground(el, {
    coordinates: true,
    animation: { enabled: p.anim, duration: 180 },
    highlight: { lastMove: true, check: true },
    draggable: { distance: 4 },
    premovable: { enabled: false },
    ...config,
    movable: { showDests: p.legal, ...(config.movable || {}) },
  });
}

const GLYPH = { w: { q: '♕', r: '♖', b: '♗', n: '♘' }, b: { q: '♛', r: '♜', b: '♝', n: '♞' } };

// выбор фигуры при превращении пешки
export function askPromotion(overlay, color) {
  return new Promise((resolve) => {
    overlay.hidden = false;
    overlay.innerHTML = '<div class="promo">' + ['q', 'r', 'b', 'n'].map((p) => `<button data-p="${p}">${GLYPH[color][p]}</button>`).join('') + '</div>';
    overlay.onclick = (e) => {
      const p = e.target.closest('button')?.dataset.p;
      if (!p) return;
      overlay.hidden = true;
      overlay.innerHTML = '';
      resolve(p);
    };
  });
}

export const isPromotion = (chess, from, to) => {
  const p = chess.get(from);
  return !!p && p.type === 'p' && (to[1] === '8' || to[1] === '1');
};
