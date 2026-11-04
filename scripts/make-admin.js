// node scripts/make-admin.js <ник>  — выдать права админа (ник должен быть уже зарегистрирован)
const { db } = require('../server/db');

const name = process.argv[2];
if (!name) { console.error('Укажи ник: node scripts/make-admin.js <ник>'); process.exit(1); }
const r = db.prepare('UPDATE users SET is_admin = 1 WHERE username = ? AND is_bot = 0').run(name);
console.log(r.changes ? 'Готово: ' + name + ' теперь админ' : 'Такого пользователя нет');
