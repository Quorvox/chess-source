import ru from './lang/ru.js';
import en from './lang/en.js';

const dict = { ru, en };

function detect() {
  try { const s = localStorage.getItem('qc_lang'); if (s === 'ru' || s === 'en') return s; } catch { /* ok */ }
  const n = (navigator.language || 'ru').toLowerCase();
  return /^(ru|uk|be|kk)/.test(n) ? 'ru' : 'en';
}

let lang = detect();
document.documentElement.lang = lang;

export const getLang = () => lang;

export function setLang(l) {
  lang = l === 'en' ? 'en' : 'ru';
  try { localStorage.setItem('qc_lang', lang); } catch { /* ok */ }
  document.documentElement.lang = lang;
}

export function t(key, vars) {
  let s = dict[lang][key] ?? dict.ru[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
