# Оболочки приложений

Обе оболочки открывают сайт QuorChess (`https://chess.quorvox.ru`). Все экраны, игра и исправления приходят с сервера, поэтому после выкладки сайта приложения обновляются сами, а магазин нужен только при смене самой оболочки. Офлайн (игра с ботом, тренировка, игра вдвоём) работает через service worker сайта: один раз откройте приложение с интернетом.

## Android (`apps/android`)

Capacitor 6, пакет `com.quorvox.quorchess`, Android 8+.

```bash
cd apps/android
npm install
npx cap sync android
cd android
# ключ подписи лежит вне репозитория: файл со строками storeFile, storePassword, keyAlias, keyPassword
QC_KEYSTORE_PROPS=/путь/к/keystore.properties ./gradlew assembleRelease
```

Свой адрес сайта задаётся в `capacitor.config.json` (`server.url`). Ключ подписи в репозиторий не кладём.

## Windows (`apps/windows`)

Electron, окно с сайтом, внешние ссылки открываются в браузере.

```bash
cd apps/windows
npm install
npx @electron/packager . QuorChess --platform=win32 --arch=x64 --out=dist --icon=icon.ico --asar
```

Файл не подписан кодом, поэтому SmartScreen при первом запуске показывает «Неизвестный издатель»: «Подробнее», «Выполнить в любом случае».
