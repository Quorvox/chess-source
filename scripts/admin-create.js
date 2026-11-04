// node scripts/admin-create.js <логин> [файл]
// Создаёт админа скрытого сайта (или сбрасывает пароль и код у существующего).
// Пароль и ключ для приложения-аутентификатора пишутся в файл (права 600), а не в консоль.
const fs = require('fs');
const crypto = require('crypto');
const { promisify } = require('util');
const { db } = require('../server/db');
const totp = require('../server/totp');

const scrypt = promisify(crypto.scrypt);
const login = (process.argv[2] || '').trim();
const out = process.argv[3];
if (!/^[A-Za-z0-9_.-]{3,32}$/.test(login) || !out) {
  console.error('Использование: node scripts/admin-create.js <логин 3-32 символа> <файл для данных>');
  process.exit(1);
}

(async () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let password = '';
  for (const b of crypto.randomBytes(22)) password += alphabet[b % alphabet.length];
  const salt = crypto.randomBytes(16);
  const hash = salt.toString('hex') + ':' + (await scrypt(password, salt, 64)).toString('hex');
  const secret = totp.newSecret();
  const exists = db.prepare('SELECT id FROM admins WHERE login = ?').get(login);
  if (exists) db.prepare('UPDATE admins SET pass = ?, totp_secret = ?, last_step = 0, failed = 0, locked_until = 0 WHERE id = ?').run(hash, secret, exists.id);
  else db.prepare('INSERT INTO admins (login, pass, totp_secret, created) VALUES (?, ?, ?, ?)').run(login, hash, secret, Date.now());
  db.prepare('DELETE FROM admin_sessions WHERE admin_id = (SELECT id FROM admins WHERE login = ?)').run(login);
  fs.writeFileSync(out, `Логин: ${login}\nПароль: ${password}\nКлюч для Google Authenticator (ввод вручную, тип «по времени»): ${secret}\nСсылка otpauth: ${totp.otpauth(login, secret)}\n`, { mode: 0o600 });
  console.log(exists ? 'Админ обновлён' : 'Админ создан', '- данные записаны в', out);
})();
