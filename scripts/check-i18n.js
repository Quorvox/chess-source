// проверка: все ключи t('...') есть и в русском, и в английском словаре
const fs = require('fs');
const path = require('path');

const load = (f) => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'lang', f), 'utf8').replace('export default', 'module.exports =');
  const m = { exports: {} };
  new Function('module', src)(m);
  return m.exports;
};
const ru = load('ru.js'), en = load('en.js');

const used = new Set();
const dynamic = new Set();
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'lang') walk(p); continue; }
    if (!p.endsWith('.js')) continue;
    const s = fs.readFileSync(p, 'utf8');
    for (const m of s.matchAll(/\bt\((['`])([^'`)]*?)\1/g)) {
      if (m[2].includes('${')) dynamic.add(m[2]); else used.add(m[2]);
    }
    for (const m of s.matchAll(/\bt\('([^']+)'\s*\+/g)) dynamic.add(m[1] + '*');
  }
})(path.join(__dirname, '..', 'public', 'js'));

let bad = 0;
for (const k of used) if (!k.endsWith('.')) for (const [n, d] of [['ru', ru], ['en', en]]) if (!(k in d)) { console.log('нет в', n, ':', k); bad++; }
for (const k of Object.keys(ru)) if (!(k in en)) { console.log('есть в ru, нет в en:', k); bad++; }
for (const k of Object.keys(en)) if (!(k in ru)) { console.log('есть в en, нет в ru:', k); bad++; }
console.log('ключей:', used.size, 'динамических шаблонов:', [...dynamic].join(' | '));
console.log(bad ? 'ЕСТЬ ПРОБЛЕМЫ: ' + bad : 'i18n OK');
