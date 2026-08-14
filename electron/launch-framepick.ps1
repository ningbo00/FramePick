param(
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $root 'framepick-launcher.log'

function Write-LauncherLog([string]$message) {
  $stamp = Get-Date -Format s
  '{0} {1}' -f $stamp, $message | Add-Content -LiteralPath $log
}

function Get-MissingElectronRuntimeFiles([string]$projectRoot) {
  $relativePaths = @(
    'node_modules\electron\dist\electron.exe',
    'node_modules\electron\dist\icudtl.dat',
    'node_modules\electron\dist\resources.pak',
    'node_modules\electron\dist\snapshot_blob.bin',
    'node_modules\electron\dist\v8_context_snapshot.bin',
    'node_modules\electron\dist\resources\default_app.asar',
    'node_modules\electron\dist\locales\en-US.pak'
  )
  return @($relativePaths | Where-Object { -not (Test-Path -LiteralPath (Join-Path $projectRoot $_)) })
}

try {
  $electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
  $electronPackageFiles = @(
    'node_modules\electron\package.json',
    'node_modules\electron\cli.js',
    'node_modules\electron\install.js'
  )
  $missingPackageFiles = @($electronPackageFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $root $_)) })
  $missingRuntimeFiles = @(Get-MissingElectronRuntimeFiles $root)
  if ($missingPackageFiles.Count -gt 0 -or $missingRuntimeFiles.Count -gt 0) {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $nodeCommand -or -not $npmCommand) {
      throw 'Node.js or npm was not found. Install Node.js and try again.'
    }
    Push-Location $root
    try {
      $missingSummary = @($missingPackageFiles + $missingRuntimeFiles) -join ', '
      Write-LauncherLog ('repairing incomplete Electron installation; missing: {0}' -f $missingSummary)
      # Squirrel/signing peer packages are not used by the configured NSIS/portable targets.
      & $npmCommand.Source ci --omit=peer --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) { throw ('npm ci failed with exit code {0}.' -f $LASTEXITCODE) }

      $missingRuntimeFiles = @(Get-MissingElectronRuntimeFiles $root)
      if ($missingRuntimeFiles.Count -gt 0) {
        $electronInstall = Join-Path $root 'node_modules\electron\install.js'
        if (-not (Test-Path -LiteralPath $electronInstall)) { throw 'Electron installer is missing after npm ci.' }
        Write-LauncherLog ('Electron runtime still incomplete after npm ci; running install.js')
        & $nodeCommand.Source $electronInstall
        if ($LASTEXITCODE -ne 0) { throw ('Electron binary installation failed with exit code {0}.' -f $LASTEXITCODE) }
      }
    } finally {
      Pop-Location
    }
  }
  $missingRuntimeFiles = @(Get-MissingElectronRuntimeFiles $root)
  if ($missingRuntimeFiles.Count -gt 0) {
    throw ('Electron runtime is incomplete. Missing: {0}' -f ($missingRuntimeFiles -join ', '))
  }
  if ($ValidateOnly) {
    Write-Output 'FramePick launcher validation passed.'
    exit 0
  }

  $alreadyRunning = @(Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -and ([IO.Path]::GetFullPath($_.ExecutablePath) -eq [IO.Path]::GetFullPath($electron)) }).Count -gt 0
  $process = Start-Process -FilePath $electron -WorkingDirectory $root -ArgumentList @('.') -WindowStyle Normal -PassThru
  Start-Sleep -Milliseconds 1200
  $process.Refresh()
  if (-not $alreadyRunning -and $process.HasExited) {
    throw ('Electron exited immediately with code {0}. Run electron.exe directly or inspect framepick-launcher.log.' -f $process.ExitCode)
  }
  Write-LauncherLog 'started FramePick'
} catch {
  $errorMessage = $_.Exception.Message
  Write-LauncherLog ('ERROR: {0}' -f $errorMessage)
  Write-Error $errorMessage
  exit 1
}
