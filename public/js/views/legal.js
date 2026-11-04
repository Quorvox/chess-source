// Правила, данные и авторы. Открывается из «Настроек», в главном меню и подвале ссылки нет
import { getLang } from '../i18n.js';
import { esc } from '../util.js';

const TG = '<a class="tgl" href="https://t.me/Quorvox_team" target="_blank" rel="noopener noreferrer" title="Telegram"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#229ed9"/><path d="M5.6 11.9l11.2-4.3c.5-.2 1 .1.8.9l-1.9 9c-.1.6-.5.8-1 .5l-2.9-2.1-1.4 1.4c-.2.2-.3.3-.6.3l.2-3 5.4-4.9c.2-.2 0-.3-.4-.1l-6.7 4.2-2.9-.9c-.6-.2-.6-.6.1-.9z" fill="#fff"/></svg></a>';
const MAIL = 'contact@example.com'; // почта оператора: впиши свою

const TXT = {
  ru: {
    title: 'Правила и данные', sub: 'Кто мы, как играть честно, какие данные хранятся и чьими работами мы пользуемся.',
    nav: [['operator', 'Оператор'], ['rules', 'Пользовательское соглашение'], ['data', 'Политика конфиденциальности'], ['rights', 'Твои права'], ['credits', 'Авторы и лицензия']],
    operator: { h: 'Оператор сайта', p: `Сайт QuorChess делает и ведёт команда <b>Quorvox_team</b> ${TG}. Это некоммерческий проект: реклам и платных функций нет.`, c: 'Связь по любым вопросам, в том числе о данных', mail: MAIL },
    rules: {
      h: 'Пользовательское соглашение: правила игры',
      items: [
        ['Играй сам', 'В рейтинговых партиях и турнирах нельзя пользоваться подсказками шахматных движков, другими сайтами и приложениями, нейросетями и ИИ, а также чужой помощью. Встроенная подсказка есть только в тренировке с ботом, в рейтинге её нет.'],
        ['Один человек, один аккаунт', 'Не заводи несколько аккаунтов, чтобы накручивать рейтинг, занимать места в турнирах или обходить блокировку.'],
        ['Без накрутки', 'Нельзя заранее договариваться о результате, нарочно сдавать партии или играть сам с собой через второй аккаунт.'],
        ['Уважай других', 'Без оскорблений в нике, имени, описании профиля и чате партии.'],
        ['Не выходи из партии', 'Закрыть вкладку и пропасть минуту в рейтинговой партии значит поражение и штраф к рейтингу. Сдаться можно в любой момент кнопкой.'],
        ['Боты', 'В рейтинговом поиске соперником может оказаться тренировочный бот. Такие партии считаются так же, как с людьми.'],
        ['Что бывает за нарушения', 'Предупреждение, сброс рейтинга, снятие с турнира или блокировка аккаунта. Все действия администраторов записываются в журнал.'],
      ],
    },
    data: {
      h: 'Политика конфиденциальности: какие данные мы храним', intro: 'Только то, что нужно, чтобы сайт работал. Ничего не продаём и не передаём рекламным сетям.',
      cols: ['Что', 'Зачем', 'Как долго'],
      rows: [
        ['Ник, имя на сайте, хэш пароля (самого пароля у нас нет)', 'Вход и профиль', 'Пока есть аккаунт'],
        ['Почта и отметка, подтверждена ли она', 'Подтверждение аккаунта, важные письма', 'Пока есть аккаунт, при удалении стирается'],
        ['Вход через Telegram или Discord: номер и имя профиля, которые отдаёт сервис', 'Вход без пароля', 'Пока есть аккаунт, при удалении стирается'],
        ['Аватар, описание, страна', 'Показываются в твоём профиле другим игрокам', 'Пока есть аккаунт'],
        ['IP-адрес регистрации и последнего входа, время последней активности', 'Защита от взлома, спама и мультиаккаунтов', 'Пока есть аккаунт, при удалении стирается'],
        ['Партии: ходы, результат, время, рейтинг', 'История, рейтинг, таблицы и турниры', 'Остаются без привязки к тебе после удаления аккаунта'],
        ['Друзья, награды, участие в турнирах', 'Функции сайта', 'Пока есть аккаунт'],
        ['Telegram-бот: номер, имя и ник в Telegram, текст заявки на галочку', 'Вход через бота и рассмотрение заявок', 'Пока есть аккаунт'],
        ['Журнал веб-сервера: IP и запрошенные адреса', 'Безопасность и поиск ошибок', 'Обычно до 14 дней'],
      ],
      not: ['Чат партии и реакции не сохраняются, они живут только пока идёт партия.', 'Платёжных данных нет: всё бесплатно.', 'Рекламных и аналитических трекеров нет, шрифты и картинки отдаются с нашего же сервера.', 'Данные не передаются третьим лицам, кроме хостинга, на котором работает сайт, и Telegram или Discord при входе через них.'],
      cookies: ['Cookie и память браузера', 'Один технический cookie «qc» держит вход (до 30 дней). Настройки вида, звука и уровня бота лежат в памяти твоего браузера и никуда не отправляются.'],
      law: 'Основания: исполнение условий использования сайта и наш законный интерес в безопасности (Art. 6 (1) b и f DSGVO), вход через Telegram и Discord по твоему согласию (Art. 6 (1) a).',
    },
    rights: {
      h: 'Твои права',
      items: ['Узнать, какие данные о тебе хранятся, и получить их копию: напиши на почту оператора.', 'Исправить данные: профиль меняется в «Настройках».', 'Удалить аккаунт: «Настройки», раздел «Аккаунт». Личные данные (почта, IP, вход через соцсети, имя) сотрутся сразу, партии останутся без привязки к тебе.', 'Ограничить обработку или возразить против неё: напиши на почту.', 'Пожаловаться в орган по защите данных своей страны. Отвечаем на запросы в течение 30 дней.'],
    },
    credits: {
      h: 'Авторы и лицензия',
      lead: 'QuorChess создала команда Quorvox_team. Исходный код сайта открыт по лицензии AGPL-3.0-or-later: <a href="https://github.com/Quorvox/QuorChess" target="_blank" rel="noopener noreferrer">github.com/Quorvox/QuorChess</a>. Мы благодарны авторам открытых проектов, на которых всё стоит.',
      list: [
        ['Шахматная доска', 'chessground, проект Lichess, GPL-3.0'], ['Правила шахмат', 'chess.js, BSD-2-Clause'], ['Движок ботов', 'Stockfish, GPL-3.0'],
        ['Звуки (набор sfx)', 'Lichess, автор Enigmahack, AGPL-3.0-or-later'],
        ['Фигуры', 'Lichess: merida (Armando Hernandez Marroquin, GPL-2.0+), letter, pirouetti, pixel (AGPL-3.0+), chessnut (Alexis Luengas, Apache-2.0), rhosgfx (RhosGFX, CC0), fantasy, spatial, celtic (Maurizio Monge, MIT), mpchess (Maxime Chupin, GPL-3.0+), cburnett (Colin M.L. Burnett, GPL-2.0+)'],
        ['Флаги', 'flag-icons, Panayiotis Lipiridis, MIT'], ['Шрифт', 'Onest, SIL Open Font License 1.1'],
      ],
    },
  },
  en: {
    title: 'Rules and data', sub: 'Who we are, how to play fair, what data is stored and whose work we use.',
    nav: [['operator', 'Operator'], ['rules', 'Terms of use'], ['data', 'Privacy policy'], ['rights', 'Your rights'], ['credits', 'Credits and licence']],
    operator: { h: 'Site operator', p: `QuorChess is made and run by the <b>Quorvox_team</b> team ${TG}. It is a non-commercial project: no ads and no paid features.`, c: 'Contact for any question, including data requests', mail: MAIL },
    rules: {
      h: 'Terms of use: game rules',
      items: [
        ['Play on your own', 'In rated games and tournaments you must not use chess engine hints, other websites or apps, AI or neural networks, or help from other people. The built-in hint exists only in training against the bot, not in rated games.'],
        ['One person, one account', 'Do not create several accounts to farm rating, take tournament seats or dodge a ban.'],
        ['No rating farming', 'No agreeing on results in advance, no resigning on purpose, no playing yourself through a second account.'],
        ['Respect others', 'No insults in nicknames, names, profile text or game chat.'],
        ['Do not leave games', 'Closing the tab and staying away for a minute in a rated game is a loss plus a rating penalty. You can always resign with the button.'],
        ['Bots', 'In rated matchmaking your opponent may be a training bot. Such games count the same as games against people.'],
        ['What happens for violations', 'A warning, a rating reset, removal from a tournament or a ban. All admin actions are written to a log.'],
      ],
    },
    data: {
      h: 'Privacy policy: data we store', intro: 'Only what is needed for the site to work. We do not sell anything or pass it to ad networks.',
      cols: ['What', 'Why', 'For how long'],
      rows: [
        ['Nickname, display name, password hash (we do not have the password itself)', 'Sign-in and profile', 'While the account exists'],
        ['Email and whether it is confirmed', 'Account confirmation, important emails', 'While the account exists, erased on deletion'],
        ['Telegram or Discord sign-in: ID and profile name given by the service', 'Passwordless sign-in', 'While the account exists, erased on deletion'],
        ['Avatar, bio, country', 'Shown to other players on your profile', 'While the account exists'],
        ['IP address at registration and at last sign-in, last activity time', 'Protection from hacking, spam and multi-accounts', 'While the account exists, erased on deletion'],
        ['Games: moves, result, time, rating', 'History, rating, leaderboards and tournaments', 'Kept without a link to you after account deletion'],
        ['Friends, awards, tournament participation', 'Site features', 'While the account exists'],
        ['Telegram bot: Telegram ID, name and username, text of a badge request', 'Bot sign-in and reviewing requests', 'While the account exists'],
        ['Web server log: IP and requested addresses', 'Security and debugging', 'Usually up to 14 days'],
      ],
      not: ['Game chat and reactions are not stored, they live only during the game.', 'There is no payment data: everything is free.', 'No advertising or analytics trackers; fonts and images come from our own server.', 'Data is not shared with third parties except the hosting provider and Telegram or Discord when you sign in through them.'],
      cookies: ['Cookies and browser storage', 'One technical cookie “qc” keeps you signed in (up to 30 days). Look, sound and bot level settings live in your browser storage and are never sent anywhere.'],
      law: 'Legal basis: performing the terms of use and our legitimate interest in security (Art. 6 (1) b and f GDPR), Telegram and Discord sign-in with your consent (Art. 6 (1) a).',
    },
    rights: {
      h: 'Your rights',
      items: ['Find out what data we hold about you and get a copy: email the operator.', 'Correct data: edit your profile in Settings.', 'Delete your account: Settings, “Account”. Personal data (email, IP, social sign-in, name) is erased at once, games stay without a link to you.', 'Restrict or object to processing: email us.', 'Complain to the data protection authority in your country. We answer requests within 30 days.'],
    },
    credits: {
      h: 'Credits and licence',
      lead: 'QuorChess was created by the Quorvox_team team. The source code is open under AGPL-3.0-or-later: <a href="https://github.com/Quorvox/QuorChess" target="_blank" rel="noopener noreferrer">github.com/Quorvox/QuorChess</a>. We are grateful to the open-source authors this stands on.',
      list: [
        ['Chessboard', 'chessground, Lichess project, GPL-3.0'], ['Chess rules', 'chess.js, BSD-2-Clause'], ['Bot engine', 'Stockfish, GPL-3.0'],
        ['Sounds (sfx set)', 'Lichess, author Enigmahack, AGPL-3.0-or-later'],
        ['Pieces', 'Lichess: merida (Armando Hernandez Marroquin, GPL-2.0+), letter, pirouetti, pixel (AGPL-3.0+), chessnut (Alexis Luengas, Apache-2.0), rhosgfx (RhosGFX, CC0), fantasy, spatial, celtic (Maurizio Monge, MIT), mpchess (Maxime Chupin, GPL-3.0+), cburnett (Colin M.L. Burnett, GPL-2.0+)'],
        ['Flags', 'flag-icons, Panayiotis Lipiridis, MIT'], ['Font', 'Onest, SIL Open Font License 1.1'],
      ],
    },
  },
};

export function mount(root) {
  const x = TXT[getLang() === 'en' ? 'en' : 'ru'];
  const d = x.data, c = x.credits;
  root.innerHTML = `
  <div class="legal">
    <div class="page-h"><div><h1>${x.title}</h1><p>${x.sub}</p></div><a class="btn ghost" href="/settings" data-link>←</a></div>
    <nav class="legal-nav">${x.nav.map(([id, l]) => `<a href="#${id}" data-anchor="${id}">${l}</a>`).join('')}</nav>

    <section class="panel" id="operator"><h2>${x.operator.h}</h2>
      <p>${x.operator.p}</p>
      <p class="muted" style="margin-bottom:4px">${x.operator.c}</p>
      <p style="margin-top:0"><b>Email:</b> <a href="mailto:${x.operator.mail}">${x.operator.mail}</a></p></section>

    <section class="panel" id="rules"><h2>${x.rules.h}</h2>
      <ol class="rules">${x.rules.items.map(([h, t]) => `<li><b>${h}.</b> ${t}</li>`).join('')}</ol></section>

    <section class="panel" id="data"><h2>${d.h}</h2><p class="muted" style="margin-top:0">${d.intro}</p>
      <div class="legal-rows">${d.rows.map((r) => `<div class="lrow"><b>${esc(r[0])}</b><span><i>${d.cols[1]}:</i> ${esc(r[1])}</span><span><i>${d.cols[2]}:</i> ${esc(r[2])}</span></div>`).join('')}</div>
      <h3 style="margin:18px 0 6px">${getLang() === 'en' ? 'What we do not do' : 'Чего мы не делаем'}</h3>
      <ul>${d.not.map((v) => `<li>${v}</li>`).join('')}</ul>
      <h3 style="margin:18px 0 6px">${d.cookies[0]}</h3><p style="margin:0">${d.cookies[1]}</p>
      <p class="muted" style="margin-bottom:0">${d.law}</p></section>

    <section class="panel" id="rights"><h2>${x.rights.h}</h2><ul>${x.rights.items.map((v) => `<li>${v}</li>`).join('')}</ul></section>

    <section class="panel" id="credits"><h2>${c.h}</h2><p style="margin-top:0">${c.lead}</p>
      <dl class="credits">${c.list.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></section>
  </div>`;
  if (location.hash) setTimeout(() => root.querySelector(location.hash)?.scrollIntoView({ block: 'start' }), 50);
  root.querySelector('.legal-nav').addEventListener('click', (e) => {
    const a = e.target.closest('[data-anchor]');
    if (!a) return;
    e.preventDefault();
    root.querySelector('#' + a.dataset.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
