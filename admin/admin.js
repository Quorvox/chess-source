// Админка (только для русскоязычного владельца, поэтому без переводов)
import { api, esc, avatar, flag, toast } from '/js/util.js';
import { BOARDS, PIECES } from '/js/skins.js';

// сессия закончилась: возвращаемся на страницу входа
const adm = async (p, o) => { try { return await api('/admin' + p, o); } catch (e) { if (e.message === 'forbidden') location.reload(); throw e; } };
const dt = (ts) => (ts ? new Date(ts).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const ago = (ts) => {
  if (!ts) return 'никогда';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 2) return 'только что';
  if (m < 60) return m + ' мин назад';
  if (m < 1440) return Math.round(m / 60) + ' ч назад';
  return Math.round(m / 1440) + ' дн назад';
};
const ACTIONS = {
  ban: 'бан', unban: 'разбан', 'hide-from-top': 'скрыл из топа', 'show-in-top': 'вернул в топ', rating: 'правка рейтинга', 'bot-rating': 'рейтинг бота',
  'reset-stats': 'сброс статистики', 'edit-profile': 'правка профиля', delete: 'удаление', 'bot-create': 'новый бот', 'bots-generate': 'генерация ботов',
  'bot-delete': 'удалил бота', 'bots-bulk-delete': 'массовое удаление ботов', 'bots-bulk-hide': 'скрыл ботов', 'bots-bulk-unhide': 'вернул ботов', 'bots-bulk-shift': 'сдвиг рейтинга ботов',
  settings: 'настройки', 'close-room': 'закрыл комнату', award: 'выдал награду', 'revoke-award': 'забрал награду', 'verify-email': 'подтвердил почту',
  'tournament-create': 'создал турнир', 'tournament-edit': 'изменил турнир', 'report-done': 'принял жалобу', 'report-dismissed': 'отклонил жалобу', 'backup-create': 'сделал копию базы', 'backup-download': 'скачал копию базы', 'tournament-player': 'правка сетки турнира', 'tournament-cancel': 'отменил турнир', 'game-abort': 'прервал партию',
  'tournament-finish': 'завершил турнир', badge: 'галочка', avatar: 'сменил аватар', 'verify-approve': 'одобрил заявку', 'verify-reject': 'отклонил заявку', 'news-add': 'добавил новость', 'news-delete': 'удалил новость',
};
const PROVIDER = { password: 'почта', telegram: 'Telegram', discord: 'Discord' };
const REASON = { mate: 'мат', resign: 'сдача', timeout: 'время', stalemate: 'пат', agreed: 'ничья', abandon: 'вышел', aborted: 'отмена', repetition: 'повтор', insufficient: 'нет материала', fifty: '50 ходов' };
const SKINS = [...BOARDS.map((b) => ['board:' + b.id, 'Доска: ' + b.name]), ...PIECES.map((p) => ['piece:' + p.id, 'Фигуры: ' + p.name])];
const BADGE = { blue: 'синяя галочка', gold: 'золотая галочка' };
const AVS = Array.from({ length: 12 }, (_, i) => 'p' + (i + 1));

// небольшая форма во всплывающем окне
function ask(title, fields, submit = 'Готово', note = '') {
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'modal top';
    const input = (f) => {
      if (f.type === 'select') return `<select name="${f.name}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${v === f.value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      if (f.type === 'textarea') return `<textarea name="${f.name}" ${f.required ? 'required' : ''}>${esc(f.value ?? '')}</textarea>`;
      if (f.type === 'checkbox') return `<input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''} style="width:auto">`;
      return `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" placeholder="${esc(f.ph || '')}" ${f.required ? 'required' : ''} ${f.min != null ? `min="${f.min}"` : ''}>`;
    };
    m.innerHTML = `<form class="sheet"><h2>${esc(title)}</h2>${note ? `<p class="muted" style="margin-top:0">${note}</p>` : ''}${fields.map((f) => `<label>${esc(f.label)}</label>${input(f)}`).join('')}
      <div class="row" style="margin-top:18px"><button>${esc(submit)}</button><button type="button" class="ghost" data-x>Отмена</button></div></form>`;
    const done = (v) => { m.remove(); resolve(v); };
    m.addEventListener('click', (e) => { if (e.target === m || e.target.dataset.x !== undefined) done(null); });
    m.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const o = {};
      for (const f of fields) { const el = e.target.elements[f.name]; o[f.name] = f.type === 'checkbox' ? el.checked : el.value; }
      done(o);
    };
    document.body.append(m);
    m.querySelector('input,select,textarea')?.focus();
  });
}

// столбики за 14 дней, без библиотек
function bars(days, key, color) {
  const max = Math.max(1, ...days.map((d) => d[key]));
  return `<div class="bars">${days.map((d) => `<div class="bar" title="${new Date(d.ts).toLocaleDateString('ru-RU')}: ${d[key]}"><i style="height:${Math.max(3, d[key] / max * 100)}%;background:${color}"></i><span>${new Date(d.ts).getDate()}</span></div>`).join('')}</div>`;
}
// линия рейтинга по последним партиям
function spark(points) {
  if (points.length < 2) return '<p class="muted" style="margin:0">Мало партий для графика.</p>';
  const lo = Math.min(...points), hi = Math.max(...points), w = 300, h = 70;
  const xy = points.map((v, i) => `${(i / (points.length - 1) * w).toFixed(1)},${(h - 6 - (v - lo) / Math.max(1, hi - lo) * (h - 12)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:80px"><polyline points="${xy}" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg><div class="muted" style="display:flex;justify-content:space-between"><span>от ${lo}</span><span>до ${hi}</span></div>`;
}

export async function mount(root) {
  let tab = 'stats', timer = null;
  const st = { q: '', filter: '', sort: '', page: 0 };
  const NAV = [
    ['Главное', [['stats', 'Обзор'], ['games', 'Партии']]],
    ['Люди', [['users', 'Игроки'], ['verify', 'Заявки'], ['reports', 'Жалобы'], ['bots', 'Боты']]],
    ['Игра', [['tourn', 'Турниры'], ['rooms', 'Комнаты']]],
    ['Сайт', [['news', 'Новости'], ['settings', 'Настройки'], ['audit', 'Журнал']]],
  ];

  root.innerHTML = `<div class="adm"><nav class="adm-nav" id="tb">${NAV.map(([g, items]) => `<div class="g">${g}</div>${items.map(([k, t]) => `<button data-t="${k}">${t}</button>`).join('')}`).join('')}</nav><section id="body"></section></div>`;
  const body = root.querySelector('#body');
  root.querySelector('#tb').onclick = (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; Object.assign(st, { q: '', filter: '', sort: '', page: 0 }); draw(); } };

  async function draw() {
    clearInterval(timer);
    body.onclick = null;
    root.querySelectorAll('#tb button').forEach((b) => { b.classList.toggle('on', b.dataset.t === tab); });
    body.innerHTML = '<p class="muted">Загружаем…</p>';
    try { await views[tab](); } catch (e) { body.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }
  const run = async (fn, okMsg = 'Готово') => { try { const r = await fn(); toast(okMsg); return r || true; } catch (e) { toast(e.message); return false; } };
  const userAct = (id, action, extra = {}) => adm('/user/' + id, { method: 'POST', body: { action, ...extra } });
  const pager = (total, per) => (total > per ? `<div class="row" style="justify-content:center;margin-top:12px"><button class="ghost" data-pg="-1" ${st.page <= 0 ? 'disabled' : ''}>←</button><span class="muted">${st.page * per + 1}–${Math.min(total, (st.page + 1) * per)} из ${total}</span><button class="ghost" data-pg="1" ${(st.page + 1) * per >= total ? 'disabled' : ''}>→</button></div>` : '');

  // партия: ходы и результат
  async function openGame(id) {
    const { game: g } = await adm('/games/' + id);
    const m = document.createElement('div');
    m.className = 'modal top';
    m.innerHTML = `<div class="sheet" style="width:min(640px,100%)"><h2>${esc(g.white_name)} — ${esc(g.black_name)}</h2>
      <p class="muted" style="margin-top:0">${g.base}+${g.inc}, ${g.rated ? 'рейтинговая' : 'без рейтинга'}, ${g.result || 'не закончена'} (${esc(REASON[g.reason] || g.reason || '')}), ${g.moves} ходов, ${dt(g.ended)}${g.white_bot || g.black_bot ? ', <b>с ботом</b>' : ''}</p>
      <textarea readonly rows="8" style="font-family:monospace">${esc(g.pgn || '')}</textarea>
      <div class="row" style="margin-top:14px"><button class="ghost" data-x>Закрыть</button></div></div>`;
    m.addEventListener('click', (e) => { if (e.target === m || e.target.dataset.x !== undefined) m.remove(); });
    document.body.append(m);
  }

  // карточка игрока или бота: вкладки
  async function openUser(id, sub = 'profile') {
    const d = await adm('/user/' + id);
    const u = d.user, s = d.stats;
    const wr = u.games ? Math.round(u.wins / u.games * 100) : 0;
    const m = document.createElement('div');
    m.className = 'modal top';
    const tabs = [['profile', 'Профиль'], ['stats', 'Статистика'], ['awards', 'Награды'], ['log', 'История'], ['danger', 'Опасное']];
    const panes = {
      profile: () => `<form id="pf">
        <div class="row"><div style="flex:1;min-width:160px"><label>Ник (для входа и ссылок)</label><input name="username" value="${esc(u.username)}" maxlength="20"></div><div style="flex:1;min-width:160px"><label>Имя на сайте</label><input name="display" value="${esc(u.display)}" maxlength="24"></div></div>
        <label>${u.is_bot ? 'История бота (видна в профиле)' : 'О себе'}</label><textarea name="bio" maxlength="${u.is_bot ? 800 : 200}" rows="${u.is_bot ? 5 : 3}">${esc(u.bio)}</textarea>
        ${u.is_bot ? `<label>Фразы бота в чате партии (каждая с новой строки, до 40)</label><textarea name="phrases" rows="5" placeholder="Хороший ход&#10;Удачи!&#10;Давно не играл...">${esc(u.phrases || '')}</textarea>` : ''}
        <div class="row"><div style="flex:1"><label>Страна (код, DE, RU…)</label><input name="country" value="${esc(u.country)}" maxlength="2"></div>
          <div style="flex:1"><label>Победы / поражения / ничьи</label><div class="row" style="flex-wrap:nowrap"><input name="wins" type="number" min="0" value="${u.wins}"><input name="losses" type="number" min="0" value="${u.losses}"><input name="draws" type="number" min="0" value="${u.draws}"></div></div></div>
        ${u.is_bot ? `<label>Всего партий</label><input name="games" type="number" min="0" value="${u.games}">
        <div class="row"><div style="flex:1;min-width:150px"><label>Шанс принять ничью, %</label><input name="draw_accept" type="number" min="0" max="100" value="${u.draw_accept}"></div><div style="flex:1;min-width:150px"><label>Шанс предложить ничью, % на ход</label><input name="draw_offer" type="number" min="0" max="100" value="${u.draw_offer}"></div></div>
        <label class="switch"><span>Показывать как бота (зелёная плашка «бот»)<small>Если выключено, выглядит как обычный игрок</small></span><input type="checkbox" name="show_bot" ${u.show_bot ? 'checked' : ''}></label>
        <label class="switch"><span>Всегда онлайн (24/7)<small>Иначе «заходит» на сайт на время и «уходит»</small></span><input type="checkbox" name="always_on" ${u.always_on ? 'checked' : ''}></label>` : ''}
        <label>Своя картинка (PNG, JPG или WebP до 400 КБ)</label><div class="row" style="flex-wrap:nowrap"><input type="file" id="avfile" accept="image/png,image/jpeg,image/webp"></div>
        <label>Или готовый аватар</label><div class="avs" id="avp">${AVS.map((a) => `<button type="button" data-a="${a}" class="${u.avatar === a ? 'on' : ''}">${avatar(a)}</button>`).join('')}</div>
        ${u.is_bot ? '' : '<label>Причина (нужна, если меняешь ник; попадёт в журнал)</label><input name="reason">'}
        <div class="row" style="margin-top:16px"><button>Сохранить</button><button type="button" class="ghost" data-a="rating">Изменить рейтинг (${u.rating})</button><button type="button" class="ghost" data-a="badge">Галочка: ${BADGE[u.badge] || 'авто'}</button></div></form>
        <table style="margin-top:16px"><tbody>
          <tr><td class="muted">Почта</td><td>${esc(u.email || '—')} ${u.email ? (u.email_verified ? '<span class="tag">подтверждена</span>' : '<span class="tag" style="color:var(--red)">не подтверждена</span> <button class="ghost" data-a="verify-email" style="padding:4px 10px">Подтвердить</button>') : ''}</td></tr>
          <tr><td class="muted">Способ входа</td><td>${PROVIDER[u.provider] || (u.is_bot ? 'бот, входа нет' : esc(u.provider))}${u.provider_id ? ' (' + esc(u.provider_id) + ')' : ''}</td></tr>
          <tr><td class="muted">IP: регистрация / последний</td><td>${esc(u.reg_ip || '—')} / ${esc(u.last_ip || '—')}</td></tr>
          <tr><td class="muted">Регистрация / был онлайн</td><td>${dt(u.created)} / ${ago(u.last_seen)}</td></tr></tbody></table>`,
      stats: () => `<div class="stats" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr));margin:0 0 14px">
          ${[['Рейтинг', u.rating], ['Лучший', s.best], ['Партий', u.games], ['Побед', u.wins + ' (' + wr + '%)'], ['Поражений', u.losses], ['Ничьих', u.draws], ['Белыми', s.asWhite], ['Чёрными', s.asBlack], ['Рейтинговых', s.rated], ['Против ботов', s.vsBots]].map(([t, v]) => `<div class="stat"><b>${v}</b><span>${t}</span></div>`).join('')}</div>
        <h3 style="margin:0 0 6px">Рейтинг по последним партиям</h3>${spark(d.games.filter((g) => g.rated).reverse().map((g) => g.myRating))}
        <h3 style="margin:16px 0 6px">Последние партии</h3>
        <div class="list">${d.games.slice(0, 15).map((g) => `<a href="#" data-game="${g.id}"><span class="res r${g.score === 1 ? 'w' : g.score === 0 ? 'l' : 'd'}">${g.score === 1 ? 'W' : g.score === 0 ? 'L' : '½'}</span><span class="grow"><b>против ${esc(g.opp)} (${g.oppRating})${g.vsBot ? ' <span class="tag">бот</span>' : ''}</b><span class="muted">${g.base}+${g.inc}, ${esc(REASON[g.reason] || g.reason)}, ${g.moves} ходов, ${dt(g.ended)}${g.rated ? '' : ', без рейтинга'}</span></span></a>`).join('') || '<div class="empty">Партий нет.</div>'}</div>`,
      awards: () => `<div class="list">${d.awards.map((a) => `<div class="li"><span class="grow"><b>${a.kind === 'skin' ? 'Скин' : 'Значок'}: ${esc(a.value)}</b><span class="muted">${dt(a.ts)}, выдал ${esc(a.by_name)}${a.note ? ', ' + esc(a.note) : ''}</span></span><button class="danger" data-revoke="${a.id}" style="padding:6px 12px">Забрать</button></div>`).join('') || '<div class="empty">Наград нет.</div>'}</div>
        <div class="row" style="margin-top:12px"><button data-a="award">Выдать награду</button></div>`,
      log: () => `<div class="list">${d.log.map((l) => `<div class="li"><span class="grow"><b>${esc(ACTIONS[l.action] || l.action)}, ${esc(l.admin_name)}</b><span class="muted">${dt(l.ts)}${l.details ? ', ' + esc(l.details) : ''}</span></span></div>`).join('') || '<div class="empty">Админы пока ничего не делали с этим аккаунтом.</div>'}</div>`,
      danger: () => `<p class="muted" style="margin-top:0">${u.is_bot ? 'Бота можно удалить насовсем: из топа он пропадёт, сыгранные партии останутся в истории.' : 'Аккаунт игрока при удалении обезличивается, партии остаются.'}</p>
        <div class="row"><button class="${u.banned ? 'ghost' : 'danger'}" data-a="${u.banned ? 'unban' : 'ban'}">${u.banned ? 'Разбанить' : 'Забанить'}</button>
          <button class="ghost" data-a="${u.hidden ? 'unhide' : 'hide'}">${u.hidden ? 'Вернуть в топ' : 'Скрыть из топа'}</button>
          <button class="ghost" data-a="reset">Сбросить рейтинг и статистику</button><button class="danger" data-a="delete">${u.is_bot ? 'Удалить бота' : 'Удалить аккаунт'}</button></div>
        ${u.banned ? `<p class="muted">Причина бана: ${esc(u.ban_reason)}</p>` : ''}`,
    };
    m.innerHTML = `<div class="sheet" style="width:min(780px,100%)">
      <div class="head" style="margin-bottom:12px">${avatar(u.avatar, 'lg')}<div style="flex:1;min-width:180px"><h2 style="margin:0">${esc(u.display)} ${flag(u.country)}</h2>
        <div class="muted">@${esc(u.username)} ${BADGE[u.badge] ? `<span class="tag">${BADGE[u.badge]}</span>` : ''}${u.is_bot ? '<span class="tag">бот</span>' : ''}${u.banned ? '<span class="tag" style="color:var(--red)">бан</span>' : ''}${u.hidden ? '<span class="tag">скрыт из топа</span>' : ''}</div>
        <div class="muted">Рейтинг <b style="color:var(--ink)">${u.rating}</b> · партий ${u.games} · был онлайн ${ago(u.last_seen)}</div></div><button class="ghost" data-x>✕</button></div>
      <div class="tabs sub">${tabs.map(([k, t]) => `<button data-sub="${k}" class="${k === sub ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div id="pane">${panes[sub]()}</div></div>`;
    const reopen = async (to = sub) => { m.remove(); await openUser(id, to); };
    m.addEventListener('click', async (e) => {
      if (e.target === m || e.target.closest('[data-x]')) { m.remove(); draw(); return; }
      const sb = e.target.closest('[data-sub]')?.dataset.sub;
      if (sb) { m.querySelectorAll('[data-sub]').forEach((b) => b.classList.toggle('on', b.dataset.sub === sb)); sub = sb; m.querySelector('#pane').innerHTML = panes[sb](); return; }
      const gm = e.target.closest('[data-game]');
      if (gm) { e.preventDefault(); openGame(gm.dataset.game); return; }
      const av = e.target.closest('#avp button');
      if (av) { m.querySelectorAll('#avp button').forEach((b) => b.classList.toggle('on', b === av)); return; }
      const rev = e.target.closest('[data-revoke]')?.dataset.revoke;
      if (rev) { await run(() => userAct(id, 'revoke', { value: rev })); return reopen(); }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a || e.target.closest('#avp')) return;
      let extra = null;
      if (a === 'rating') { const f = await ask('Новый рейтинг', [{ name: 'value', label: 'Рейтинг (100–3500)', type: 'number', value: u.rating, required: true }, { name: 'reason', label: u.is_bot ? 'Причина (необязательно)' : 'Причина (её увидят в журнале)', required: !u.is_bot }]); if (f) extra = f; }
      else if (a === 'badge') { const f = await ask('Галочка у ника', [{ name: 'value', label: 'Какая', type: 'select', value: u.badge || '', options: [['', 'Автоматическая (зелёная, если подтверждён)'], ['blue', 'Синяя: заслуги, известность'], ['gold', 'Золотая: команда проекта']] }, { name: 'reason', label: 'Комментарий' }]); if (f) extra = f; }
      else if (a === 'award') { const f = await ask('Выдать награду', [{ name: 'kind', label: 'Тип', type: 'select', value: 'skin', options: [['skin', 'Скин'], ['badge', 'Значок']] }, { name: 'skin', label: 'Скин (для типа «Скин»)', type: 'select', value: 'board:gold', options: SKINS }, { name: 'text', label: 'Текст значка (для типа «Значок»)', ph: 'Например: Тестер' }, { name: 'reason', label: 'Комментарий' }]); if (f) extra = { kind: f.kind, award: f.kind === 'skin' ? f.skin : f.text, reason: f.reason }; }
      else if (['ban', 'reset', 'delete'].includes(a)) {
        const f = await ask(a === 'delete' ? (u.is_bot ? 'Удалить бота насовсем?' : 'Удалить аккаунт?') : 'Причина', [{ name: 'reason', label: 'Причина (её увидят в журнале)', required: !u.is_bot || a === 'ban' }], a === 'delete' ? 'Удалить' : 'Готово');
        if (f) extra = f;
        if (extra && a === 'delete') { if (await run(() => userAct(id, a, extra), 'Удалено')) { m.remove(); draw(); } return; }
      } else extra = {};
      if (!extra) return;
      await run(() => userAct(id, a, extra));
      reopen(a === 'rating' || a === 'verify-email' ? 'profile' : sub);
    });
    m.addEventListener('change', async (e) => {
      if (e.target.id !== 'avfile' || !e.target.files[0]) return;
      const f = e.target.files[0];
      if (f.size > 400 * 1024) return toast('Файл больше 400 КБ');
      try {
        const r = await fetch(`/api/admin/user/${id}/avatar`, { method: 'POST', headers: { 'content-type': f.type, 'x-requested-with': 'qc' }, body: f });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Не получилось загрузить');
        toast('Аватар обновлён');
        reopen('profile');
      } catch (ex) { toast(ex.message); }
    });
    m.addEventListener('submit', async (e) => {
      if (e.target.id !== 'pf') return;
      e.preventDefault();
      const f = e.target, o = {};
      for (const el of f.elements) if (el.name) o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      o.avatar = m.querySelector('#avp .on')?.dataset.a || u.avatar;
      if (await run(() => userAct(id, 'edit', o), 'Сохранено')) reopen('profile');
    });
    document.body.append(m);
  }

  const openRow = (e) => { const o = e.target.closest('[data-open]'); if (o && !e.target.closest('input')) { e.preventDefault(); openUser(o.dataset.open); return true; } };
  const ratedTag = (g) => (g.rated ? '' : ' <span class="tag">без рейтинга</span>');

  const views = {
    async stats() {
      const load = async () => {
        const [s, ser, live] = await Promise.all([adm('/stats'), adm('/series'), adm('/games/live')]);
        const cards = [['Игроков', s.users], ['Новых за сутки', s.newToday], ['Активных за сутки', s.activeToday], ['Онлайн сейчас', s.online], ['Партий идёт', s.activeGames], ['В поиске', s.queue],
          ['Открытых комнат', s.openRooms], ['Партий всего', s.gamesTotal], ['Партий за сутки', s.gamesToday], ['Против ботов', s.gamesVsBots], ['С почтой', s.withEmail],
          ['Через Telegram', s.viaTelegram], ['Через Discord', s.viaDiscord], ['Забанено', s.banned], ['Ботов', s.bots], ['RAM сервера, МБ', s.rssMB], ['База, МБ', s.dbMB], ['Аптайм, ч', s.uptimeH]];
        body.innerHTML = `<div class="stats" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-top:0">${cards.map(([t, v]) => `<div class="stat"><b>${v}</b><span>${t}</span></div>`).join('')}</div>
          <div class="cols" style="margin-top:16px"><div class="panel"><h3 style="margin:0 0 8px">Регистрации за 14 дней</h3>${bars(ser.days, 'users', 'var(--green)')}</div>
          <div class="panel"><h3 style="margin:0 0 8px">Партии за 14 дней</h3>${bars(ser.days, 'games', 'var(--gold)')}</div></div>
          <div class="panel" style="margin-top:16px"><h3 style="margin:0 0 8px">Играют прямо сейчас (${live.games.length})</h3>
          <div class="list">${live.games.map((g) => `<div class="li"><span class="grow"><b>${esc(g.white.username)} (${g.white.rating}) — ${esc(g.black.username)} (${g.black.rating})</b><span class="muted">${g.base}+${g.inc}, ходов ${g.moves}${g.tid ? ', турнир' : ''}${g.white.bot || g.black.bot ? ', с ботом' : ', двое живых'}</span></span></div>`).join('') || '<div class="empty">Сейчас никто не играет.</div>'}</div></div>`;
      };
      await load();
      timer = setInterval(() => load().catch(() => {}), 8000);
    },

    async users() {
      body.innerHTML = `<div class="row" style="margin-bottom:12px"><input id="q" placeholder="Поиск: ник, почта, IP" value="${esc(st.q)}" style="max-width:300px">
        <select id="flt" style="width:auto"><option value="">Все</option><option value="online">Онлайн сейчас</option><option value="today">Были за сутки</option><option value="unverified">Почта не подтверждена</option><option value="banned">Забаненные</option><option value="hidden">Скрытые из топа</option></select>
        <select id="sort" style="width:auto"><option value="">Недавние</option><option value="new">Новые</option><option value="rating">По рейтингу</option><option value="games">По партиям</option></select></div>
        <div class="panel" style="overflow:auto"><div id="tbl"></div></div>`;
      body.querySelector('#flt').value = st.filter; body.querySelector('#sort').value = st.sort;
      const load = async () => {
        const r = await adm(`/users?q=${encodeURIComponent(st.q)}&sort=${st.sort}&filter=${st.filter}&page=${st.page}`);
        body.querySelector('#tbl').innerHTML = `<table class="rows"><thead><tr><th>Игрок</th><th>Почта</th><th>Вход</th><th>IP</th><th>Рейтинг</th><th>Партий</th><th>Был</th></tr></thead><tbody>${r.users.map((u) => `<tr data-open="${u.id}"><td>${avatar(u.avatar, 'sm')} <b>${esc(u.username)}</b> ${u.banned ? '<span class="tag" style="color:var(--red)">бан</span>' : ''}${u.hidden ? '<span class="tag">скрыт</span>' : ''}${u.awards ? `<span class="tag">★${u.awards}</span>` : ''}</td>
          <td class="muted">${esc(u.email || '—')}${u.email && u.email_verified ? ' ✓' : ''}</td><td class="muted">${PROVIDER[u.provider] || u.provider}</td><td class="muted">${esc(u.last_ip || '—')}</td><td class="num">${u.rating}</td><td class="num">${u.games}</td><td class="muted">${ago(u.last_seen)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Никого не нашли</td></tr>'}</tbody></table>${pager(r.total, r.per)}`;
      };
      let t;
      body.querySelector('#q').oninput = (e) => { st.q = e.target.value; st.page = 0; clearTimeout(t); t = setTimeout(load, 300); };
      body.querySelector('#flt').onchange = (e) => { st.filter = e.target.value; st.page = 0; load(); };
      body.querySelector('#sort').onchange = (e) => { st.sort = e.target.value; st.page = 0; load(); };
      body.onclick = (e) => { if (openRow(e)) return; const pg = e.target.closest('[data-pg]'); if (pg) { st.page += Number(pg.dataset.pg); load(); } };
      await load();
    },

    async reports() {
      let status = 'new';
      const REASON_RU = { cheat: 'Читерство', abuse: 'Оскорбления', other: 'Другое' };
      const load = async () => {
        const { reports, pending } = await adm('/reports?status=' + status);
        body.innerHTML = `<div class="tabs sub"><button data-st="new" class="${status === 'new' ? 'on' : ''}">Новые${pending ? ' (' + pending + ')' : ''}</button><button data-st="done" class="${status === 'done' ? 'on' : ''}">Рассмотренные</button></div>
          <p class="muted" style="margin-top:0">Жалобы из партий. Открой партию и игрока, при необходимости забань или сбрось рейтинг в карточке, потом закрой жалобу.</p>
          <div class="list panel">${reports.map((r) => `<div class="li" style="align-items:flex-start;flex-wrap:wrap"><span class="grow" style="min-width:240px"><b><span class="tag">${REASON_RU[r.reason]}</span> на <a href="#" data-open="${r.target_id}" style="color:var(--ink)">${esc(r.target)}</a>${r.target_bot ? ' <span class="tag">бот</span>' : ''}${r.target_banned ? ' <span class="tag" style="color:var(--red)">бан</span>' : ''}</b>
            <span class="muted" style="white-space:normal">Пожаловался ${esc(r.reporter)}, ${dt(r.ts)}. Таких жалоб на игрока: ${r.same_count}.</span>${r.text ? `<span style="white-space:normal;margin-top:4px">${esc(r.text)}</span>` : ''}</span>
            <span class="row" style="flex-wrap:nowrap"><button class="ghost" data-game="${esc(r.game_id)}">Партия</button>${status === 'new' ? `<button data-done="${r.id}">Принять</button><button class="ghost" data-dis="${r.id}">Отклонить</button>` : `<span class="tag">${esc(r.handled_by)}</span>`}</span></div>`).join('') || '<div class="empty">Жалоб нет.</div>'}</div>`;
      };
      body.onclick = async (e) => {
        if (openRow(e)) return;
        const st2 = e.target.closest('[data-st]')?.dataset.st; if (st2) { status = st2; return load(); }
        const gm = e.target.closest('[data-game]')?.dataset.game; if (gm) return openGame(gm);
        const dn = e.target.closest('[data-done]')?.dataset.done, ds = e.target.closest('[data-dis]')?.dataset.dis;
        if (dn || ds) { if (await run(() => adm('/reports/' + (dn || ds), { method: 'POST', body: { action: dn ? 'done' : 'dismiss' } }), 'Готово')) load(); }
      };
      await load();
    },

    async verify() {
      let status = 'new';
      const load = async () => {
        const { requests, pending } = await adm('/verify?status=' + status);
        body.innerHTML = `<div class="tabs sub"><button data-st="new" class="${status === 'new' ? 'on' : ''}">Новые${pending ? ' (' + pending + ')' : ''}</button><button data-st="approved" class="${status === 'approved' ? 'on' : ''}">Одобренные</button><button data-st="rejected" class="${status === 'rejected' ? 'on' : ''}">Отклонённые</button></div>
          <p class="muted" style="margin-top:0">Зелёная галочка ставится сама (почта подтверждена или вход через Telegram/Discord). Здесь заявки на синюю и золотую, которые игроки подают через бота.</p>
          <div class="list panel">${requests.map((r) => `<div class="li" style="align-items:flex-start;flex-wrap:wrap"><span>${avatar(r.avatar, 'sm')}</span><span class="grow" style="min-width:220px"><b><a href="#" data-open="${r.user_id}" style="color:var(--ink)">${esc(r.display)} (@${esc(r.username)})</a> <span class="tag">${r.kind === 'gold' ? 'золотая' : 'синяя'}</span></b>
            <span class="muted" style="white-space:normal">Рейтинг ${r.rating}, партий ${r.games}, ${dt(r.ts)}</span><span style="white-space:normal;margin-top:6px">${esc(r.text)}</span>${r.answer ? `<span class="muted" style="white-space:normal">Ответ: ${esc(r.answer)}</span>` : ''}</span>
            ${status === 'new' ? `<span class="row" style="flex-wrap:nowrap"><button data-yes="${r.id}">Одобрить</button><button class="danger" data-no="${r.id}">Отклонить</button></span>` : `<span class="tag">${esc(r.decided_by)}</span>`}</div>`).join('') || '<div class="empty">Заявок нет.</div>'}</div>`;
      };
      body.onclick = async (e) => {
        if (openRow(e)) return;
        const st2 = e.target.closest('[data-st]')?.dataset.st; if (st2) { status = st2; return load(); }
        const yes = e.target.closest('[data-yes]')?.dataset.yes, no = e.target.closest('[data-no]')?.dataset.no;
        if (yes || no) {
          const f = await ask(yes ? 'Одобрить заявку' : 'Отклонить заявку', [{ name: 'answer', label: 'Комментарий игроку (он увидит его в боте)' }], yes ? 'Одобрить' : 'Отклонить');
          if (f && await run(() => adm('/verify/' + (yes || no), { method: 'POST', body: { approve: !!yes, answer: f.answer } }), 'Готово')) load();
        }
      };
      await load();
    },

    async bots() {
      const sel = new Set();
      body.innerHTML = `<div class="row" style="margin-bottom:12px"><button id="nb">Новый бот</button><button class="ghost" id="gen">Сгенерировать пачку</button><button class="ghost" id="setall">Настроить всех ботов</button>
        <input id="q" placeholder="Поиск по нику" value="${esc(st.q)}" style="max-width:220px"><span class="grow"></span><span class="muted" id="cnt"></span></div>
        <div class="row bulk" id="bulk" hidden><b id="sc"></b><button class="ghost" data-b="settings">Настройки</button><button class="ghost" data-b="shift">Сдвинуть рейтинг</button><button class="ghost" data-b="hide">Скрыть из топа</button><button class="ghost" data-b="unhide">Вернуть в топ</button><button class="danger" data-b="delete">Удалить выбранных</button></div>
        <div class="panel" style="overflow:auto"><div id="tbl"></div></div>
        <div class="panel" style="margin-top:16px"><h3 style="margin:0 0 6px">Опасная зона</h3><p class="muted" style="margin-top:0">Удалить сразу всех ботов. Партии останутся в истории, из топа и турниров боты пропадут. Играющих сейчас пропустим.</p><button class="danger" id="nuke">Удалить всех ботов</button></div>`;
      const botSettingsForm = async () => {
        const tri = [['', 'не менять'], ['1', 'включить'], ['0', 'выключить']];
        const f = await ask('Настройки ботов', [{ name: 'draw_accept', label: 'Шанс принять ничью, % (пусто = не менять)', type: 'number' }, { name: 'draw_offer', label: 'Шанс предложить ничью, % на ход (пусто = не менять)', type: 'number' }, { name: 'show_bot', label: 'Показывать как бота', type: 'select', value: '', options: tri }, { name: 'always_on', label: 'Всегда онлайн (24/7)', type: 'select', value: '', options: tri }], 'Применить');
        return f;
      };
      let rows = [];
      const sync = () => {
        const box = body.querySelector('#bulk');
        box.hidden = !sel.size;
        body.querySelector('#sc').textContent = 'Выбрано: ' + sel.size;
        const all = body.querySelector('#all');
        if (all) all.checked = rows.length > 0 && rows.every((u) => sel.has(u.id));
      };
      const load = async () => {
        const r = await adm(`/users?bots=1&q=${encodeURIComponent(st.q)}&page=${st.page}&sort=${st.sort || 'rating'}`);
        rows = r.users;
        body.querySelector('#cnt').textContent = 'Всего: ' + r.total;
        body.querySelector('#tbl').innerHTML = `<table class="rows"><thead><tr><th style="width:30px"><input type="checkbox" id="all" style="width:auto"></th><th>Бот</th><th>Рейтинг</th><th>Партий</th><th>Побед</th><th>Создан</th></tr></thead><tbody>${rows.map((u) => `<tr data-open="${u.id}"><td><input type="checkbox" data-sel="${u.id}" ${sel.has(u.id) ? 'checked' : ''} style="width:auto"></td><td>${avatar(u.avatar, 'sm')} <b>${esc(u.username)}</b> ${flag(u.country)}${u.hidden ? ' <span class="tag">скрыт</span>' : ''}</td><td class="num">${u.rating}</td><td class="num">${u.games}</td><td class="num">${u.wins}</td><td class="muted">${dt(u.created)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Ботов нет</td></tr>'}</tbody></table>${pager(r.total, r.per)}`;
        sync();
      };
      let t;
      body.querySelector('#q').oninput = (e) => { st.q = e.target.value; st.page = 0; clearTimeout(t); t = setTimeout(load, 300); };
      body.onclick = async (e) => {
        const cb = e.target.closest('[data-sel]');
        if (cb) { cb.checked ? sel.add(Number(cb.dataset.sel)) : sel.delete(Number(cb.dataset.sel)); sync(); return; }
        if (e.target.id === 'all') { rows.forEach((u) => (e.target.checked ? sel.add(u.id) : sel.delete(u.id))); body.querySelectorAll('[data-sel]').forEach((c) => { c.checked = e.target.checked; }); sync(); return; }
        if (openRow(e)) return;
        const pg = e.target.closest('[data-pg]');
        if (pg) { st.page += Number(pg.dataset.pg); load(); return; }
        const b = e.target.closest('[data-b]')?.dataset.b;
        if (b) {
          const ids = [...sel];
          let extra = {};
          if (b === 'settings') { const f = await botSettingsForm(); if (!f) return; extra = f; }
          if (b === 'shift') { const f = await ask('Сдвинуть рейтинг', [{ name: 'value', label: 'На сколько (можно минус, например −100)', type: 'number', value: 100, required: true }]); if (!f) return; extra = { value: Number(f.value) }; }
          if (b === 'delete' && !confirm(`Удалить выбранных ботов (${ids.length}) насовсем?`)) return;
          const r = await run(() => adm('/bots/bulk', { method: 'POST', body: { action: b, ids, ...extra } }), 'Готово');
          if (r) { sel.clear(); load(); }
        }
        if (e.target.id === 'setall') {
          const f = await botSettingsForm();
          if (f && confirm('Применить ко ВСЕМ ботам?')) await run(() => adm('/bots/bulk', { method: 'POST', body: { action: 'settings', ...f } }), 'Применено');
        }
        if (e.target.id === 'nuke') {
          const f = await ask('Удалить ВСЕХ ботов?', [{ name: 'confirm', label: 'Для подтверждения введи слово УДАЛИТЬ', required: true }], 'Удалить всех', 'Это нельзя отменить. Рейтинговый поиск после этого будет искать только живых игроков, пока ты не создашь новых ботов.');
          if (f) { const r = await run(() => adm('/bots/bulk', { method: 'POST', body: { action: 'delete', confirm: f.confirm } }), 'Боты удалены'); if (r) { sel.clear(); load(); } }
        }
        if (e.target.id === 'nb') {
          const f = await ask('Новый бот', [{ name: 'username', label: 'Ник (латиница, цифры, _)', required: true }, { name: 'display', label: 'Имя на сайте' }, { name: 'rating', label: 'Рейтинг', type: 'number', value: 1400 }, { name: 'country', label: 'Страна (DE, RU…)' }, { name: 'bio', label: 'О себе' }, { name: 'daysAgo', label: 'Зарегистрирован дней назад', type: 'number', value: 30 }, { name: 'drawAccept', label: 'Шанс принять ничью, %', type: 'number', value: 20 }, { name: 'drawOffer', label: 'Шанс предложить ничью, % на ход', type: 'number', value: 3 }, { name: 'showBot', label: 'Показывать как бота (плашка «бот»)', type: 'checkbox', value: false }, { name: 'alwaysOn', label: 'Всегда онлайн (24/7)', type: 'checkbox', value: false }]);
          if (f && await run(() => adm('/bot', { method: 'POST', body: f }), 'Бот добавлен')) load();
        }
        if (e.target.id === 'gen') {
          const f = await ask('Сгенерировать ботов', [{ name: 'count', label: 'Сколько (до 50)', type: 'number', value: 10 }, { name: 'min', label: 'Рейтинг от', type: 'number', value: 900 }, { name: 'max', label: 'Рейтинг до', type: 'number', value: 2000 }]);
          if (f && await run(() => adm('/bots/generate', { method: 'POST', body: f }), 'Боты созданы')) load();
        }
      };
      await load();
    },

    async games() {
      body.innerHTML = `<div class="panel"><h3 style="margin:0 0 8px">Идут сейчас</h3><div id="live"></div></div>
        <div class="row" style="margin:16px 0 12px"><input id="q" placeholder="Ник игрока или номер партии" value="${esc(st.q)}" style="max-width:300px"><select id="fl" style="width:auto"><option value="">Все</option><option value="1">Только рейтинговые</option></select></div>
        <div class="panel" style="overflow:auto"><div id="tbl"></div></div>`;
      const liveLoad = async () => {
        const { games } = await adm('/games/live');
        body.querySelector('#live').innerHTML = games.length ? `<table><thead><tr><th>Белые</th><th>Чёрные</th><th>Время</th><th>Ходов</th><th></th></tr></thead><tbody>${games.map((g) => `<tr><td>${esc(g.white.username)} <span class="muted">${g.white.rating}${g.white.bot ? ', бот' : ''}</span></td><td>${esc(g.black.username)} <span class="muted">${g.black.rating}${g.black.bot ? ', бот' : ''}</span></td><td>${g.base}+${g.inc}</td><td class="num">${g.moves}</td><td><button class="danger" data-abort="${g.id}" style="padding:6px 12px">Прервать</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted" style="margin:0">Сейчас никто не играет.</p>';
      };
      let rated = '';
      const load = async () => {
        const r = await adm(`/games?q=${encodeURIComponent(st.q)}&rated=${rated}&page=${st.page}`);
        body.querySelector('#tbl').innerHTML = `<table class="rows"><thead><tr><th>Белые</th><th>Чёрные</th><th>Итог</th><th>Время</th><th>Ходов</th><th>Когда</th></tr></thead><tbody>${r.games.map((g) => `<tr data-game="${g.id}"><td>${esc(g.white_name)} <span class="muted">${g.white_rating}</span></td><td>${esc(g.black_name)} <span class="muted">${g.black_rating}</span></td><td>${esc(g.result || '—')} <span class="muted">${esc(REASON[g.reason] || g.reason || '')}</span>${ratedTag(g)}${g.white_bot || g.black_bot ? ' <span class="tag">бот</span>' : ''}</td><td>${g.base}+${g.inc}</td><td class="num">${g.moves}</td><td class="muted">${dt(g.ended)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Партий нет</td></tr>'}</tbody></table>${pager(r.total, r.per)}`;
      };
      let t;
      body.querySelector('#q').oninput = (e) => { st.q = e.target.value; st.page = 0; clearTimeout(t); t = setTimeout(load, 300); };
      body.querySelector('#fl').onchange = (e) => { rated = e.target.value; st.page = 0; load(); };
      body.onclick = async (e) => {
        const g = e.target.closest('[data-game]'); if (g) return openGame(g.dataset.game);
        const pg = e.target.closest('[data-pg]'); if (pg) { st.page += Number(pg.dataset.pg); return load(); }
        const ab = e.target.closest('[data-abort]')?.dataset.abort;
        if (ab && confirm('Прервать партию без изменения рейтинга?')) { await run(() => adm(`/games/${ab}/abort`, { method: 'POST' }), 'Партия прервана'); liveLoad(); load(); }
      };
      await Promise.all([liveLoad(), load()]);
      timer = setInterval(() => liveLoad().catch(() => {}), 6000);
    },

    async tourn() {
      const { tournaments } = await adm('/tournaments');
      const STAT = { upcoming: 'скоро', running: 'идёт', finished: 'завершён' };
      body.innerHTML = `<div class="row" style="margin-bottom:12px"><button id="nt">Создать турнир</button></div>
        <div class="panel" style="overflow:auto"><table class="rows"><thead><tr><th>Турнир</th><th>Время</th><th>Начало</th><th>Участников</th><th>Статус</th><th></th></tr></thead><tbody>
        ${tournaments.map((x) => `<tr data-tid="${x.id}"><td><b>${esc(x.title)}</b><div class="muted">${esc(x.kind)}${x.prizes.length ? ', призов: ' + x.prizes.length : ''}, ботов ${x.bots}, создал ${esc(x.createdBy)}</div></td><td>${x.base}+${x.inc}</td><td class="muted">${dt(x.start)}</td><td class="num">${x.players}</td>
          <td>${x.cancelled ? '<span class="tag" style="color:var(--red)">отменён</span>' : `<span class="tag">${STAT[x.status]}</span>`}</td>
          <td><div class="row" style="flex-wrap:nowrap">${!x.cancelled && x.status !== 'finished' ? `<button class="ghost" data-fin="${x.id}">Завершить</button><button class="danger" data-cancel="${x.id}">Отменить</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Турниров нет</td></tr>'}</tbody></table></div>
        <div class="panel" style="margin-top:16px"><h3 style="margin:0 0 6px">Как проходят турниры</h3><p class="muted" style="margin:0">Игрок записывается и в окне турнира жмёт «Играть»: его ищут соперника среди тех, кто тоже в турнире, а если никого нет, подставляется бот. Победа даёт 2 очка, ничья 1, поражение 0, играть можно сколько успеешь, пока идёт время. Боты из списка «набирают» очки по таймеру. В конце за первые три места выдаются медали, плюс призы, которые ты назначил (скин или любой свой текст-значок). Клик по строке открывает сетку: можно поправить очки, убрать или добавить игрока и докинуть ботов.</p></div>`;

      const places = [1, 2, 3, 4, 5];
      const prizeFields = (cur) => places.flatMap((i) => {
        const p = (cur || []).find((x) => x.place === i);
        return [
          { name: 'ps' + i, label: `Приз за ${i} место`, type: 'select', value: p ? (p.type === 'text' ? 'text' : p.value) : '', options: [['', 'Без приза'], ['text', 'Свой текст (впиши ниже)'], ...SKINS] },
          { name: 'pt' + i, label: `Свой текст приза за ${i} место`, value: p && p.type === 'text' ? p.value : '', ph: 'Например: Чемпион зимы или 5 € в Steam' },
        ];
      });
      const readExtra = (f) => String(f.pextra || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 5).map((v, i) => ({ place: 6 + i, type: 'text', value: v }));
      const readPrizes = (f) => [...places.flatMap((i) => {
        const s = f['ps' + i];
        if (s === 'text') return f['pt' + i].trim() ? [{ place: i, type: 'text', value: f['pt' + i].trim() }] : [];
        return s ? [{ place: i, type: 'skin', value: s }] : [];
      }), ...readExtra(f)];
      const TCS = [['1,0', '1+0'], ['3,0', '3+0'], ['3,2', '3+2'], ['5,0', '5+0'], ['10,0', '10+0'], ['15,10', '15+10']];
      const form = (x) => {
        const startMs = x ? x.start : Date.now() + 3600000;
        const local = new Date(startMs - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        return [
          { name: 'title', label: 'Название (можно «Русский / English»)', value: x ? x.title : '', required: true },
          { name: 'kind', label: 'Тип', type: 'select', value: x ? x.kind : 'special', options: [['special', 'Особый'], ['weekly', 'Недельный'], ['monthly', 'Месячный']] },
          { name: 'format', label: 'Формат турнира', type: 'select', value: x ? x.format : 'arena', options: [['arena', 'Арена: играют сколько успеют, пока идёт время'], ['swiss', 'Швейцарская система: раунды, пары по очкам'], ['elim', 'На выбывание: проиграл и вылетел']] },
          { name: 'rounds', label: 'Раундов (швейцарка; 0 = подобрать по числу игроков)', type: 'number', value: x ? x.rounds : 0, min: 0 },
          { name: 'maxPlayers', label: 'Максимум участников (0 = без лимита)', type: 'number', value: x ? x.maxPlayers : 0, min: 0 },
          { name: 'winPlaces', label: 'Сколько призовых мест (1–10)', type: 'number', value: x ? x.winPlaces : 3, min: 1 },
          { name: 'graceSec', label: 'Секунд на явку к партии (иначе поражение)', type: 'number', value: x ? x.graceSec : 120, min: 30 },
          { name: 'breakSec', label: 'Пауза между раундами, секунд', type: 'number', value: x ? x.breakSec : 30, min: 5 },
          { name: 'start', label: 'Начало', type: 'datetime-local', value: local, required: true },
          { name: 'minutes', label: 'Длительность, минут', type: 'number', value: x ? Math.round((x.end - x.start) / 60000) : 60, min: 10 },
          { name: 'tc', label: 'Контроль времени', type: 'select', value: x ? `${x.base},${x.inc}` : '3,0', options: TCS },
          { name: 'bots', label: 'Сколько ботов записать (0–60)', type: 'number', value: x ? x.bots : 12 },
          ...prizeFields(x && x.prizes),
          { name: 'pextra', label: 'Призы за 6–10 места (каждый с новой строки, свой текст)', type: 'textarea', value: x ? (x.prizes || []).filter((p) => p.place >= 6).sort((a, b) => a.place - b.place).map((p) => p.value).join('\n') : '' },
          { name: 'info', label: 'Описание: как проходит турнир (увидят игроки)', type: 'textarea', value: x ? x.info : '' },
          { name: 'rated', label: 'Рейтинговые партии', type: 'checkbox', value: x ? x.rated : true },
        ];
      };
      const payload = (f) => { const [base, inc] = f.tc.split(',').map(Number); return { title: f.title, kind: f.kind, start: new Date(f.start).getTime(), minutes: Number(f.minutes), base, inc, bots: Number(f.bots), prizes: readPrizes(f), info: f.info, rated: f.rated, format: f.format, rounds: Number(f.rounds), maxPlayers: Number(f.maxPlayers), winPlaces: Number(f.winPlaces), graceSec: Number(f.graceSec), breakSec: Number(f.breakSec) }; };

      // сетка: очки, участники, боты
      async function openGrid(id) {
        const d = await adm('/tournaments/' + id);
        const x = d.tournament;
        const m = document.createElement('div');
        m.className = 'modal top';
        const post = (b) => adm(`/tournaments/${id}/players`, { method: 'POST', body: b });
        const rows = () => d.players.map((p) => `<tr data-uid="${p.id}"><td>${esc(p.username)} ${p.is_bot ? '<span class="tag">бот</span>' : ''}</td>
          <td><input type="number" min="0" data-f="points" value="${p.points}" style="width:70px"></td><td><input type="number" min="0" data-f="games" value="${p.games}" style="width:70px"></td><td><input type="number" min="0" data-f="wins" value="${p.wins}" style="width:70px"></td>
          <td><button class="ghost" data-save style="padding:6px 12px">Сохранить</button> <button class="danger" data-del style="padding:6px 12px">Убрать</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Участников пока нет</td></tr>';
        m.innerHTML = `<div class="sheet" style="width:min(820px,100%)"><div class="head" style="margin-bottom:10px"><h2 style="flex:1">${esc(x.title)}: сетка</h2><button class="ghost" data-x>✕</button></div>
          <p class="muted" style="margin-top:0">Призы: ${x.prizes.map((p) => `${p.place} место, ${esc(p.type === 'text' ? p.value : p.value)}`).join('; ') || 'не назначены'}. ${x.finalized ? 'Турнир завершён, править нельзя.' : ''}</p>
          <div class="row" style="margin-bottom:12px"><input id="un" placeholder="Ник игрока" style="max-width:200px"><button id="add" class="ghost">Добавить игрока</button><input id="bn" type="number" value="5" min="1" max="60" style="width:80px"><button id="ab" class="ghost">Добавить ботов</button></div>
          ${x.format !== 'arena' ? `<div class="row" style="margin-bottom:12px"><span class="tag">${{ swiss: 'Швейцарка', elim: 'На выбывание' }[x.format]}</span><span class="muted">${x.seeded ? `раунд ${x.curRound} из ${x.rounds}` : 'жеребьёвка ещё не проведена'}</span>
            ${!x.seeded ? '<button class="ghost" data-rd="start">Начать сейчас (жеребьёвка)</button>' : (x.finalized ? '' : '<button class="ghost" data-rd="next">Завершить раунд и дальше</button><button class="ghost" data-rd="redraw">Пережеребьёвка раунда</button>')}</div>
            ${(d.rounds || []).slice().reverse().map((r, i) => `<details ${i === 0 ? 'open' : ''} style="margin-bottom:8px"><summary style="cursor:pointer;font-weight:800">Раунд ${r.round}</summary><table style="margin-top:6px"><tbody>${r.pairs.map((p) => `<tr data-pid="${p.id}"><td class="muted" style="width:28px">${p.board}</td><td>${esc(p.white ? p.white.username : '')}</td><td style="text-align:center">${p.black ? (p.status === 'done' || p.status === 'redo' ? `<b>${p.result || ''}</b>${p.status === 'redo' ? ' <span class="muted">(переигровка)</span>' : ''}` : `<select data-res style="width:auto"><option value="">${p.status === 'play' ? 'идёт партия' : 'ждёт'}</option><option value="1-0">1 : 0</option><option value="0-1">0 : 1</option><option value="1/2-1/2">½ : ½</option><option value="void">не засчитывать</option></select> <button class="ghost" data-setres style="padding:4px 10px">ОК</button>`) : '<span class="tag">пауза</span>'}</td><td>${esc(p.black ? p.black.username : '')}</td></tr>`).join('')}</tbody></table></details>`).join('')}` : ''}
          <div style="overflow:auto;max-height:55vh"><table><thead><tr><th>Игрок</th><th>Очки</th><th>Партий</th><th>Побед</th><th></th></tr></thead><tbody id="gb">${rows()}</tbody></table></div></div>`;
        const refresh = async () => { m.remove(); await openGrid(id); };
        m.addEventListener('click', async (e) => {
          if (e.target === m || e.target.closest('[data-x]')) { m.remove(); draw(); return; }
          const rd = e.target.closest('[data-rd]')?.dataset.rd;
          if (rd) { if (rd === 'redraw' && !confirm('Перестроить пары этого раунда?')) return; if (await run(() => adm(`/tournaments/${id}/round`, { method: 'POST', body: { action: rd } }), 'Готово')) refresh(); return; }
          if (e.target.closest('[data-setres]')) { const row = e.target.closest('tr[data-pid]'); const v = row.querySelector('[data-res]').value; if (!v) return toast('Выбери результат'); if (await run(() => adm(`/tournaments/${id}/pairing`, { method: 'POST', body: { pairingId: row.dataset.pid, result: v } }), 'Результат сохранён')) refresh(); return; }
          const tr = e.target.closest('tr[data-uid]');
          if (tr && e.target.closest('[data-save]')) { const v = (k) => tr.querySelector(`[data-f=${k}]`).value; if (await run(() => post({ action: 'points', userId: tr.dataset.uid, points: v('points'), games: v('games'), wins: v('wins') }), 'Сохранено')) refresh(); }
          else if (tr && e.target.closest('[data-del]')) { if (confirm('Убрать игрока из турнира?') && await run(() => post({ action: 'remove', userId: tr.dataset.uid }), 'Убран')) refresh(); }
          else if (e.target.id === 'add') { if (await run(() => post({ action: 'add', username: m.querySelector('#un').value }), 'Добавлен')) refresh(); }
          else if (e.target.id === 'ab') { if (await run(() => post({ action: 'addbots', count: m.querySelector('#bn').value }), 'Боты добавлены')) refresh(); }
        });
        document.body.append(m);
      }

      body.querySelector('#nt').onclick = async () => {
        const f = await ask('Новый турнир', form(null), 'Создать');
        if (f) { await run(() => adm('/tournaments', { method: 'POST', body: payload(f) }), 'Турнир создан'); draw(); }
      };
      body.onclick = async (e) => {
        const c = e.target.closest('[data-cancel]')?.dataset.cancel, fin = e.target.closest('[data-fin]')?.dataset.fin;
        if (c) { if (confirm('Отменить турнир?')) { await run(() => adm(`/tournaments/${c}/cancel`, { method: 'POST' })); draw(); } return; }
        if (fin) { if (confirm('Завершить сейчас и раздать награды?')) { await run(() => adm(`/tournaments/${fin}/finalize`, { method: 'POST' })); draw(); } return; }
        const tr = e.target.closest('tr[data-tid]');
        if (!tr) return;
        const id = tr.dataset.tid, x = tournaments.find((t) => String(t.id) === id);
        const pick = await ask(x.title, [{ name: 'what', label: 'Что сделать', type: 'select', value: 'grid', options: [['grid', 'Открыть сетку (участники и очки)'], ['edit', 'Изменить настройки, призы и описание']] }], 'Дальше');
        if (!pick) return;
        if (pick.what === 'grid') return openGrid(id);
        const f = await ask('Настройки турнира', form(x), 'Сохранить');
        if (f) { await run(() => adm('/tournaments/' + id, { method: 'PATCH', body: payload(f) }), 'Сохранено'); draw(); }
      };
    },

    async news() {
      const { news } = await adm('/news');
      body.innerHTML = `<div class="row" style="margin-bottom:12px"><button id="nn">Добавить новость</button></div>
        <div class="panel"><div class="list">${news.map((n) => `<div class="li"><span class="grow"><b>${esc(n.title_ru)}</b><span class="muted">${dt(n.ts)}</span></span><button class="danger" data-del="${n.id}" style="padding:6px 12px">Удалить</button></div>`).join('') || '<div class="empty">Новостей нет.</div>'}</div></div>`;
      body.querySelector('#nn').onclick = async () => {
        const f = await ask('Новая новость', [{ name: 'title_ru', label: 'Заголовок (русский)', required: true }, { name: 'title_en', label: 'Заголовок (English)' }, { name: 'body_ru', label: 'Текст (русский)', type: 'textarea' }, { name: 'body_en', label: 'Текст (English)', type: 'textarea' }], 'Опубликовать');
        if (f) { await run(() => adm('/news', { method: 'POST', body: f }), 'Опубликовано'); draw(); }
      };
      body.onclick = async (e) => { const d = e.target.closest('[data-del]')?.dataset.del; if (d && confirm('Удалить новость?')) { await run(() => adm('/news/' + d, { method: 'DELETE' })); draw(); } };
    },

    async settings() {
      const s = await adm('/settings');
      const local = s.launch_at ? new Date(s.launch_at - new Date(s.launch_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
      body.innerHTML = `<div class="cols"><div class="panel"><h2>Поиск соперника в первые дни</h2>
        <p class="muted" style="margin-top:0">В стартовый период бот подставляется через случайное время из диапазона. Потом поиск быстрый.</p>
        <form id="sf"><label>Дата и время релиза (пусто = выключено)</label><input type="datetime-local" id="la" value="${local}">
          <label>Сколько дней длится стартовый период</label><input type="number" id="ld" min="0" value="${s.launch_days}">
          <div class="row"><div style="flex:1"><label>Ожидание от, минут</label><input type="number" id="wn" min="0" value="${s.wait_min}"></div><div style="flex:1"><label>до, минут</label><input type="number" id="wx" min="0" value="${s.wait_max}"></div></div>
          <label class="switch" style="margin-top:10px"><span>Создавать недельные и месячные турниры автоматически</span><input type="checkbox" id="at" ${s.auto_tournaments ? 'checked' : ''}></label>
          <label>Ссылка на Telegram-канал или чат</label><input id="tg" placeholder="https://t.me/..." value="${esc(s.telegram_link)}">
          <button style="margin-top:14px">Сохранить</button></form></div></div>`;
      // резервные копии базы: автоматически раз в сутки, тут можно сделать вручную и скачать
      const bkBox = document.createElement('div');
      bkBox.className = 'panel';
      bkBox.style.marginTop = '16px';
      body.append(bkBox);
      const mb = (n) => (n / 1048576).toFixed(2) + ' МБ';
      const bkDraw = async () => {
        const { backups } = await adm('/backups');
        bkBox.innerHTML = `<h2>Резервные копии базы</h2><p class="muted" style="margin-top:0">Сервер сам делает полную копию раз в сутки и хранит последние 20. На свой компьютер копию забирает задание Windows раз в 3 дня (папка A:\Backups\quorchess). В копии есть почты и IP игроков, храни её в надёжном месте.</p>
          <div class="row" style="margin-bottom:10px"><button id="bkmk">Сделать копию сейчас</button></div>
          <div class="list">${backups.map((b) => `<div class="li"><span class="grow"><b>${esc(b.name)}</b><span class="muted">${dt(b.ts)}, ${mb(b.size)}</span></span><a class="btn ghost" href="/api/admin/backups/file?name=${encodeURIComponent(b.name)}" download style="padding:6px 12px">Скачать</a></div>`).join('') || '<div class="empty">Копий пока нет, первая появится в течение суток.</div>'}</div>`;
        bkBox.querySelector('#bkmk').onclick = async () => { if (await run(() => adm('/backups', { method: 'POST' }), 'Копия сделана')) bkDraw(); };
      };
      bkDraw().catch(() => {});
      body.querySelector('#sf').onsubmit = async (e) => {
        e.preventDefault();
        const la = body.querySelector('#la').value;
        await run(() => adm('/settings', { method: 'POST', body: { launch_at: la ? new Date(la).getTime() : 0, launch_days: body.querySelector('#ld').value, wait_min: body.querySelector('#wn').value, wait_max: body.querySelector('#wx').value, auto_tournaments: body.querySelector('#at').checked ? 1 : 0, telegram_link: body.querySelector('#tg').value } }), 'Сохранено');
      };
    },

    async audit() {
      const { rows } = await adm('/audit');
      body.innerHTML = `<div class="row" style="margin-bottom:12px"><input id="q" placeholder="Фильтр: кто, что, над кем" style="max-width:300px"></div><div class="panel" style="overflow:auto"><div id="tbl"></div></div>`;
      const draw2 = () => {
        const q = body.querySelector('#q').value.toLowerCase();
        const list = rows.filter((r) => !q || `${r.admin_name} ${ACTIONS[r.action] || r.action} ${r.target} ${r.details}`.toLowerCase().includes(q));
        body.querySelector('#tbl').innerHTML = list.length ? `<table><thead><tr><th>Когда</th><th>Кто</th><th>Что</th><th>Над кем</th><th>Детали</th></tr></thead><tbody>
          ${list.map((r) => `<tr><td class="muted">${dt(r.ts)}</td><td><b>${esc(r.admin_name)}</b></td><td>${esc(ACTIONS[r.action] || r.action)}</td><td>${esc(r.target)}</td><td>${esc(r.details)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted" style="margin:0">Ничего нет.</p>';
      };
      body.querySelector('#q').oninput = draw2;
      draw2();
    },

    async rooms() {
      const { rooms } = await adm('/rooms');
      body.innerHTML = `<div class="panel">${rooms.length ? `<table><thead><tr><th>Код</th><th>Название</th><th>Хост</th><th>Время</th><th>Игроков</th><th></th></tr></thead><tbody>
        ${rooms.map((r) => `<tr><td class="num">${r.code}</td><td>${esc(r.title)}</td><td>${esc(r.host.username)}</td><td>${r.base}+${r.inc}</td><td>${r.players}</td><td><button class="danger" data-code="${r.code}">Закрыть</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted" style="margin:0">Комнат сейчас нет.</p>'}</div>`;
      body.onclick = async (e) => { const b = e.target.closest('button[data-code]'); if (b) { await adm('/rooms/' + b.dataset.code + '/close', { method: 'POST' }); draw(); } };
    },
  };

  draw();
  return () => clearInterval(timer);
}
