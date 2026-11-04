// Друзья: список с онлайном, заявки, приглашение сыграть
import { app, go } from '../app.js';
import { api, esc, avatar, flag, badge, toast } from '../util.js';
import { t } from '../i18n.js';
import * as net from '../net.js';

export const TC = [[3, 0], [5, 0], [10, 0], [15, 10]];

export async function mount(root) {
  if (!app.user) { go('/login?next=/friends', true); return; }
  let d = { friends: [], incoming: [], outgoing: [] };
  let tc = 1;
  const load = async () => { try { d = await api('/friends'); } catch (e) { toast(e.message); } draw(); };

  const person = (p, actions) => `<div class="friend">${avatar(p.avatar, 'sm')}<span class="grow" style="flex:1;min-width:140px"><a href="/u/${esc(p.username)}" data-link style="color:var(--ink)"><b>${esc(p.display)}</b></a>${badge(p.badge)} ${flag(p.country)}
    <span class="muted" style="display:block">${p.online ? '<i class="dot-on"></i>' + t('fr.online') : '<i class="dot-off"></i>' + t('fr.offline')} · ${p.rating}</span></span><span class="row">${actions}</span></div>`;

  function draw() {
    root.innerHTML = `
    <div class="page-h"><div><h1>${t('nav.myfriends')}</h1><p>${t('fr.sub')}</p></div>
      <div class="row"><span class="muted">${t('fr.time')}</span><select id="tc" style="width:auto">${TC.map(([b, i], k) => `<option value="${k}" ${k === tc ? 'selected' : ''}>${b}+${i}</option>`).join('')}</select></div></div>
    ${d.incoming.length ? `<div class="panel"><h2>${t('fr.requests')}</h2>${d.incoming.map((p) => person(p, `<button data-ok="${esc(p.username)}">${t('fr.accept')}</button><button class="ghost" data-no="${esc(p.username)}">${t('fr.decline')}</button>`)).join('')}</div>` : ''}
    <div class="panel"><h2>${t('nav.myfriends')} (${d.friends.length})</h2>
      ${d.friends.map((p) => person(p, `<button data-inv="${esc(p.username)}" ${p.online ? '' : 'disabled'}>${t('fr.invite')}</button><button class="ghost" data-rm="${esc(p.username)}">${t('fr.remove')}</button>`)).join('') || `<p class="muted" style="margin:0">${t('fr.none')}</p>`}</div>
    ${d.outgoing.length ? `<div class="panel"><h2>${t('fr.sentTitle')}</h2>${d.outgoing.map((p) => person(p, `<button class="ghost" data-no="${esc(p.username)}">${t('fr.cancelReq')}</button>`)).join('')}</div>` : ''}`;
    root.querySelector('#tc').onchange = (e) => { tc = Number(e.target.value); };
  }

  root.addEventListener('click', async (e) => {
    const g = (k) => e.target.closest(`[data-${k}]`)?.dataset[k];
    try {
      if (g('ok')) { await api('/friends/' + g('ok'), { method: 'POST' }); load(); }
      else if (g('no')) { await api('/friends/' + g('no'), { method: 'DELETE' }); load(); }
      else if (g('rm')) { if (confirm(t('fr.removeQ'))) { await api('/friends/' + g('rm'), { method: 'DELETE' }); load(); } }
      else if (g('inv')) { net.send({ t: 'invite', to: g('inv'), base: TC[tc][0], inc: TC[tc][1] }); }
    } catch (ex) { toast(ex.message); }
  });
  await load();
  const iv = setInterval(() => load(), 20000);
  return () => clearInterval(iv);
}
