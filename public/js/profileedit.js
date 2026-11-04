// Редактирование профиля в отдельном окне: аватар, своя картинка, имя, о себе, страна, почта
import { app, refreshMe } from './app.js';
import { api, esc, avatar, AVATARS, COUNTRIES, toast } from './util.js';
import { t } from './i18n.js';

export function openProfileEditor(onDone) {
  const u0 = app.user;
  if (!u0) return;
  let modal = null;
  let changed = false;

  function close() {
    modal?.remove();
    modal = null;
    document.removeEventListener('keydown', onKey);
    if (changed && onDone) onDone();
  }
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  function draw() {
    const u = app.user;
    const keep = modal ? { dn: modal.querySelector('#pe-dn')?.value, bio: modal.querySelector('#pe-bio')?.value, cc: modal.querySelector('#pe-cc')?.value } : null;
    const html = `<div class="sheet" style="width:min(560px,100%);max-height:92dvh;overflow:auto">
      <div class="head" style="margin-bottom:6px"><h2 style="flex:1">${t('set.profile')}</h2><button class="ghost" data-x aria-label="${t('pe.close')}">✕</button></div>
      <div class="head" style="gap:14px;margin-bottom:6px">${avatar(u.avatar, 'lg')}<div class="muted">@${esc(u.username)}</div></div>
      <label>${t('set.avatar')}</label>
      <div class="avs" id="pe-avs">${AVATARS.map((_, i) => `<button type="button" data-a="p${i + 1}" class="${u.avatar === 'p' + (i + 1) ? 'on' : ''}">${avatar('p' + (i + 1))}</button>`).join('')}</div>
      <label>${t('set.upload')}</label><input type="file" id="pe-file" accept="image/png,image/jpeg,image/webp">
      <label>${t('set.email')}</label><div class="row"><span>${u.email ? esc(u.email) : '—'}</span>${u.email ? (u.verified ? `<span class="tag">${t('set.verified')}</span>` : `<span class="tag" style="color:var(--red)">${t('set.unverified')}</span> <button type="button" class="ghost" id="pe-resend" style="padding:6px 12px">${t('set.resend')}</button>`) : ''}</div>
      <label for="pe-dn">${t('set.name')}</label><input id="pe-dn" maxlength="24" value="${esc(keep ? keep.dn : u.display)}">
      <label for="pe-bio">${t('set.bio')}</label><textarea id="pe-bio" maxlength="200">${esc(keep ? keep.bio : u.bio)}</textarea>
      <label for="pe-cc">${t('set.country')}</label>
      <select id="pe-cc"><option value="">${t('set.noCountry')}</option>${Object.entries(COUNTRIES).map(([c, n]) => `<option value="${c}" ${(keep ? keep.cc : u.country) === c ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <div class="err" id="pe-err"></div>
      <div class="row" style="margin-top:16px"><button id="pe-save">${t('set.save')}</button><button class="ghost" data-x>${t('pe.close')}</button></div>
    </div>`;
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal';
      modal.addEventListener('click', onClick);
      document.body.append(modal);
      document.addEventListener('keydown', onKey);
    }
    modal.innerHTML = html;
    modal.querySelector('#pe-file').onchange = upload;
  }

  async function upload(e) {
    const f = e.target.files[0];
    if (!f) return;
    const r = await fetch('/api/avatar', { method: 'POST', headers: { 'content-type': f.type, 'x-requested-with': 'qc' }, body: f });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast(j.code ? t('err.' + j.code) : t('err.generic'));
    changed = true;
    await refreshMe();
    draw();
  }

  async function onClick(e) {
    if (e.target === modal || e.target.closest('[data-x]')) return close();
    const av = e.target.closest('#pe-avs button');
    if (av) {
      await api('/me', { method: 'PATCH', body: { avatar: av.dataset.a } });
      changed = true;
      await refreshMe();
      return draw();
    }
    if (e.target.closest('#pe-resend')) { try { await api('/resend-verification', { method: 'POST' }); toast(t('set.sent')); } catch (ex) { toast(ex.message); } return; }
    if (e.target.closest('#pe-save')) {
      const err = modal.querySelector('#pe-err');
      err.textContent = '';
      try {
        await api('/me', { method: 'PATCH', body: { display: modal.querySelector('#pe-dn').value, bio: modal.querySelector('#pe-bio').value, country: modal.querySelector('#pe-cc').value } });
        changed = true;
        await refreshMe();
        toast(t('set.saved'));
        close();
      } catch (ex) { err.textContent = ex.message; }
    }
  }

  draw();
}
