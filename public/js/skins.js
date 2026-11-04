import { t } from './i18n.js';

// Скины и настройки доски. Всё косметика: рейтинг не тратится, скин открывается порогом или наградой.
export const BOARDS = [
  { id: 'green', c: ['#eeeed2', '#769656'] },
  { id: 'brown', c: ['#f0d9b5', '#b58863'] },
  { id: 'blue', c: ['#dee3e6', '#8ca2ad'] },
  { id: 'purple', c: ['#e8e0f0', '#9b7bb8'] },
  { id: 'coral', c: ['#f7e1d7', '#d98e73'] },
  { id: 'walnut', c: ['#e9cfa0', '#8a5a33'], tex: 'wood' },
  { id: 'night', c: ['#7a8499', '#3d4558'], need: { games: 5 } },
  { id: 'oak', c: ['#f0dcb4', '#b9885a'], tex: 'wood', need: { games: 8 } },
  { id: 'ink', c: ['#cfc8b8', '#2f3a4f'], need: { games: 10 } },
  { id: 'parchment', c: ['#f3e7c6', '#c7a96b'], tex: 'paper', need: { games: 12 } },
  { id: 'sand', c: ['#f3e3c1', '#c99a5b'], need: { games: 15 } },
  { id: 'ebony', c: ['#c9b99a', '#3b2f2a'], tex: 'wood', need: { games: 20 } },
  { id: 'gold', c: ['#f6e7b4', '#b8902f'], need: { games: 50 } },
  { id: 'mint', c: ['#e6f4ea', '#58a583'], need: { rating: 700 } },
  { id: 'marble', c: ['#ecebe6', '#8f948f'], tex: 'marble', need: { rating: 750 } },
  { id: 'ruby', c: ['#f1d6d6', '#a8454b'], need: { rating: 800 } },
  { id: 'glass', c: ['#cfe6f5', '#6aa0c8'], tex: 'glass', need: { rating: 850 } },
  { id: 'blackmarble', c: ['#b8b8b8', '#2a2a2e'], tex: 'marble', need: { rating: 950 } },
  { id: 'neon', c: ['#2b3d66', '#0e1630'], need: { rating: 1000 } },
];

// Наборы фигур. set: true = готовые SVG из public/pieces (Lichess, свободные лицензии), иначе цветовой вариант классики
export const PIECES = [
  { id: 'classic', f: { w: 'none', b: 'none' } },
  { id: 'merida', set: true },
  { id: 'chessnut', set: true },
  { id: 'letter', set: true, need: { games: 5 } },
  { id: 'ivory', f: { w: 'sepia(.35) saturate(1.3)', b: 'none' }, need: { games: 3 } },
  { id: 'pixel', set: true, need: { games: 10 } },
  { id: 'gold', f: { w: 'sepia(1) saturate(3.4) brightness(1.1)', b: 'brightness(.6)' }, need: { games: 20 } },
  { id: 'fantasy', set: true, need: { games: 20 } },
  { id: 'spatial', set: true, need: { games: 30 } },
  { id: 'mpchess', set: true, need: { games: 50 } },
  { id: 'celtic', set: true, need: { rating: 700 } },
  { id: 'ice', f: { w: 'sepia(1) saturate(3) hue-rotate(155deg) brightness(1.1)', b: 'invert(.15) sepia(1) saturate(3) hue-rotate(185deg) brightness(.7)' }, need: { rating: 700 } },
  { id: 'pirouetti', set: true, need: { rating: 800 } },
  { id: 'rhosgfx', set: true, need: { rating: 900 } },
  { id: 'duel', f: { w: 'sepia(1) saturate(5) hue-rotate(-25deg) brightness(1.05)', b: 'sepia(1) saturate(5) hue-rotate(170deg) brightness(.75)' }, need: { rating: 900 } },
  { id: 'ghost', f: { w: 'drop-shadow(0 0 3px #fff)', b: 'brightness(.45) drop-shadow(0 0 3px #7ab8ff)' }, need: { games: 100 } },
  { id: 'neon', f: { w: 'drop-shadow(0 0 5px #4fd1a5) saturate(2)', b: 'brightness(.6) drop-shadow(0 0 5px #ff5fa2)' }, need: { rating: 1100 } },
];

export const ACCENTS = { gold: ['#f0a73b', '#b97d1a'], blue: ['#4aa3ff', '#2a6fb8'], green: ['#6fcf6f', '#3f9a3f'], purple: ['#b184ff', '#7a4fcf'], red: ['#ff6b6b', '#b83c3c'], pink: ['#ff7ab8', '#bf4a86'] };
const KEY = 'qc_prefs';
const DEF = { theme: 'green', pieces: 'classic', coords: true, legal: true, anim: true, custom: false, sound: true, sfxSet: 'lichess', nav: 'side', skin: 'classic', accent: 'gold', vol: 0.6, cLight: '#eeeed2', cDark: '#769656' };

export function getPrefs() {
  try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEF }; }
}

export function setPrefs(p) {
  const n = { ...getPrefs(), ...p };
  try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* приватный режим */ }
  applyPrefs();
  return n;
}

export function isUnlocked(user, item, kind) {
  if (!item.need) return true;
  if (!user) return false;
  if (kind && user.skins && user.skins.includes(kind + ':' + item.id)) return true;
  if (item.need.games && user.games >= item.need.games) return true;
  if (item.need.rating && user.rating >= item.need.rating) return true;
  return false;
}

export function needText(item) {
  if (!item.need) return '';
  return item.need.games ? t('need.games', { n: item.need.games }) : t('need.rating', { n: item.need.rating });
}

// Картинка доски: клетки плюс текстура поверх (дерево, мрамор, бумага, стекло рисуются самим SVG)
export function boardSvg(light, dark, tex) {
  const S = 100;
  let r = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2 === 0) r += `<rect x='${x * S}' y='${y * S}' width='${S}' height='${S}'/>`;
  let defs = '', over = '';
  if (tex === 'wood') {
    defs = "<filter id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.004 0.1' numOctaves='4' seed='7'/><feColorMatrix values='0 0 0 0 0.22  0 0 0 0 0.11  0 0 0 0 0.04  1.3 0 0 0 -0.34'/></filter>";
    over = "<rect width='800' height='800' filter='url(#f)' opacity='0.65'/>";
  } else if (tex === 'marble') {
    defs = "<filter id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='turbulence' baseFrequency='0.007 0.011' numOctaves='5' seed='4'/><feColorMatrix values='0 0 0 0 0.3  0 0 0 0 0.32  0 0 0 0 0.36  0.9 0 0 0 -0.05'/></filter>";
    over = "<rect width='800' height='800' filter='url(#f)' opacity='0.55'/>";
  } else if (tex === 'paper') {
    defs = "<filter id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='2'/><feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.1  0.5 0 0 0 -0.05'/></filter>";
    over = "<rect width='800' height='800' filter='url(#f)' opacity='0.5'/>";
  } else if (tex === 'glass') {
    defs = "<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.5'/><stop offset='.45' stop-color='#fff' stop-opacity='.04'/><stop offset='1' stop-color='#fff' stop-opacity='.3'/></linearGradient>";
    over = "<rect width='800' height='800' fill='url(#g)'/>";
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 800' shape-rendering='crispEdges'><defs>${defs}</defs><rect width='800' height='800' fill='${dark}'/><g fill='${light}'>${r}</g>${over}</svg>`;
  return `url('data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}')`;
}

export const boardImage = (b, p) => (p && p.custom ? boardSvg(p.cLight, p.cDark) : boardSvg(b.c[0], b.c[1], b.tex));

const NAMES = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };

// CSS для набора фигур из файлов
export function pieceSetCss(id) {
  let css = '';
  for (const c of ['w', 'b']) for (const k of Object.keys(NAMES)) css += `body .cg-wrap piece.${NAMES[k]}.${c === 'w' ? 'white' : 'black'}{background-image:url(/pieces/${id}/${c}${k}.svg)}\n`;
  return css;
}

export function applyPrefs() {
  const p = getPrefs();
  const b = BOARDS.find((x) => x.id === p.theme) || BOARDS[0];
  const [l, d] = p.custom ? [p.cLight, p.cDark] : b.c;
  const pc = PIECES.find((x) => x.id === p.pieces) || PIECES[0];
  document.body.classList.toggle('nav-bottom', p.nav === 'bottom');
  document.body.classList.toggle('skin-min', p.skin === 'min');
  const ac = ACCENTS[p.accent] || ACCENTS.gold;
  let st = document.getElementById('skin-css');
  if (!st) { st = document.createElement('style'); st.id = 'skin-css'; document.head.append(st); }
  st.textContent = `:root{--cl:${l};--cd:${d};--gold:${ac[0]};--gold2:${ac[1]}}
cg-board{background-image:${boardImage(b, p)}!important;background-size:cover}
${pc.set ? pieceSetCss(pc.id) + '.cg-wrap piece.white,.cg-wrap piece.black{filter:none}' : `.cg-wrap piece.white{filter:${pc.f.w}} .cg-wrap piece.black{filter:${pc.f.b}}`}
${p.coords ? '' : '.cg-wrap coords{display:none}'}`;
}
