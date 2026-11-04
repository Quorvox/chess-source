// Выбор режима, как в MLBB: рейтинг в центре, компьютер слева, тренировка справа, внизу быстрые вкладки
import { app, go, icon } from '../app.js';
import { t } from '../i18n.js';
import { LEVELS } from '../strength.js';
import * as net from '../net.js';

const TC = [[1, 0, 'bullet'], [3, 0, 'blitz'], [3, 2, 'blitz'], [5, 0, 'blitz'], [10, 0, 'rapid'], [10, 5, 'rapid'], [15, 10, 'rapid'], [30, 0, 'classic']];
const PIECE = (type, filter = '') => `<div class="stand cg-wrap"><piece class="${type} white" style="filter:${filter}"></piece></div>`;

export function mount(root) {
  const u = app.user;
  root.innerHTML = `
  <div class="page-h"><div><h1>${t('play.title')}</h1><p>${t('play.sub')}</p></div></div>
  <div class="modes">
    <button class="mcard cpu" data-m="cpu"><div class="art"><div class="iso"></div></div>${PIECE('knight', 'sepia(1) hue-rotate(170deg) saturate(3)')}
      <h2>${t('play.cpu')}</h2><p>${t('play.cpu.d')}</p></button>
    <button class="mcard main" data-m="rated"><div class="art"><div class="iso"></div></div>${PIECE('king', 'sepia(1) saturate(4) brightness(1.15)')}
      ${u ? `<span class="badge">${t('play.rating')} <b>${u.rating}</b></span>` : ''}<span class="pick">${t('play.pick')}</span>
      <h2>${t('play.rated')}</h2><p>${t('play.rated.d')}</p></button>
    <a class="mcard train" href="/train" data-link><div class="art"><div class="iso"></div></div>${PIECE('bishop', 'sepia(1) hue-rotate(95deg) saturate(3)')}
      <h2>${t('play.train')}</h2><p>${t('play.train.d')}</p></a>
  </div>
  <div class="tabs-row">
    <a class="mini" href="/rooms" data-link><span class="ico" style="--h:190">${icon('users')}</span><span><b>${t('play.friend')}</b><small>${t('play.friend.d')}</small></span></a>
    <a class="mini" href="/tournaments" data-link><span class="ico" style="--h:275">${icon('calendar')}</span><span><b>${t('nav.tourn')}</b><small>${t('play.tourn.d')}</small></span></a>
    <a class="mini" href="/leaders" data-link><span class="ico" style="--h:38">${icon('trophy')}</span><span><b>${t('nav.top')}</b><small>${t('play.top.d')}</small></span></a>
    <a class="mini" href="/local" data-link><span class="ico" style="--h:330">${icon('swords')}</span><span><b>${t('play.local')}</b><small>${t('play.local.d')}</small></span></a>
  </div>`;

  let modal = null;
  const offs = [];
  const close = () => { modal?.remove(); modal = null; offs.splice(0).forEach((f) => f()); };
  const open = (html) => {
    close();
    modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="sheet">${html}</div>`;
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.body.append(modal);
    return modal;
  };

  function ratedModal() {
    if (!app.user) return go('/login?next=/play');
    const m = open(`<h2>${t('play.rated')}</h2><p class="muted" style="margin:0">${t('play.pickTime')}</p>
      <div class="clocks">${TC.map(([b, i, k]) => `<button class="tile" data-b="${b}" data-i="${i}"><span class="t">${b}+${i}</span><span class="k">${t('tc.' + k)}</span></button>`).join('')}</div>`);
    m.querySelector('.clocks').onclick = (e) => {
      const b = e.target.closest('.tile');
      if (b) net.send({ t: 'seek', base: +b.dataset.b, inc: +b.dataset.i });
    };
    let timer;
    offs.push(
      net.on('seeking', (s) => {
        m.querySelector('.sheet').innerHTML = `<div class="seek-box"><div class="spin"></div><h2>${t('seek.title')}</h2>
          <p class="muted">${s.base}+${s.inc}</p><div class="big-t" id="st">0:00</div><p class="muted">${t('seek.tip')}</p><button class="ghost" id="sx">${t('cancel')}</button></div>`;
        const t0 = Date.now();
        timer = setInterval(() => { const x = Math.floor((Date.now() - t0) / 1000); const el = m.querySelector('#st'); if (el) el.textContent = Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0'); }, 500);
        m.querySelector('#sx').onclick = () => net.send({ t: 'cancel' });
      }),
      net.on('seek-cancelled', () => { clearInterval(timer); close(); }),
      () => clearInterval(timer),
    );
  }

  function cpuModal() {
    let level = 4, color = 'w';
    try { Object.assign({}, JSON.parse(localStorage.getItem('qc_cpu') || '{}')); const s = JSON.parse(localStorage.getItem('qc_cpu') || '{}'); level = s.level || level; color = s.color || color; } catch { /* ok */ }
    const m = open(`<h2>${t('play.cpu')}</h2>
      <label>${t('cpu.level')}</label>
      <div class="levels">${LEVELS.map((l) => `<button class="lvl ${l.n === level ? 'on' : ''}" data-l="${l.n}"><b>${l.n}</b><span>${l.elo}</span></button>`).join('')}</div>
      <p class="muted" id="ln"></p>
      <label>${t('cpu.color')}</label>
      <div class="seg" id="col"><button data-c="w" class="${color === 'w' ? 'on' : ''}">${t('cpu.white')}</button><button data-c="b" class="${color === 'b' ? 'on' : ''}">${t('cpu.black')}</button><button data-c="r" class="${color === 'r' ? 'on' : ''}">${t('cpu.random')}</button></div>
      <button class="big" id="go" style="width:100%;margin-top:20px">${t('cpu.start')}</button>`);
    const name = () => { const l = LEVELS[level - 1]; m.querySelector('#ln').textContent = t('cpu.levelInfo', { n: l.n, name: t('lvl.' + l.n), elo: l.elo }); };
    name();
    m.querySelector('.levels').onclick = (e) => { const b = e.target.closest('.lvl'); if (!b) return; level = +b.dataset.l; m.querySelectorAll('.lvl').forEach((x) => x.classList.toggle('on', x === b)); name(); };
    m.querySelector('#col').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; color = b.dataset.c; m.querySelectorAll('#col button').forEach((x) => x.classList.toggle('on', x === b)); };
    m.querySelector('#go').onclick = () => { try { localStorage.setItem('qc_cpu', JSON.stringify({ level, color })); } catch { /* ok */ } close(); go(`/computer?level=${level}&color=${color}`); };
  }

  root.querySelector('.modes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    if (b.dataset.m === 'rated') ratedModal(); else cpuModal();
  });

  // наклон карточек за курсором
  root.querySelectorAll('.mcard').forEach((c) => {
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      c.style.transform = `translateY(-8px) perspective(900px) rotateX(${-y * 6}deg) rotateY(${x * 8}deg)`;
    });
    c.addEventListener('pointerleave', () => { c.style.transform = ''; });
  });

  return close;
}
