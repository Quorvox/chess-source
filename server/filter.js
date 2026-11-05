// Простой фильтр чата: самые грубые слова заменяются звёздочками. Корни слов, чтобы ловить формы и написание через замену букв.
const ROOTS = [
  /ху[йеёяию]\p{L}*/giu, /пизд\p{L}*/giu, /\p{L}*ебан\p{L}*/giu, /\p{L}*ебат\p{L}*/giu, /\p{L}*ебл[аоыи]\p{L}*/giu, /еб[уё]т\p{L}*/giu,
  /бл[яи]д\p{L}*/giu, /(?<!\p{L})бля(?:т|ть)?(?!\p{L})/giu, /(?<!\p{L})сук[аиуе](?!\p{L})/giu, /сучк\p{L}*/giu, /муда[кч]\p{L}*/giu, /пид[оа]р\p{L}*/giu, /педик\p{L}*/giu,
  /залуп\p{L}*/giu, /гонд[оа]н\p{L}*/giu, /ублюд\p{L}*/giu, /шлюх\p{L}*/giu, /дроч\p{L}*/giu, /(?<!\p{L})чмо(?!\p{L})/giu, /(?<!\p{L})уроды?(?!\p{L})/giu,
  /fuck\w*/gi, /shit\w*/gi, /bitch\w*/gi, /cunt\w*/gi, /nigg\w*/gi, /fagg?\w*/gi, /asshole\w*/gi, /dickhead\w*/gi, /retard\w*/gi,
];

function clean(text) {
  let out = String(text || '');
  for (const re of ROOTS) out = out.replace(re, (m) => '*'.repeat(Math.min(m.length, 6)));
  return out;
}

module.exports = { clean };
