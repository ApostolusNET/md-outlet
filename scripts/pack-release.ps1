# Build dist/md-outlet-<version>.zip for hand / GitHub Release distribution.
# Run from repo: npm run pack   (or: powershell -File scripts/pack-release.ps1)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$pkg = Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
$ver = [string]$pkg.version
if (-not $ver) { throw "package.json version missing" }

$distDir = Join-Path $Root "dist"
$stageRoot = Join-Path $distDir "_stage"
$stageApp = Join-Path $stageRoot "md-outlet"
$zipName = "md-outlet-$ver.zip"
$zipPath = Join-Path $distDir $zipName

Write-Host "Packing md-outlet $ver ..."
Write-Host "Root: $Root"

if (Test-Path $stageRoot) {
  Remove-Item -Recurse -Force $stageRoot
}
New-Item -ItemType Directory -Path $stageApp -Force | Out-Null
if (-not (Test-Path $distDir)) {
  New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}

$copyDirs = @(
  "bin",
  "src",
  "schemas",
  "profiles",
  "themes",
  "dicts",
  "ui",
  "docs"
)
foreach ($d in $copyDirs) {
  $src = Join-Path $Root $d
  if (-not (Test-Path $src)) { throw "Missing directory: $d" }
  Copy-Item -Recurse -Force $src (Join-Path $stageApp $d)
}

# Never ship personal / workplace overlays (also never tracked in git)
@(
  (Join-Path $stageApp "dicts\local"),
  (Join-Path $stageApp "examples\local"),
  (Join-Path $stageApp "docs\_private")
) | ForEach-Object {
  if (Test-Path $_) { Remove-Item -Recurse -Force $_ }
}

# examples: skip temps and generated PDFs/HTML
$exSrc = Join-Path $Root "examples"
$exDst = Join-Path $stageApp "examples"
New-Item -ItemType Directory -Path $exDst -Force | Out-Null
Get-ChildItem -Path $exSrc -Force | ForEach-Object {
  $name = $_.Name
  if ($name -like ".tmp-*") { return }
  if ($name -match '\.(pdf|html)$') { return }
  Copy-Item -Recurse -Force $_.FullName (Join-Path $exDst $name)
}

# Drop UI backup folders if any were copied
Get-ChildItem -Path (Join-Path $stageApp "ui\js") -Directory -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "_backup-*" } |
  ForEach-Object { Remove-Item -Recurse -Force $_.FullName }

$copyFiles = @(
  "start-ui.bat",
  "start-ui.sh",
  "start-ui-sendto.ps1",
  "install-sendto.bat",
  "uninstall-sendto.bat",
  "SPEC.md",
  "ROADMAP.md",
  "README.md",
  "LICENSE",
  "package.json",
  "package-lock.json"
)
foreach ($f in $copyFiles) {
  $src = Join-Path $Root $f
  if (-not (Test-Path $src)) { throw "Missing file: $f" }
  Copy-Item -Force $src (Join-Path $stageApp $f)
}

# Never ship local recent / notes / extract debris
$kill = @(
  (Join-Path $stageApp ".md-outlet-recent.json"),
  (Join-Path $stageApp "scripts\_extract")
)
foreach ($p in $kill) {
  if (Test-Path $p) { Remove-Item -Recurse -Force $p }
}
Get-ChildItem -Path $stageApp -Recurse -Force -Filter "*.md-outlet-note.json" -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item -Force $_.FullName }

if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

Compress-Archive -Path $stageApp -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item -Recurse -Force $stageRoot

$item = Get-Item $zipPath
$sizeMb = [math]::Round($item.Length / 1MB, 2)
Write-Host "Wrote $zipPath ($sizeMb MB)"
if ($item.Length -gt 80MB) {
  throw "Zip unexpectedly large ($sizeMb MB). Chromium or node_modules may have been included."
}
Write-Host "OK pack-release"
