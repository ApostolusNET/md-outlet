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
$UiBase = "http://127.0.0.1:5760"

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

function Test-ExistingUi {
  try {
    $res = Invoke-WebRequest -Uri "$UiBase/api/state" -UseBasicParsing -TimeoutSec 2
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
function Wake-MdOutletWindow {
  try {
    $shell = New-Object -ComObject WScript.Shell
    $candidates = Get-Process -ErrorAction SilentlyContinue |
      Where-Object {
        $_.MainWindowHandle -ne [IntPtr]::Zero -and
        $_.MainWindowTitle -match 'md-outlet'
      }
    foreach ($p in $candidates) {
      if ($shell.AppActivate($p.Id)) { return }
      if ($p.MainWindowTitle -and $shell.AppActivate($p.MainWindowTitle)) { return }
    }
  } catch {
    # OS / browser may ignore; UI still polls and blinks its title.
  }
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
        -UseBasicParsing `
        -TimeoutSec 10
    } catch {
      Fail (Get-HttpErrorMessage $_.Exception)
    }
  }

  # Do not Start-Process the URL — that often opens a second browser tab.
  # Nudge the existing browser window; the page also polls /api/state.
  Wake-MdOutletWindow
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

if ($code -ne 0) {
  Fail "Exit code $code"
}
exit 0
