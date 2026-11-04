import { app, go } from '../app.js';
import { api, esc, avatar, flag, toast, badge } from '../util.js';
import { t, getLang } from '../i18n.js';
import * as net from '../net.js';
import { tTitle, fmtDate } from './tournaments.js';

const left = (ms) => {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(s % 60).padStart(2, '0');
};
const RES = { '1-0': '1 : 0', '0-1': '0 : 1', '1/2-1/2': '½ : ½', void: '–' };

export async function mount(root, { params }) {
  const id = params[0];
  let d;
  try { d = await api('/tournaments/' + id); } catch {
    root.innerHTML = `<div class="panel narrow"><h2>${t('err.404')}</h2><a href="/tournaments" data-link>${t('nav.tourn')}</a></div>`;
    return;
  }
  let modal = null;
  const offs = [];
  const nm = (p) => (p ? `<a href="/u/${esc(p.username)}" data-link style="color:var(--ink)">${esc(p.display)}</a>` : '—');

  function pairHtml(p) {
    const watch = p.status === 'play' && p.gameId ? ` <a href="/game/${p.gameId}" data-link class="tag">${t('tourn.watch')}</a>` : '';
    const res = p.black ? (p.status === 'play' ? '<span class="tag">●</span>' : p.result ? `<b>${RES[p.result] || ''}</b>` : '<span class="muted">…</span>') : `<span class="tag">${t('tourn.bye')}</span>`;
    return `<tr${p.status === 'redo' ? ' style="opacity:.5"' : ''}><td class="muted" style="width:30px">${p.board}</td><td>${nm(p.white)}</td><td style="text-align:center;white-space:nowrap">${res}${watch}</td><td style="text-align:right">${p.black ? nm(p.black) : ''}</td></tr>`;
  }

  function draw() {
    const x = d.tournament;
    const run = x.status === 'running', up = x.status === 'upcoming';
    const grid = x.format !== 'arena';
    const fmtName = t('tourn.format.' + x.format);
    const me = app.user && d.myPair;
    const roundLine = grid && x.curRound ? ` · ${t('tourn.roundOf', { r: x.curRound, n: x.rounds })}` : '';
    const canJoin = !d.joined && (grid ? up : (run || up));
    root.innerHTML = `
    <div class="page-h"><div><h1>${esc(tTitle(x.title))}</h1>
      <p>${fmtName}${roundLine} · ${x.base}+${x.inc}${x.rated ? '' : ', ' + t('tourn.unrated')}. ${fmtDate(x.start)}${grid ? '' : ' – ' + fmtDate(x.end)}${x.maxPlayers ? ` · ${t('tourn.max', { n: x.maxPlayers })}` : ''}</p></div>
      <a class="btn ghost" href="/tournaments" data-link>${t('back')}</a></div>
    <div class="panel">
      <div class="row" style="justify-content:space-between">
        <div><span class="tag">${t('tourn.status.' + x.status)}</span> <b id="cd" style="margin-left:8px"></b></div>
        <div class="row">${canJoin ? `<button class="big" id="join">${t('tourn.join')}</button>` : d.joined ? (!grid && run ? `<button class="big" id="play">${t('tourn.play')}</button>` : `<span class="tag">${t('tourn.joined')}</span>`) : `<span class="muted">${x.status === 'finished' ? t('tourn.over') : (grid && x.seeded !== false && x.curRound ? t('tourn.closedReg') : '')}</span>`}</div>
      </div>
      <p class="muted" style="margin:12px 0 0">${t(grid ? 'tourn.rules.' + x.format : 'tourn.rules')}</p>
      ${x.info ? `<p style="margin:10px 0 0;white-space:pre-line">${esc(x.info)}</p>` : ''}
    </div>
    ${me ? `<div class="panel" style="border-color:var(--gold)"><h2>${t('tourn.myGame')}</h2>${
      !d.myPair.black ? `<p style="margin:0">${t('tourn.byeText')}</p>`
      : d.myPair.status === 'play' ? `<div class="row" style="justify-content:space-between"><span>${nm(d.myPair.white)} — ${nm(d.myPair.black)}</span><a class="btn big" href="/game/${d.myPair.gameId}" data-link>${t('tourn.toGame')}</a></div>`
      : d.myPair.status === 'wait' ? `<p style="margin:0">${nm(d.myPair.white)} — ${nm(d.myPair.black)}<br><span class="muted">${t('tourn.waitOpp')}</span></p>`
      : `<p style="margin:0">${nm(d.myPair.white)} ${RES[d.myPair.result] || ''} ${nm(d.myPair.black)}</p>`}</div>` : ''}
    ${x.prizes && x.prizes.length ? `<div class="panel"><h2>${t('tourn.prizes')}</h2><div class="list">${x.prizes.map((p) => `<div class="li"><span style="font-size:22px">${['🥇', '🥈', '🥉'][p.place - 1] || p.place + '.'}</span><span class="grow"><b>${p.type === 'skin' ? esc(t(p.value.startsWith('board:') ? 'board.' + p.value.slice(6) : 'piece.' + p.value.slice(6))) : esc(p.value)}</b><span class="muted">${p.type === 'skin' ? t('tourn.prizeSkin') : t('tourn.prizeText')}</span></span></div>`).join('')}</div></div>` : ''}
    <div class="panel"><h2>${t('tourn.standings')}</h2>${d.standings.length ? `<div class="tbl-wrap"><table><thead><tr><th style="width:36px">#</th><th>${t('top.player')}</th>${x.format === 'elim' && x.curRound ? `<th>${t('tourn.state')}</th>` : `<th>${t('prof.games')}</th>`}<th>${t('prof.wins')}</th><th style="text-align:right">${t('tourn.points')}</th></tr></thead><tbody>
      ${d.standings.map((p, i) => `<tr><td class="num ${i < 3 ? 'rank-' + (i + 1) : 'muted'}">${i + 1}</td>
        <td class="pl"><a href="/u/${esc(p.username)}" data-link style="display:flex;align-items:center;gap:8px;color:var(--ink);min-width:0">${avatar(p.avatar, 'sm')}<b class="nm">${esc(p.display)}</b>${badge(p.badge)}${p.show_bot ? `<span class="tag-bot">${t('ui.bot')}</span>` : ''} ${flag(p.country)}</a></td>
        ${x.format === 'elim' && x.curRound ? `<td class="muted" style="white-space:nowrap">${p.out_round ? t('tourn.out', { r: p.out_round }) : t('tourn.statusIn')}</td>` : `<td class="num">${p.games}</td>`}<td class="num">${p.wins}</td><td class="num" style="text-align:right"><b>${p.points}</b></td></tr>`).join('')}</tbody></table></div>` : `<p class="muted" style="margin:0">${t('tourn.noPlayers')}</p>`}</div>
    ${d.rounds && d.rounds.length ? `<div class="panel"><h2>${t('tourn.rounds')}</h2>${[...d.rounds].reverse().map((r, i) => `<details ${i === 0 ? 'open' : ''} style="margin-top:8px"><summary style="cursor:pointer;font-weight:800">${t('tourn.round')} ${r.round}</summary><div class="tbl-wrap"><table style="margin-top:6px"><tbody>${r.pairs.map(pairHtml).join('')}</tbody></table></div></details>`).join('')}</div>` : ''}`;
    tick();
    root.querySelector('#join')?.addEventListener('click', async () => {
      if (!app.user) return go('/login?next=/tournaments/' + id);
      try { await api(`/tournaments/${id}/join`, { method: 'POST' }); await reload(); } catch (e) { toast(e.message); }
    });
    root.querySelector('#play')?.addEventListener('click', () => net.send({ t: 'seek', tid: Number(id) }));
  }

  function tick() {
    const el = root.querySelector('#cd');
    if (!el) return;
    const x = d.tournament, now = Date.now();
    el.textContent = x.status === 'upcoming' ? `${t('tourn.startsIn')} ${left(x.start - now)}` : x.status === 'running' && x.format === 'arena' ? `${t('tourn.endsIn')} ${left(x.end - now)}` : '';
  }

  async function reload() { d = await api('/tournaments/' + id); draw(); }

  // окно поиска соперника в турнире-арене
  function showSeek(m) {
    modal?.remove();
    modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="sheet seek-box"><div class="spin"></div><h2>${t('seek.title')}</h2><p class="muted">${m.base}+${m.inc}</p><div class="big-t" id="st">0:00</div><button class="ghost" id="sx">${t('cancel')}</button></div>`;
    document.body.append(modal);
    const t0 = Date.now();
    const iv = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); const el = modal?.querySelector('#st'); if (el) el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 500);
    offs.push(() => clearInterval(iv));
    modal.querySelector('#sx').onclick = () => net.send({ t: 'cancel' });
  }

  draw();
  const timer = setInterval(tick, 1000);
  const poll = setInterval(() => reload().catch(() => {}), d.tournament.format === 'arena' ? 15000 : 6000);
  offs.push(
    net.on('seeking', showSeek),
    net.on('seek-cancelled', () => { modal?.remove(); modal = null; }),
    net.on('seek-error', (m) => toast(t(m.m))),
  );
  return () => { clearInterval(timer); clearInterval(poll); modal?.remove(); offs.forEach((f) => f()); };
}
