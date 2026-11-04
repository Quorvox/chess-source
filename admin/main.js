// Вход в скрытую админку: логин, пароль и код из приложения-аутентификатора
import { api, esc } from '/js/util.js';
import { setLang } from '/js/i18n.js';
import { mount as mountAdmin } from '/admin.js';

setLang('ru');
const root = document.getElementById('view');

function loginView() {
  root.innerHTML = `
  <div class="panel narrow" style="margin-top:10vh">
    <h1 style="margin-bottom:4px">Панель</h1>
    <p class="muted" style="margin-top:0">Вход для администраторов</p>
    <form id="f" autocomplete="off">
      <label for="l">Логин</label><input id="l" name="login" autocomplete="username" required>
      <label for="p">Пароль</label><input id="p" name="password" type="password" autocomplete="current-password" required>
      <label for="c">Код из приложения</label><input id="c" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456" required>
      <div class="err" id="err"></div>
      <button class="big" style="width:100%;margin-top:6px">Войти</button>
    </form>
  </div>`;
  const f = root.querySelector('#f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    root.querySelector('#err').textContent = '';
    try {
      const r = await api('/admin-login', { method: 'POST', body: { login: f.login.value, password: f.password.value, code: f.code.value } });
      shell(r.login);
    } catch (ex) { root.querySelector('#err').textContent = ex.message; f.code.value = ''; }
  };
}

function shell(login) {
  root.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:14px"><span class="muted">Вы вошли как <b>${esc(login)}</b></span><button class="ghost" id="out">Выйти</button></div><div id="adm"></div>`;
  root.querySelector('#out').onclick = async () => { await api('/admin-logout', { method: 'POST' }); location.reload(); };
  mountAdmin(root.querySelector('#adm'));
}

api('/admin-me').then((r) => shell(r.login)).catch(loginView);
