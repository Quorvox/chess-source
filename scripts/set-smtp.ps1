# Записывает настройки почты (Gmail) в /etc/quorchess.env на сервере.
# Пароль приложения вводится в окне и никуда не печатается: он уходит на сервер по SSH через стандартный ввод.
# Как получить пароль: аккаунт Google -> Безопасность -> двухэтапная аутентификация (включить) -> «Пароли приложений» -> создать для «QuorChess».
param([string]$Server = "quorvox-vps")   # имя из твоего ~/.ssh/config, или root@ip
$ErrorActionPreference = "Stop"

$mail = Read-Host "Адрес Gmail, с которого пойдут письма"
$sec = Read-Host "Пароль приложения Google (16 символов)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try { $pass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
$pass = $pass -replace "\s", ""
if ($mail -notmatch "^[^@\s]+@[^@\s]+\.[^@\s]+$" -or $pass.Length -lt 12) { throw "Проверь адрес и пароль приложения" }

$u = [Uri]::EscapeDataString($mail)
$p = [Uri]::EscapeDataString($pass)
$lines = "SMTP_URL=smtps://${u}:${p}@smtp.gmail.com:465`nMAIL_FROM=QuorChess <$mail>`n"
$lines | ssh $Server "sed -i '/^SMTP_URL=/d;/^MAIL_FROM=/d' /etc/quorchess.env && cat >> /etc/quorchess.env && chmod 600 /etc/quorchess.env"
if ($LASTEXITCODE -ne 0) { throw "Не удалось записать настройки на сервер" }
$pass = $null
Write-Host "Готово: настройки почты записаны на сервер. Чтобы они заработали, нужен перезапуск сайта (он на секунды оборвёт идущие партии)."
