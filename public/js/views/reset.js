// Новый пароль по ссылке из письма
import { api } from '../util.js';
import { t } from '../i18n.js';
import { go } from '../app.js';

export function mount(root) {
  const token = new URLSearchParams(location.search).get('token') || '';
  root.innerHTML = `<div class="panel narrow" style="margin-top:6vh"><h1>${t('reset.title')}</h1>
    <form id="rf"><label for="rp">${t('reset.pw')}</label><input id="rp" type="password" minlength="8" maxlength="100" required autocomplete="new-password">
    <div class="err" id="re"></div><button class="big" style="width:100%;margin-top:10px">${t('reset.save')}</button></form></div>`;
  root.querySelector('#rf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/reset', { method: 'POST', body: { token, password: root.querySelector('#rp').value } });
      go('/login?reset=1');
    } catch (ex) { root.querySelector('#re').textContent = ex.message; }
  };
}
