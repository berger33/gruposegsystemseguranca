param(
  [ValidateSet('Start', 'Stop')]
  [string]$Action = 'Start'
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new() } catch {}
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$userLocalAppData = $env:LOCALAPPDATA
$demoLocalAppData = Join-Path $userLocalAppData 'GrupoSEG-PublicoBase'
$demoDir = Join-Path $demoLocalAppData 'GrupoSEG\seg-system-demo-v1'
$logsDir = Join-Path $demoLocalAppData 'logs'
$statePath = Join-Path $demoLocalAppData 'server-state.json'
$linkPath = Join-Path $demoLocalAppData 'link-publico.txt'
$lockPath = Join-Path $demoDir 'run.lock'
$stopRequestPath = Join-Path $demoDir 'stop.request'
$cloudflared = Join-Path $userLocalAppData 'Programs\cloudflared\cloudflared.exe'
$model = 'qwen3:1.7b'

function Read-SharedLog([string]$Path) {
  $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete))
  try { $reader = [System.IO.StreamReader]::new($stream); try { return $reader.ReadToEnd() } finally { $reader.Dispose() } } finally { $stream.Dispose() }
}
function Get-CimProcess([int]$ProcessId) {
  Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
}

function Recover-StaleLock {
  $item = Get-Item -LiteralPath $lockPath -ErrorAction Stop
  if (-not $item.PSIsContainer -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'run.lock é um link ou reparse point; não o alterei.'
  }
  $rawPid = (Get-Content -LiteralPath $lockPath -Raw).Trim()
  if ($rawPid -notmatch '^\d+$') { throw 'run.lock inválido; não o alterei.' }
  $ownerPid = [int]$rawPid
  if (Get-CimProcess $ownerPid) { return $false }

  $configPath = Join-Path $demoDir 'config.json'
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $dbPort = [int]$config.pgPort
  if ($dbPort -lt 1024 -or $dbPort -gt 65535) { throw 'Porta registrada inválida; run.lock foi preservado.' }
  $dbListeners = @(Get-NetTCPConnection -State Listen -LocalPort $dbPort -ErrorAction SilentlyContinue)
  $webProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'server\.mjs\s+--dev' })
  if ($dbListeners.Count -or $webProcesses.Count) {
    throw 'O runner não está ativo, mas ainda há processo/porta que pode pertencer à aplicação. run.lock e dados foram preservados.'
  }

  # Recheck ownership immediately before removing only this stale marker.
  if (Get-CimProcess $ownerPid) { throw 'O processo de demonstração reapareceu; run.lock foi preservado.' }
  [System.IO.File]::Delete($lockPath)
  return $true
}

function Read-State {
  if (Test-Path -LiteralPath $statePath -PathType Leaf) {
    try { return Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json } catch { return $null }
  }
  return $null
}

function Save-State([int]$RunnerPid, [int]$WebPort, [int]$TunnelPid, [string]$PublicUrl) {
  $state = [ordered]@{
    runnerPid = $RunnerPid
    webPort = $WebPort
    tunnelPid = $TunnelPid
    publicUrl = $PublicUrl
    startedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
  $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
  Set-Content -LiteralPath $linkPath -Value "$PublicUrl/admin/entrar" -Encoding UTF8
}

function Wait-Healthy([string]$Url, [int]$Seconds) {
  $until = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $until) {
    try {
      $response = Invoke-WebRequest -Uri $Url -TimeoutSec 5 -UseBasicParsing
      if ($response.StatusCode -eq 200) { return $true }
    } catch {}
    Start-Sleep -Seconds 2
  }
  return $false
}

function Get-ReadyWebPort([int]$RunnerPid, [int]$Seconds) {
  $until = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $until) {
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $RunnerPid" -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
      if ($child.Name -ne 'node.exe' -or $child.CommandLine -notmatch 'server\.mjs\s+--dev') { continue }
      $listeners = @(Get-NetTCPConnection -State Listen -OwningProcess $child.ProcessId -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -eq '127.0.0.1' -and $_.LocalPort -ge 1024 })
      foreach ($listener in $listeners) {
        if (Wait-Healthy "http://127.0.0.1:$($listener.LocalPort)/api/health/live" 2) {
          return [int]$listener.LocalPort
        }
      }
    }
    Start-Sleep -Seconds 2
  }
  return 0
}

function Get-TunnelUrl([int]$Port) {
  $needle = "http://127.0.0.1:$Port"
  $tunnelProcess = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'cloudflared.exe' -and $_.CommandLine.Contains($needle) } |
    Select-Object -First 1
  if (-not $tunnelProcess) { return $null }

  $logs = @((Join-Path $logsDir 'cloudflared.log'))
  if ($tunnelProcess.CommandLine -notmatch '--logfile') {
    $logs += (Join-Path $env:TEMP 'seg-demo-public-cloudflared.log')
  }
  foreach ($log in $logs) {
    if (-not (Test-Path -LiteralPath $log -PathType Leaf)) { continue }
    $match = [regex]::Match((Read-SharedLog $log), 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($match.Success) { return [pscustomobject]@{ Url = $match.Value; Pid = [int]$tunnelProcess.ProcessId } }
  }
  return $null
}

function Start-Tunnel([int]$Port) {
  if (-not (Test-Path -LiteralPath $cloudflared -PathType Leaf)) {
    throw "cloudflared não encontrado em $cloudflared. Instale-o pela documentação oficial da Cloudflare."
  }
  $stdout = Join-Path $logsDir 'cloudflared.stdout.log'
  $stderr = Join-Path $logsDir 'cloudflared.stderr.log'
  $logfile = Join-Path $logsDir 'cloudflared.log'
  Set-Content -LiteralPath $logfile -Value '' -Encoding UTF8
  $tunnel = Start-Process -FilePath $cloudflared `
    -ArgumentList @('tunnel', '--no-autoupdate', '--logfile', $logfile, '--url', "http://127.0.0.1:$Port") `
    -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  $until = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $until) {
    $running = Get-CimProcess $tunnel.Id
    if (-not $running) { throw 'cloudflared encerrou antes de criar o link. Consulte os logs locais.' }
    if (Test-Path -LiteralPath $logfile -PathType Leaf) {
      $logText = (Read-SharedLog $logfile)
      $match = [regex]::Match($logText, 'https://[a-z0-9-]+\.trycloudflare\.com')
      if ($match.Success) { return [pscustomobject]@{ Url = $match.Value; Pid = [int]$tunnel.Id } }
    }
    Start-Sleep -Seconds 2
  }
  throw 'Tempo esgotado aguardando o endereço temporário da Cloudflare.'
}

function Open-PublicSite([string]$Url) {
  if (-not (Wait-Healthy "$Url/api/health/live" 45)) {
    throw 'O túnel foi criado, mas a checagem HTTPS pública não respondeu. Consulte os logs locais.'
  }
  Save-State $script:runnerPid $script:webPort $script:tunnelPid $Url
  try { Set-Clipboard "$Url/admin/entrar" } catch {}
  $env:LOCALAPPDATA = $userLocalAppData
  Start-Process "$Url/admin/entrar"
  Write-Host ''
  Write-Host 'SEG System está disponível.' -ForegroundColor Green
  Write-Host "Link de entrada: $Url/admin/entrar"
  Write-Host 'O endereço também foi copiado para a área de transferência.'
  Write-Host 'Mantenha o computador ligado e conectado à internet.'
}

function Start-Demo {
  if (-not (Test-Path -LiteralPath (Join-Path $demoDir 'config.json') -PathType Leaf)) {
    throw "A base da demonstração não foi encontrada em $demoDir. Este iniciador não inicializa nem substitui dados."
  }
  if (-not (Test-Path -LiteralPath $cloudflared -PathType Leaf)) {
    throw "cloudflared não encontrado em $cloudflared. Instale-o pela documentação oficial da Cloudflare."
  }
  $ollama = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5
  if (-not @($ollama.models | Where-Object { $_.name -eq $model }).Count) {
    throw "O modelo local $model não está disponível no Ollama. A demonstração não foi iniciada."
  }

  $runnerPid = 0
  if (Test-Path -LiteralPath $lockPath -PathType Leaf) {
    $rawPid = (Get-Content -LiteralPath $lockPath -Raw).Trim()
    if ($rawPid -notmatch '^\d+$') { throw 'run.lock inválido. Não alterei os dados; peça uma verificação técnica.' }
    $runnerPid = [int]$rawPid
    $owner = Get-CimProcess $runnerPid
    if (-not $owner) {
      [void](Recover-StaleLock)
      $runnerPid = 0
    } elseif ($owner.Name -ne 'node.exe' -or $owner.CommandLine -notmatch 'scripts[\\/]local-demo\.mjs\s+--(start|init)') {
      throw 'Foi encontrado um run.lock sem um runner verificável. Não removi o bloqueio nem alterei os dados.'
    }
    if ($runnerPid -and $owner.CommandLine -notmatch 'local-demo\.mjs\s+--start') {
      throw 'A demonstração está em inicialização. Aguarde e tente abrir novamente.'
    }
  } else {
    $runnerPid = 0
  }

  if (-not $runnerPid) {
    $node = Get-Command node.exe -ErrorAction Stop
    $version = (& $node.Source --version).Trim()
    if ($version -notmatch '^v22\.') { throw "Node.js 22 é necessário; detectado $version." }
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    $stdout = Join-Path $logsDir 'demo-server.stdout.log'
    $stderr = Join-Path $logsDir 'demo-server.stderr.log'
    Set-Content -LiteralPath $stdout -Value '' -Encoding UTF8
    Set-Content -LiteralPath $stderr -Value '' -Encoding UTF8

    $env:LOCALAPPDATA = $demoLocalAppData
    $env:SEG_LOCAL_DEMO_OLLAMA = '1'
    foreach ($name in @('DATABASE_URL','DATABASE_MIGRATION_URL','ALLOW_REMOTE_MIGRATIONS','QA_PGLITE_ONLY',
        'CLIENT_DOCS_DIR','PGLITE_DATA_DIR','PGHOST','PGSERVICE','MAIL_HOST','MAIL_USER','MAIL_PASSWORD',
        'SITE_ADMIN_SESSION_SECRET','EMPLOYEE_SESSION_SECRET','SITE_ADMIN_TOKEN_TI','SITE_ADMIN_TOKEN_MARCELO',
        'CLIENT_MFA_ENCRYPTION_KEY','OLLAMA_HOST','PUBLIC_BASE_URL','TRUST_PROXY')) {
      Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    }
    $runner = Start-Process -FilePath $node.Source `
      -ArgumentList @('scripts/local-demo.mjs', '--start') -WorkingDirectory $repo `
      -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $runnerPid = [int]$runner.Id
    $readyUntil = (Get-Date).AddMinutes(3)
    $webPort = 0
    while ((Get-Date) -lt $readyUntil) {
      $running = Get-CimProcess $runnerPid
      if (-not $running) {
        $tail = if (Test-Path -LiteralPath $stderr) { (Get-Content -LiteralPath $stderr -Tail 12) -join "`n" } else { '' }
        throw "O servidor não iniciou. $tail"
      }
      if (Test-Path -LiteralPath $stdout) {
        $match = [regex]::Match([System.IO.File]::ReadAllText($stdout), 'DEMO_LOCAL_READY:\s+http://127\.0\.0\.1:(\d+)/admin/entrar')
        if ($match.Success) { $webPort = [int]$match.Groups[1].Value; break }
      }
      Start-Sleep -Seconds 2
    }
    if (-not $webPort) { throw 'Tempo esgotado aguardando o servidor local. Consulte os logs locais.' }
    if (-not (Wait-Healthy "http://127.0.0.1:$webPort/api/health/live" 30)) {
      throw 'O servidor iniciou, mas a rota de saúde local não respondeu.'
    }
    $script:runnerPid = $runnerPid
    $script:webPort = $webPort
    $tunnel = Start-Tunnel $webPort
    $script:tunnelPid = $tunnel.Pid
    Open-PublicSite $tunnel.Url
    return
  }

  $script:runnerPid = $runnerPid
  $script:webPort = Get-ReadyWebPort $runnerPid 90
  if (-not $script:webPort) { throw 'A demonstração está iniciando ou o servidor não está saudável.' }
  $tunnel = Get-TunnelUrl $script:webPort
  if (-not $tunnel) { $tunnel = Start-Tunnel $script:webPort }
  $script:tunnelPid = $tunnel.Pid
  Open-PublicSite $tunnel.Url
}

function Stop-Demo {
  if (-not (Test-Path -LiteralPath $lockPath -PathType Leaf)) {
    Write-Host 'A demonstração já está parada.'
  } else {
    $rawPid = (Get-Content -LiteralPath $lockPath -Raw).Trim()
    if ($rawPid -notmatch '^\d+$') { throw 'run.lock inválido; não enviei sinais aos processos.' }
    $runnerPid = [int]$rawPid
    $owner = Get-CimProcess $runnerPid
    if (-not $owner -or $owner.Name -ne 'node.exe' -or $owner.CommandLine -notmatch 'scripts[\\/]local-demo\.mjs\s+--start') {
      throw 'O processo de run.lock não corresponde ao runner esperado; não encerrei processos.'
    }

    $state = Read-State
    if ($state -and $state.tunnelPid) {
      $tunnelProcess = Get-CimProcess ([int]$state.tunnelPid)
      if ($tunnelProcess -and $tunnelProcess.Name -eq 'cloudflared.exe') {
        Stop-Process -Id ([int]$state.tunnelPid) -Force
      }
    }
    if (-not (Test-Path -LiteralPath $stopRequestPath)) {
      New-Item -ItemType File -Path $stopRequestPath -ErrorAction Stop | Out-Null
    }
    $until = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $until -and (Test-Path -LiteralPath $lockPath)) { Start-Sleep -Seconds 1 }
    if (Test-Path -LiteralPath $lockPath) {
      throw 'O runner não encerrou dentro de 30 segundos. Não apaguei banco nem run.lock.'
    }
    [System.IO.File]::Delete($statePath)
    [System.IO.File]::Delete($linkPath)
    Write-Host 'Demonstração encerrada com parada controlada; os dados fictícios foram preservados.' -ForegroundColor Green
  }
}

try {
  if ($Action -eq 'Start') {
    Start-Demo
  } else {
    Stop-Demo
  }
} catch {
  Write-Host "`nNão foi possível concluir a operação: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Logs locais: $logsDir"
  exit 1
}
