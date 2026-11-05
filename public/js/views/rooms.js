import { app, go } from '../app.js';
import { api, esc, avatar, flag, toast, badge } from '../util.js';
import { t } from '../i18n.js';
import * as net from '../net.js';

const TCS = [[3, 0], [3, 2], [5, 0], [10, 0], [10, 5], [15, 10], [30, 0]];

export function mount(root) {
  root.innerHTML = `
  <div class="page-h"><div><h1>${t('nav.friends')}</h1><p>${t('rooms.sub')}</p></div></div>
  <div class="cols">
    <section class="panel">
      <h2>${t('rooms.create')}</h2>
      <p class="muted" style="margin-top:0">${t('rooms.note')}</p>
      <form id="mk">
        <label for="title">${t('rooms.name')}</label><input id="title" maxlength="40" placeholder="${t('rooms.namePh')}">
        <label for="tc">${t('rooms.time')}</label>
        <select id="tc">${TCS.map(([b, i]) => `<option value="${b},${i}" ${b === 10 && i === 0 ? 'selected' : ''}>${b}+${i}</option>`).join('')}</select>
        <label class="switch" style="margin-top:10px"><span>${t('rooms.open')}</span><input type="checkbox" id="open"></label>
        <button class="big" style="width:100%;margin-top:16px">${t('rooms.createBtn')}</button>
      </form>
    </section>
    <section>
      <div class="panel"><h2>${t('rooms.join')}</h2>
        <form id="jn" class="row"><input id="code" maxlength="6" placeholder="ABC123" style="flex:1;text-transform:uppercase;letter-spacing:.2em" autocomplete="off"><button>${t('rooms.joinBtn')}</button></form>
      </div>
      <div class="panel"><h2>${t('rooms.list')}</h2><div class="list" id="rl"><div class="empty">${t('loading')}</div></div></div>
    </section>
  </div>`;

  const need = () => { if (!app.user) { go('/login?next=/rooms'); return false; } return true; };
  root.querySelector('#mk').onsubmit = (e) => {
    e.preventDefault();
    if (!need()) return;
    const [base, inc] = root.querySelector('#tc').value.split(',').map(Number);
    net.send({ t: 'room-create', title: root.querySelector('#title').value, base, inc, open: root.querySelector('#open').checked });
  };
  root.querySelector('#jn').onsubmit = (e) => {
    e.preventDefault();
    if (!need()) return;
    const c = root.querySelector('#code').value.trim().toUpperCase();
    if (/^[A-Z0-9]{6}$/.test(c)) go('/room/' + c); else toast(t('rooms.codeLen'));
  };

  async function load() {
    try {
      const { rooms } = await api('/rooms');
      root.querySelector('#rl').innerHTML = rooms.length ? rooms.map((r) =>
        `<a href="/room/${r.code}" data-link>${avatar(r.host.avatar, 'sm')}<span class="grow"><b>${esc(r.title)}</b><span class="muted">${esc(r.host.display)}${badge(r.host.badge)} ${flag(r.host.country)}, ${r.base}+${r.inc}</span></span><span class="num muted">${r.players}/2</span></a>`).join('')
        : `<div class="empty">${t('rooms.none')}</div>`;
    } catch { /* сеть */ }
  }
  load();
  const poll = setInterval(load, 5000);
  const offs = [
    net.on('room-created', (m) => { app.hostRoom = m.room; go('/room/' + m.room.code); }),
    net.on('room-error', (m) => toast(t(m.m))),
  ];
  return () => { clearInterval(poll); offs.forEach((f) => f()); };
}
