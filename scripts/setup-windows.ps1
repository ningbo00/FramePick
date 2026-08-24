#requires -Version 5.1

[CmdletBinding()]
param(
  [switch]$SkipNpmInstall
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

function Get-CommandPath([string]$name) {
  $command = Get-Command $name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  return $null
}

function Write-Check([string]$label, [bool]$ok, [string]$detail) {
  $mark = if ($ok) { '[OK]' } else { '[--]' }
  $color = if ($ok) { 'Green' } else { 'Yellow' }
  Write-Host ("{0} {1}: {2}" -f $mark, $label, $detail) -ForegroundColor $color
}

$nodePath = Get-CommandPath 'node.exe'
$npmPath = Get-CommandPath 'npm.cmd'
if (-not $nodePath -or -not $npmPath) {
  throw 'Node.js or npm was not found. Install Node.js 18 or newer and try again.'
}

$nodeVersion = (& $nodePath '--version').Trim()
if ($nodeVersion -notmatch '^v(\d+)') { throw "Could not read the Node.js version: $nodeVersion" }
$nodeMajor = [int]$Matches[1]
if ($nodeMajor -lt 18) { throw "Node.js $nodeVersion is too old. Node.js 18 or newer is required." }
Write-Check 'Node.js' $true $nodeVersion
Write-Check 'npm' $true ((& $npmPath '--version').Trim())

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'package-lock.json'))) {
  throw 'package-lock.json is missing; reproducible installation is not possible.'
}

if (-not $SkipNpmInstall) {
  Write-Host 'Installing locked npm dependencies...' -ForegroundColor Cyan
  & $npmPath 'ci' '--omit=peer' '--no-audit' '--no-fund'
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE." }
  Write-Check 'npm dependencies' $true 'installed'
} else {
  Write-Check 'npm dependencies' (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\electron\dist\electron.exe')) 'install skipped'
}

$pythonPath = Get-CommandPath 'python.exe'
if ($pythonPath) {
  $pythonVersion = (& $pythonPath '--version' 2>&1).ToString().Trim()
  Write-Check 'Python' $true $pythonVersion
} else {
  Write-Check 'Python' $false 'not found; local AI background removal needs Python 3.11+'
}

$ffmpegPath = Get-CommandPath 'ffmpeg.exe'
if ($ffmpegPath) {
  Write-Check 'FFmpeg' $true 'found on PATH'
} else {
  Write-Check 'FFmpeg' $false 'not found; install it or select its path in FramePick settings'
}

Write-Host ''
Write-Host 'FramePick development environment is ready. Start with:' -ForegroundColor Green
Write-Host '  npm start'
Write-Host '  or double-click: start-framepick.cmd'
