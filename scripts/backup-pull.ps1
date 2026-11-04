# Забирает свежую копию базы QuorChess с сервера на этот компьютер (по ключу SSH, пароль не нужен).
# Запускается по расписанию раз в 3 дня, можно и вручную: powershell -File scripts\backup-pull.ps1
param(
  [string]$Dest = "A:\Backups\quorchess",
  [string]$Server = $env:QC_SERVER, # например root@your-server-ip
  [string]$Key = "$env:USERPROFILE\.ssh\id_ed25519_quorvox"
)
$ErrorActionPreference = "Stop"
if (-not $Server) { throw "Задай сервер: -Server root@ip или переменную QC_SERVER" }
New-Item -ItemType Directory -Force $Dest | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$out = Join-Path $Dest "quorchess-$stamp.db"
$log = Join-Path $Dest "backup.log"
for ($i = 1; $i -le 5; $i++) {
  & scp -i $Key -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=30 "${Server}:/opt/quorchess/data/backups/latest.db" $out 2>$null
  if ($LASTEXITCODE -eq 0 -and (Test-Path $out) -and (Get-Item $out).Length -gt 4096) {
    "$(Get-Date -Format s) OK $out ($((Get-Item $out).Length) bytes)" | Add-Content $log
    exit 0
  }
  Start-Sleep -Seconds 5
}
"$(Get-Date -Format s) FAIL: не удалось скачать копию" | Add-Content $log
exit 1
