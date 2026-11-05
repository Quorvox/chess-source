import { go, refreshMe } from '../app.js';
import { api, toast } from '../util.js';
import { t } from '../i18n.js';
import * as net from '../net.js';

export async function mount(root) {
  const q = new URLSearchParams(location.search);
  const next = q.get('next') || '/';
  let mode = 'login';
  let cfg = {};
  try { cfg = await api('/config'); } catch { /* сервер недоступен */ }

  const soon = `<span class="tag">${t('soon')}</span>`;
  root.innerHTML = `
  <div class="panel narrow">
    <div class="tabs"><button data-m="login" class="on">${t('auth.login')}</button><button data-m="register" class="ghost">${t('auth.register')}</button></div>
    <form id="f" autocomplete="on">
      <div id="emRow" hidden><label for="em">${t('auth.email')}</label><input id="em" type="email" autocomplete="email" maxlength="254"></div>
      <label for="u" id="ul">${t('auth.nickOrEmail')}</label><input id="u" name="username" autocomplete="username" required maxlength="254">
      <label for="p">${t('auth.pass')}</label><input id="p" name="password" type="password" autocomplete="current-password" required minlength="8">
      <div id="hint" hidden><p class="muted">${t('auth.hint')}</p>
        <label class="switch" style="align-items:flex-start;border-top:0;padding:6px 0"><span style="font-size:14px">${t('auth.agree1')} <a href="/legal#rules" data-link>${t('auth.agreeTerms')}</a> ${t('auth.agreeAnd')} <a href="/legal#data" data-link>${t('auth.agreePriv')}</a></span><input type="checkbox" id="agree"></label></div>
      <div class="err" id="err">${q.get('reset') ? t('reset.done') : q.get('err') === 'banned' ? t('err.banned') : q.get('err') === 'social' ? t('auth.errSocial') : ''}</div>
      <button class="big" id="go" style="width:100%;margin-top:6px">${t('auth.login')}</button>
      <p style="text-align:center;margin:12px 0 0"><a href="#" id="forgot">${t('auth.forgot')}</a></p>
    </form>
    <form id="ff" hidden style="margin-top:14px"><p class="muted" style="margin-top:0">${t('auth.forgotText')}</p>
      <input id="fe" type="email" placeholder="email@example.com" required autocomplete="email">
      <div class="row" style="margin-top:10px"><button>${t('auth.forgotSend')}</button><button type="button" class="ghost" id="fc">${t('cancel')}</button></div>
      <p class="muted" id="fm" style="margin-bottom:0"></p></form>
    <div class="muted" style="text-align:center;margin:18px 0 10px">${t('auth.or')}</div>
    <div class="row" style="justify-content:center">
      <div id="tg">${cfg.telegram ? '' : `<button class="ghost" disabled>Telegram ${soon}</button>`}</div>
      ${cfg.telegram ? `<a class="btn ghost" href="https://t.me/${cfg.telegram}?start=login" target="_blank" rel="noopener">Telegram: ${t('auth.viaBot')}</a>` : ''}
      ${cfg.discord ? '<a class="btn ghost" href="/api/auth/discord">Discord</a>' : `<button class="ghost" disabled>Discord ${soon}</button>`}
    </div>
  </div>`;

  if (cfg.telegram) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.dataset.telegramLogin = cfg.telegram;
    s.dataset.size = 'large';
    s.dataset.authUrl = '/api/auth/telegram';
    s.dataset.requestAccess = 'write';
    root.querySelector('#tg').append(s);
  }

  const ff = root.querySelector('#ff');
  root.querySelector('#forgot').onclick = (e) => { e.preventDefault(); ff.hidden = false; root.querySelector('#fe').focus(); };
  root.querySelector('#fc').onclick = () => { ff.hidden = true; };
  ff.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/forgot', { method: 'POST', body: { email: root.querySelector('#fe').value.trim() } });
      const fm = root.querySelector('#fm');
      fm.textContent = r.mail ? '✓ ' + t('auth.forgotDone') : t('auth.forgotOff');
      fm.style.color = r.mail ? 'var(--green)' : 'var(--red)';
      fm.style.fontWeight = '700';
    } catch (ex) { root.querySelector('#fm').textContent = ex.message; }
  };
  const f = root.querySelector('#f');
  root.querySelector('.tabs').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    mode = b.dataset.m;
    const reg = mode === 'register';
    root.querySelectorAll('.tabs button').forEach((x) => { x.classList.toggle('on', x === b); x.classList.toggle('ghost', x !== b); });
    root.querySelector('#go').textContent = reg ? t('auth.create') : t('auth.login');
    root.querySelector('#hint').hidden = !reg;
    root.querySelector('#emRow').hidden = !reg;
    f.em.required = reg;
    root.querySelector('#ul').textContent = reg ? t('auth.nick') : t('auth.nickOrEmail');
    f.u.pattern = reg ? '[A-Za-z0-9_]{3,20}' : '.*';
    f.p.autocomplete = reg ? 'new-password' : 'current-password';
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = root.querySelector('#err');
    err.textContent = '';
    try {
      const body = { username: f.u.value.trim(), password: f.p.value };
      if (mode === 'register') { body.email = f.em.value.trim(); body.agree = root.querySelector('#agree').checked; if (!body.agree) { root.querySelector('#err').textContent = t('err.need_agree'); return; } }
      const r = await api('/' + mode, { method: 'POST', body });
      await refreshMe();
      net.reconnect();
      if (mode === 'register' && r.mail) toast(t('auth.mailSent'));
      go(next.startsWith('/') ? next : '/');
    } catch (ex) { err.textContent = ex.message; }
  };
}
