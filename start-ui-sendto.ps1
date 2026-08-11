# md-outlet SendTo launcher — Unicode-safe (Japanese paths OK)
# Explorer "Send to" appends the file path after this script's args.
#
# If UI is already on :5760, hand off via HTTP (no extra long-lived shell).
# Only the first launch keeps a node process for the UI server.
param(
  [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
  [string[]]$OpenFiles
)

$ErrorActionPreference = "Stop"
$UiPort = 5760
$UiBase = "http://127.0.0.1:$UiPort"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

function Show-Error([string]$Message) {
  try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    [void][System.Windows.Forms.MessageBox]::Show(
      $Message,
      "md-outlet",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    )
  } catch {
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    try { Read-Host "Press Enter to close" } catch { }
  }
}

function Fail([string]$Message) {
  Show-Error $Message
  exit 1
}

# Session token written by the running UI (or MD_OUTLET_API_TOKEN).
function Get-ApiToken {
  $fromEnv = [string]$env:MD_OUTLET_API_TOKEN
  if ($fromEnv -and $fromEnv.Trim().Length -gt 0) {
    return $fromEnv.Trim()
  }
  $tokenFile = Join-Path $env:TEMP "md-outlet-ui-$UiPort.token"
  if (-not (Test-Path -LiteralPath $tokenFile)) { return $null }
  try {
    $t = (Get-Content -LiteralPath $tokenFile -Raw -ErrorAction Stop).Trim()
    if ($t.Length -gt 0) { return $t }
  } catch { }
  return $null
}

function Get-ApiHeaders {
  $headers = @{
    "Accept" = "application/json"
  }
  $token = Get-ApiToken
  if ($token) {
    $headers["X-MD-Outlet-Token"] = $token
  }
  return $headers
}

function Test-ExistingUi {
  try {
    $res = Invoke-WebRequest `
      -Uri "$UiBase/api/state" `
      -Headers (Get-ApiHeaders) `
      -UseBasicParsing `
      -TimeoutSec 2
    if ($res.StatusCode -ne 200) { return $false }
    $state = $res.Content | ConvertFrom-Json
    if ($null -ne $state.tabMax) { return $true }
    if ($null -ne $state.profileRef) { return $true }
    if ($null -ne $state.builtins) { return $true }
    return $false
  } catch {
    return $false
  }
}

function Get-HttpErrorMessage([System.Exception]$Ex) {
  $msg = $Ex.Message
  try {
    $resp = $Ex.Response
    if (-not $resp) { return $msg }
    $stream = $resp.GetResponseStream()
    if (-not $stream) { return $msg }
    $reader = New-Object System.IO.StreamReader($stream)
    $raw = $reader.ReadToEnd()
    $reader.Close()
    if (-not $raw) { return $msg }
    $err = $raw | ConvertFrom-Json
    if ($err.error) { return [string]$err.error }
  } catch { }
  return $msg
}

# Best-effort: bring an existing browser window titled "md-outlet" forward.
# Returns $true when a window was activated.
function Wake-MdOutletWindow {
  try {
    $shell = New-Object -ComObject WScript.Shell
    $candidates = Get-Process -ErrorAction SilentlyContinue |
      Where-Object {
        $_.MainWindowHandle -ne [IntPtr]::Zero -and
        $_.MainWindowTitle -match 'md-outlet'
      }
    foreach ($p in $candidates) {
      if ($shell.AppActivate($p.Id)) { return $true }
      if ($p.MainWindowTitle -and $shell.AppActivate($p.MainWindowTitle)) {
        return $true
      }
    }
  } catch {
    # OS / browser may ignore; UI still polls and blinks its title.
  }
  return $false
}

# Open path in running UI (or just focus). Exits process on success.
function Invoke-HandoffOrContinue([string]$Path) {
  $exists = $false
  try { $exists = Test-ExistingUi } catch { $exists = $false }
  if (-not $exists) { return }

  if ($Path) {
    $json = (@{ path = $Path } | ConvertTo-Json -Compress)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    try {
      $null = Invoke-WebRequest `
        -Uri "$UiBase/api/tabs/open" `
        -Method POST `
        -Body $bytes `
        -ContentType "application/json; charset=utf-8" `
        -Headers (Get-ApiHeaders) `
        -UseBasicParsing `
        -TimeoutSec 10
    } catch {
      $detail = Get-HttpErrorMessage $_.Exception
      if ($detail -match 'Unauthorized' -or $detail -match '401') {
        Fail ("既存の UI に接続できません（API トークン）。`n" +
          "ブラウザの md-outlet タブを閉じてから、もう一度「送る」してください。`n" +
          "($detail)")
      }
      # Tab full / unsupported: show error and still wake the UI so the toast is visible.
      if (-not (Wake-MdOutletWindow)) {
        try { Start-Process $UiBase } catch { }
      }
      Fail $detail
    }
  }

  # Server may still be running after the browser tab was closed (zombie UI).
  # If we cannot find an md-outlet window, open the URL so the user sees it.
  if (-not (Wake-MdOutletWindow)) {
    try {
      Start-Process $UiBase
    } catch {
      Fail ("ファイルは既存 UI に渡せましたが、ブラウザを開けませんでした。`n" +
        "手動で開いてください: $UiBase`n($($_.Exception.Message))")
    }
  }
  exit 0
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "Node.js not found. Install LTS from https://nodejs.org/"
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Fail "npm not found. Reinstall Node.js."
}
if (-not (Test-Path -LiteralPath (Join-Path $root "package.json"))) {
  Fail "package.json missing. Run from the md-outlet folder."
}

$target = $null
if ($OpenFiles -and $OpenFiles.Count -gt 0) {
  $target = ([string]$OpenFiles[0]).Trim().Trim('"')
}
if ($target -and -not (Test-Path -LiteralPath $target)) {
  Fail "File not found: $target"
}

# Already running → open tab there (no second server / no lingering shell).
Invoke-HandoffOrContinue $target

if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules"))) {
  Write-Host "First-time setup: npm install..."
  npm install
  if ($LASTEXITCODE -ne 0) { Fail "npm install failed." }
}

$tsxCli = Join-Path $root "node_modules\tsx\dist\cli.mjs"
$appCli = Join-Path $root "src\cli.ts"
if (-not (Test-Path -LiteralPath $tsxCli)) {
  Fail "tsx not found. Run npm install in md-outlet."
}

# First instance: keep node attached for the UI lifetime.
if ($target) {
  & node.exe $tsxCli $appCli "ui" $target
} else {
  & node.exe $tsxCli $appCli "ui"
}
$code = $LASTEXITCODE
if ($null -eq $code) { $code = 0 }

# 0 = clean UI shutdown. 1 / Ctrl+C / task-kill are also "stopped", not a launch failure.
# (Hidden SendTo must not pop an error box after the process is ended.)
$stoppedOk = @(0, 1, -1073741510, 3221225786)
if ($stoppedOk -contains [int]$code) {
  exit 0
}

# 0xC0000409 / -1073740791 = STATUS_STACK_BUFFER_OVERRUN (Node crash on some Windows setups)
$abs = [Math]::Abs([int64]$code)
if ($code -eq -1073740791 -or $abs -eq 1073740791 -or $code -eq 3221226505) {
  Fail ("md-outlet の起動に失敗しました（Node 異常終了）。`n" +
    "start-ui.bat から起動できるか確認し、できなければ Node.js LTS の再インストールを試してください。`n" +
    "Exit code $code")
}
Fail "Exit code $code"
