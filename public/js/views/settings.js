import { app, go, refreshMe } from '../app.js';
import { api, esc, avatar } from '../util.js';
import { openProfileEditor } from '../profileedit.js';
import { t } from '../i18n.js';
import * as net from '../net.js';
import { sfx } from '../sound.js';
import { BOARDS, PIECES, ACCENTS, getPrefs, setPrefs, isUnlocked, needText, boardImage } from '../skins.js';
import { getLang } from '../i18n.js';

export function mount(root) {
  const u = app.user;
  const p = getPrefs();
  const lock = (it, kind) => (isUnlocked(u, it, kind) ? '' : `<small>${t('set.need')}: ${needText(it, t)}</small>`);
  const sw = (k, label, hint) => `<label class="switch"><span>${label}<small>${hint}</small></span><input type="checkbox" data-k="${k}" ${p[k] ? 'checked' : ''}></label>`;

  root.innerHTML = `
  <div class="page-h"><div><h1>${t('nav.settings')}</h1></div></div>
  <div class="cols">
  <div>
    <div class="panel"><h2>${t('set.game')}</h2>
      ${sw('legal', t('set.dots'), t('set.dots.d'))}
      ${sw('coords', t('set.coords'), t('set.coords.d'))}
      ${sw('anim', t('set.anim'), t('set.anim.d'))}
      ${sw('sound', t('set.sound'), t('set.sound.d'))}
      <label class="switch"><span>${t('set.volume')}</span><input type="range" id="vol" min="0" max="100" value="${Math.round(p.vol * 100)}"></label>
    </div>
    <div class="panel"><h2>${t('set.sounds')}</h2>
      <div class="seg" id="sfxset">${['lichess', 'wood', 'soft', 'retro'].map((k) => `<button data-s="${k}" class="${p.sfxSet === k ? 'on' : ''}">${t('sfx.' + k)}</button>`).join('')}</div>
      <p class="muted" style="margin-bottom:0">${t('sfx.hint')}</p>
    </div>
    <div class="panel"><h2>${t('set.design')}</h2>
      <label>${t('set.skin')}</label>
      <div class="seg" id="skinset"><button data-k="classic" class="${p.skin !== 'min' ? 'on' : ''}">${t('set.skin.classic')}</button><button data-k="min" class="${p.skin === 'min' ? 'on' : ''}">${t('set.skin.min')}</button></div>
      <label>${t('set.nav')}</label>
      <div class="seg" id="navpos"><button data-n="side" class="${p.nav === 'side' ? 'on' : ''}">${t('set.nav.side')}</button><button data-n="bottom" class="${p.nav === 'bottom' ? 'on' : ''}">${t('set.nav.bottom')}</button></div>
      <label>${t('set.accent')}</label>
      <div class="swatches" id="accent">${Object.entries(ACCENTS).map(([k, c]) => `<button data-a="${k}" class="${p.accent === k ? 'on' : ''}" style="background:${c[0]}" aria-label="${k}"></button>`).join('')}</div>
      <label>${t('set.language')}</label>
      <div class="seg" id="langset"><button data-lang="ru" class="${getLang() === 'ru' ? 'on' : ''}">Русский</button><button data-lang="en" class="${getLang() === 'en' ? 'on' : ''}">English</button></div>
    </div>
    <div class="panel"><h2>${t('set.view')}</h2>
      <div class="seg"><button class="on" disabled style="opacity:1">${t('set.view.2d')}</button><button disabled>${t('set.view.3d')} <span class="tag">${t('dev')}</span></button></div>
    </div>
    <div class="panel"><h2>${t('set.board')}</h2>
      <div class="themes" id="boards">${BOARDS.map((b) => `<button class="theme ${!p.custom && p.theme === b.id ? 'on' : ''}" data-id="${b.id}" ${isUnlocked(u, b, 'board') ? '' : 'disabled'}>
        <i style="background-image:${boardImage(b)};background-size:cover"></i>${t('board.' + b.id)}${lock(b, 'board')}</button>`).join('')}</div>
      <div class="row" style="margin-top:14px">
        <label class="switch" style="flex:1;margin:0"><span>${t('set.custom')}</span><input type="checkbox" id="custom" ${p.custom ? 'checked' : ''}></label>
        <input type="color" id="cl" value="${p.cLight}" style="width:56px;padding:2px"><input type="color" id="cd" value="${p.cDark}" style="width:56px;padding:2px">
      </div>
    </div>
    <div class="panel"><h2>${t('set.pieces')}</h2>
      <div class="themes" id="pieces">${PIECES.map((x) => `<button class="theme ${p.pieces === x.id ? 'on' : ''}" data-id="${x.id}" ${isUnlocked(u, x, 'piece') ? '' : 'disabled'}>
        <div class="cg-wrap pv">${x.set ? `<piece class="king white" style="filter:none;background-image:url(/pieces/${x.id}/wK.svg)"></piece><piece class="king black" style="filter:none;background-image:url(/pieces/${x.id}/bK.svg)"></piece>` : `<piece class="king white" style="filter:${x.f.w}"></piece><piece class="king black" style="filter:${x.f.b}"></piece>`}</div>${t('piece.' + x.id)}${lock(x, 'piece')}</button>`).join('')}</div>
      <p class="muted" style="margin-bottom:0">${t('set.unlockNote')}</p>
    </div>
  </div>
  <div>
  ${u ? `
    <div class="panel"><h2>${t('set.profile')}</h2>
      <div class="head" style="gap:14px">${avatar(u.avatar, 'lg')}<div style="flex:1;min-width:140px"><b style="font-size:18px">${esc(u.display)}</b><div class="muted">@${esc(u.username)}</div></div></div>
      <div class="row" style="margin-top:14px"><button id="editprof">${t('prof.edit')}</button><a class="btn ghost" href="/u/${esc(u.username)}" data-link>${t('prof.open')}</a></div>
    </div>
    <div class="panel"><h2>${t('set.account')}</h2>
      <div class="row"><button class="ghost" id="out">${t('set.logout')}</button><button class="danger" id="del">${t('set.delete')}</button></div>
      <p class="muted" style="margin-bottom:0">${t('set.delete.d')}</p>
    </div>` : `<div class="panel"><p class="muted" style="margin:0"><a href="/login?next=/settings" data-link>${t('set.loginHint')}</a></p></div>`}
  </div></div>`;

  root.insertAdjacentHTML('beforeend', `<div class="panel" style="margin-top:16px"><a href="/legal" data-link class="row" style="justify-content:space-between;color:var(--ink)"><span><b>${t('set.legal')}</b><small class="muted" style="display:block">${t('set.legal.d')}</small></span><span>›</span></a></div>`);
  const pick = (box, key) => box.addEventListener('click', (e) => {
    const b = e.target.closest('.theme');
    if (!b || b.disabled) return;
    setPrefs(key === 'theme' ? { theme: b.dataset.id, custom: false } : { pieces: b.dataset.id });
    go('/settings', true);
  });
  pick(root.querySelector('#boards'), 'theme');
  pick(root.querySelector('#pieces'), 'pieces');
  root.querySelector('#custom').onchange = (e) => setPrefs({ custom: e.target.checked });
  root.querySelector('#cl').oninput = (e) => setPrefs({ cLight: e.target.value, custom: true });
  root.querySelector('#cd').oninput = (e) => setPrefs({ cDark: e.target.value, custom: true });
  root.querySelectorAll('[data-k]').forEach((c) => { c.onchange = () => { setPrefs({ [c.dataset.k]: c.checked }); if (c.dataset.k === 'sound' && c.checked) sfx.move(); }; });
  root.querySelector('#sfxset').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; setPrefs({ sfxSet: b.dataset.s }); root.querySelectorAll('#sfxset button').forEach((x) => x.classList.toggle('on', x === b)); sfx.capture(); setTimeout(() => sfx.move(), 350); };
  root.querySelector('#skinset').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const cur = getPrefs();
    const patch = { skin: b.dataset.k };
    if (b.dataset.k === 'min' && cur.accent === 'gold') patch.accent = 'purple'; // у минимального стиля свой фирменный цвет
    if (b.dataset.k === 'classic' && cur.accent === 'purple') patch.accent = 'gold';
    setPrefs(patch);
    go('/settings', true);
  };
  root.querySelector('#navpos').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; setPrefs({ nav: b.dataset.n }); root.querySelectorAll('#navpos button').forEach((x) => x.classList.toggle('on', x === b)); };
  root.querySelector('#accent').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; setPrefs({ accent: b.dataset.a }); root.querySelectorAll('#accent button').forEach((x) => x.classList.toggle('on', x === b)); };
  root.querySelector('#vol').oninput = (e) => setPrefs({ vol: e.target.value / 100 });
  root.querySelector('#vol').onchange = () => sfx.move();

  if (!u) return;
  root.querySelector('#editprof').onclick = () => openProfileEditor(() => go('/settings', true));
  root.querySelector('#out').onclick = async () => { await api('/logout', { method: 'POST' }); await refreshMe(); net.reconnect(); go('/'); };
  root.querySelector('#del').onclick = async () => {
    if (!confirm(t('set.delete.q'))) return;
    await api('/me', { method: 'DELETE' });
    await refreshMe();
    net.reconnect();
    go('/');
  };
}
