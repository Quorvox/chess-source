// Комната: хост судит партию у себя в браузере, гости получают состояние через сервер-ретранслятор
import { app, go } from '../app.js';
import { createGameUI } from '../gameui.js';
import { RoomHost } from '../roomhost.js';
import { esc, toast } from '../util.js';
import { t } from '../i18n.js';
import * as net from '../net.js';
import { sfx } from '../sound.js';

export function mount(root, { params }) {
  const code = params[0].toUpperCase();
  if (!app.user) { go('/login?next=/room/' + code, true); return; }
  const u = app.user;
  const me = { username: u.username, display: u.display, rating: u.rating, avatar: u.avatar, country: u.country, badge: u.badge };
  const isHost = !!app.hostRoom && app.hostRoom.code === code;

  root.innerHTML = `
    <div class="panel invite">
      <div><div class="muted">${t('room.code')}</div><div class="code">${esc(code)}</div></div>
      <button id="copy">${t('room.copy')}</button>
      <span class="muted" id="cnt"></span>
    </div>
    <div id="g"></div>`;
  const link = `${location.origin}/room/${code}`;
  root.querySelector('#copy').onclick = async () => {
    try { await navigator.clipboard.writeText(link); toast(t('room.copied')); } catch { toast(link); }
  };
  const cnt = root.querySelector('#cnt');
  const offs = [];
  let ui;

  if (isHost) {
    const host = new RoomHost(app.hostRoom, me, push);
    const hc = () => host.hostColor;
    ui = createGameUI(root.querySelector('#g'), {
      move: (m) => host.move(hc(), m),
      resign: () => host.resign(hc()),
      draw: () => host.draw(hc()),
      drawNo: () => host.drawNo(hc()),
      abort: () => host.abort(),
      leave: () => host.rematch(),
      emote: (e) => { ui.showEmote(hc(), e); net.send({ t: 'room-msg', data: { k: 'emote', c: hc(), e } }); },
    });
    function push() {
      const s = host.snapshot();
      ui.update(s, hc());
      cnt.textContent = `${t('room.inside')}: ${host.peers.size + 1}`;
      net.send({ t: 'room-msg', data: { k: 'state', s } });
    }
    push();
    offs.push(
      net.on('room-peer', (m) => { sfx.challenge(); host.addPeer(m.id, m.user); }),
      net.on('room-peer-left', (m) => host.removePeer(m.id)),
      net.on('room-data', (m) => {
        const d = m.data || {};
        const c = host.colorOfPeer(m.from);
        if (d.k === 'rematch' && c) host.rematch();
        else if (!c) return;
        else if (d.k === 'move') { if (!host.move(c, String(d.uci))) push(); }
        else if (d.k === 'resign') host.resign(c);
        else if (d.k === 'draw') host.draw(c);
        else if (d.k === 'drawNo') host.drawNo(c);
        else if (d.k === 'abort') host.abort();
        else if (d.k === 'emote') { ui.showEmote(c, String(d.e)); net.send({ t: 'room-msg', data: { k: 'emote', c, e: String(d.e) } }); }
      }),
    );
  } else {
    let myId = null;
    const send = (data) => net.send({ t: 'room-msg', data });
    ui = createGameUI(root.querySelector('#g'), {
      move: (uci) => { send({ k: 'move', uci }); return true; },
      resign: () => send({ k: 'resign' }),
      draw: () => send({ k: 'draw' }),
      drawNo: () => send({ k: 'drawNo' }),
      abort: () => send({ k: 'abort' }),
      leave: () => send({ k: 'rematch' }),
      emote: (e) => send({ k: 'emote', e }),
    });
    net.send({ t: 'room-join', code });
    offs.push(
      net.on('room-joined', (m) => { myId = m.id; cnt.textContent = esc(m.room.title); }),
      net.on('room-error', (m) => {
        root.innerHTML = `<div class="panel narrow"><h2>${t(m.m)}</h2><p class="muted">${t('room.askAgain')}</p><a class="btn" href="/rooms" data-link>${t('room.toRooms')}</a></div>`;
      }),
      net.on('room-closed', () => { toast(t('room.closed')); go('/rooms'); }),
      net.on('room-data', (m) => {
        const d = m.data;
        if (d && d.k === 'emote') { ui.showEmote(d.c, String(d.e)); return; }
        if (!d || d.k !== 'state') return;
        const s = d.s;
        const color = myId != null && s.oppId === myId ? (s.hostColor === 'w' ? 'b' : 'w') : null;
        ui.update(s, color);
      }),
    );
  }

  return () => {
    offs.forEach((f) => f());
    net.send({ t: 'room-leave' });
    if (isHost) app.hostRoom = null;
    ui?.destroy();
  };
}
