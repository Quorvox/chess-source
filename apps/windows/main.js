// Оболочка QuorChess для Windows: окно с сайтом. Все обновления приходят с сайта, переустанавливать не нужно.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const SITE = 'https://chess.quorvox.ru';
Menu.setApplicationMenu(null);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
function create() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 360, minHeight: 600,
    backgroundColor: '#1f1e1b', title: 'QuorChess', icon: path.join(__dirname, 'icon.ico'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.loadURL(SITE);
  // нет сети при запуске: показываем свою страницу, сайт с офлайн-режимом откроется из кеша, когда зайдёшь с интернетом один раз
  win.webContents.on('did-fail-load', (_e, code, _d, url, isMain) => {
    if (isMain && code !== -3 && url.startsWith(SITE)) win.loadFile(path.join(__dirname, 'offline.html'));
  });
  // чужие ссылки (Telegram, GitHub) открываем в обычном браузере, а не внутри приложения
  win.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(SITE)) shell.openExternal(url); return { action: url.startsWith(SITE) ? 'allow' : 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(SITE) && !url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
}
app.whenReady().then(create);
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());