[CmdletBinding()]
param(
  [string]$SkyrimPlatformDir = "C:\Program Files (x86)\Steam\steamapps\common\Skyrim Special Edition\Data\Platform",
  [string]$BuildDir = "",
  [string]$NirnLabOutputDir = "",
  [switch]$SkipClientPlugin,
  [switch]$SkipUi,
  [switch]$SkipGamemode,
  [switch]$SkipSkyrimPlatformNative,
  [switch]$SkipNirnLab
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = if ($PSScriptRoot) {
  $PSScriptRoot
} elseif ($PSCommandPath) {
  Split-Path -Parent $PSCommandPath
} else {
  (Get-Location).Path
}

if ([string]::IsNullOrWhiteSpace($BuildDir)) {
  $BuildDir = Join-Path $repoRoot "build"
}

if ([string]::IsNullOrWhiteSpace($NirnLabOutputDir)) {
  # Prefer a sibling checkout (recommended): <parent>/NirnLabUIPlatform
  # Fall back to an in-repo checkout: <repo>/NirnLabUIPlatform
  $nirnLabSiblingRepo = Join-Path (Split-Path -Parent $repoRoot) "NirnLabUIPlatform"
  $nirnLabInRepo = Join-Path $repoRoot "NirnLabUIPlatform"

  if (Test-Path -LiteralPath $nirnLabSiblingRepo) {
    $NirnLabOutputDir = Join-Path $nirnLabSiblingRepo "build\dist\Release"
  } else {
    $NirnLabOutputDir = Join-Path $nirnLabInRepo "build\dist\Release"
  }
}

function Ensure-Directory {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Assert-PathExists {
  param(
    [string]$Path,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label not found: $Path"
  }
}

function Get-FileHashOrNull {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
}

function Sync-File {
  param(
    [string]$Source,
    [string]$Destination,
    [string]$Label
  )

  Assert-PathExists -Path $Source -Label $Label
  Ensure-Directory -Path (Split-Path -Parent $Destination)

  $sourceHash = Get-FileHashOrNull -Path $Source
  $destinationHash = Get-FileHashOrNull -Path $Destination

  if ($sourceHash -eq $destinationHash) {
    Write-Host "[sync] Up to date: $Label"
    return
  }

  Copy-Item -LiteralPath $Source -Destination $Destination -Force
  Write-Host "[sync] Updated: $Label -> $Destination"
}

function Sync-DirectoryContents {
  param(
    [string]$SourceDirectory,
    [string]$DestinationDirectory,
    [string]$Label
  )

  Assert-PathExists -Path $SourceDirectory -Label $Label
  Ensure-Directory -Path $DestinationDirectory

  $sourceFiles = @(Get-ChildItem -LiteralPath $SourceDirectory -Recurse -File -Force)
  if ($sourceFiles.Count -eq 0) {
    Write-Host "[sync] Skipped: $Label (source directory is empty)"
    return
  }

  $updatedCount = 0
  $unchangedCount = 0

  foreach ($sourceFile in $sourceFiles) {
    $relativePath = $sourceFile.FullName.Substring($SourceDirectory.Length).TrimStart("\")
    $destinationPath = Join-Path $DestinationDirectory $relativePath
    Ensure-Directory -Path (Split-Path -Parent $destinationPath)

    $sourceHash = Get-FileHashOrNull -Path $sourceFile.FullName
    $destinationHash = Get-FileHashOrNull -Path $destinationPath

    if ($sourceHash -eq $destinationHash) {
      $unchangedCount++
      continue
    }

    Copy-Item -LiteralPath $sourceFile.FullName -Destination $destinationPath -Force
    $updatedCount++
  }

  Write-Host "[sync] $Label -> updated $updatedCount file(s), unchanged $unchangedCount file(s)"
}

function Sync-OptionalFile {
  param(
    [string]$Source,
    [string]$Destination,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    Write-Host "[sync] Skipped: $Label (source not found: $Source)"
    return
  }

  Sync-File -Source $Source -Destination $Destination -Label $Label
}

function Sync-OptionalDirectoryContents {
  param(
    [string]$SourceDirectory,
    [string]$DestinationDirectory,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $SourceDirectory)) {
    Write-Host "[sync] Skipped: $Label (source directory not found: $SourceDirectory)"
    return
  }

  Sync-DirectoryContents -SourceDirectory $SourceDirectory -DestinationDirectory $DestinationDirectory -Label $Label
}

function Remove-FilesIfMissingFromSource {
  param(
    [string]$SourceDirectory,
    [string]$DestinationDirectory,
    [string[]]$RelativePaths,
    [string]$Label
  )

  foreach ($relativePath in $RelativePaths) {
    $sourcePath = Join-Path $SourceDirectory $relativePath
    if (Test-Path -LiteralPath $sourcePath) {
      continue
    }

    $destinationPath = Join-Path $DestinationDirectory $relativePath
    if (-not (Test-Path -LiteralPath $destinationPath)) {
      continue
    }

    Remove-Item -LiteralPath $destinationPath -Force
    Write-Host "[sync] Removed stale: $Label -> $destinationPath"
  }
}

$clientPluginSource = Join-Path $BuildDir "dist\client\Data\Platform\Plugins\skymp5-client.js"
$clientSettingsSource = Join-Path $BuildDir "dist\client\Data\Platform\Plugins\skymp5-client-settings.txt"
$voipClientPluginSource = Join-Path $BuildDir "dist\client\Data\Platform\Plugins\skymp5-voip.js"
$forceTrueStormsRainPluginSource = Join-Path $BuildDir "dist\client\Data\Platform\Plugins\force-true-storms-rain.js"
$uiSource = Join-Path $BuildDir "dist\client\Data\Platform\UI"
$interfaceSource = Join-Path $BuildDir "dist\client\Data\Interface"
$gamemodeSource = Join-Path $repoRoot "skymp5-gamemode\gamemode.js"
$clientDistDataDir = Join-Path $BuildDir "dist\client\Data"

$skyrimDataDir = Split-Path -Parent $SkyrimPlatformDir
$skyrimPlatformDllSource = Join-Path $BuildDir "skyrim-platform\_platform_se\bin\Release\SkyrimPlatform.dll"
$skyrimPlatformImplSource = Join-Path $BuildDir "skyrim-platform\_platform_se\bin\Release\SkyrimPlatformImpl.dll"
$skyrimPlatformCefSource = Join-Path $BuildDir "skyrim-platform\_platform_se\bin\Release\SkyrimPlatformCEF.exe.hidden"

$nirnLabPluginSource = Join-Path $NirnLabOutputDir "Data\SKSE\Plugins\NirnLabUIPlugin.dll"
$nirnLabUiSource = Join-Path $NirnLabOutputDir "Data\NirnLabUIPlatform"

$clientPluginDestination = Join-Path $SkyrimPlatformDir "Plugins\skymp5-client.js"
$clientSettingsDestination = Join-Path $SkyrimPlatformDir "Plugins\skymp5-client-settings.txt"
$voipClientPluginDestination = Join-Path $SkyrimPlatformDir "Plugins\skymp5-voip.js"
$forceTrueStormsRainPluginDestination = Join-Path $SkyrimPlatformDir "Plugins\force-true-storms-rain.js"
$pluginsDevClientPath = Join-Path $SkyrimPlatformDir "PluginsDev\skymp5-client.js"
$uiDestination = Join-Path $SkyrimPlatformDir "UI"
$interfaceDestination = Join-Path $skyrimDataDir "Interface"
$skyrimPlatformDllDistDestination = Join-Path $clientDistDataDir "SKSE\Plugins\SkyrimPlatform.dll"
$skyrimPlatformImplDistDestination = Join-Path $clientDistDataDir "Platform\Distribution\RuntimeDependencies\SkyrimPlatformImpl.dll"
$skyrimPlatformCefDistDestination = Join-Path $clientDistDataDir "Platform\Distribution\RuntimeDependencies\SkyrimPlatformCEF.exe.hidden"
$skyrimPlatformDllDestination = Join-Path $skyrimDataDir "SKSE\Plugins\SkyrimPlatform.dll"
$skyrimPlatformImplDestination = Join-Path $SkyrimPlatformDir "Distribution\RuntimeDependencies\SkyrimPlatformImpl.dll"
$skyrimPlatformCefDestination = Join-Path $SkyrimPlatformDir "Distribution\RuntimeDependencies\SkyrimPlatformCEF.exe.hidden"
$nirnLabPluginDistDestination = Join-Path $clientDistDataDir "SKSE\Plugins\NirnLabUIPlugin.dll"
$nirnLabUiDistDestination = Join-Path $clientDistDataDir "NirnLabUIPlatform"
$nirnLabPluginDestination = Join-Path $skyrimDataDir "SKSE\Plugins\NirnLabUIPlugin.dll"
$nirnLabUiDestination = Join-Path $skyrimDataDir "NirnLabUIPlatform"

$serverGamemodeDestinations = @(
  (Join-Path $BuildDir "dist\server\gamemode.js"),
  (Join-Path $BuildDir "dist\server\skymp5-gamemode\gamemode.js")
)

Write-Host "[sync] Repo root: $repoRoot"
Write-Host "[sync] Build dir: $BuildDir"
Write-Host "[sync] NirnLab output dir: $NirnLabOutputDir"
Write-Host "[sync] Skyrim Platform dir: $SkyrimPlatformDir"

if (-not $SkipClientPlugin) {
  Sync-File -Source $clientPluginSource -Destination $clientPluginDestination -Label "client plugin"
  Sync-OptionalFile -Source $clientSettingsSource -Destination $clientSettingsDestination -Label "client settings"
  Sync-OptionalFile -Source $voipClientPluginSource -Destination $voipClientPluginDestination -Label "voip client plugin"
  if (Test-Path -LiteralPath $forceTrueStormsRainPluginSource) {
    Sync-File -Source $forceTrueStormsRainPluginSource -Destination $forceTrueStormsRainPluginDestination -Label "force-true-storms-rain plugin"
  }
} else {
  Write-Host "[sync] Skipped: client plugin"
}

if (-not $SkipUi) {
  if (Test-Path -LiteralPath $uiSource) {
    Sync-DirectoryContents -SourceDirectory $uiSource -DestinationDirectory $uiDestination -Label "UI assets"
    Remove-FilesIfMissingFromSource -SourceDirectory $uiSource -DestinationDirectory $uiDestination -RelativePaths @(
      "voip-raw.html",
      "voip-raw.js",
      "voip-test.html",
      "voip-test.js"
    ) -Label "stale VoIP UI asset"
  } else {
    Write-Host "[sync] Skipped: UI assets (source directory not found: $uiSource). Rebuild UI or rerun with -SkipUi."
  }
  Sync-OptionalDirectoryContents -SourceDirectory $interfaceSource -DestinationDirectory $interfaceDestination -Label "Interface assets"
} else {
  Write-Host "[sync] Skipped: UI assets"
}

if (-not $SkipGamemode) {
  foreach ($serverGamemodeDestination in $serverGamemodeDestinations) {
    Sync-File -Source $gamemodeSource -Destination $serverGamemodeDestination -Label "server gamemode"
  }
} else {
  Write-Host "[sync] Skipped: server gamemode"
}

if (-not $SkipSkyrimPlatformNative) {
  Sync-OptionalFile -Source $skyrimPlatformDllSource -Destination $skyrimPlatformDllDistDestination -Label "Skyrim Platform SKSE plugin (dist)"
  Sync-OptionalFile -Source $skyrimPlatformImplSource -Destination $skyrimPlatformImplDistDestination -Label "Skyrim Platform runtime dependency (dist)"
  Sync-OptionalFile -Source $skyrimPlatformCefSource -Destination $skyrimPlatformCefDistDestination -Label "Skyrim Platform CEF subprocess (dist)"
  Sync-OptionalFile -Source $skyrimPlatformDllSource -Destination $skyrimPlatformDllDestination -Label "Skyrim Platform SKSE plugin"
  Sync-OptionalFile -Source $skyrimPlatformImplSource -Destination $skyrimPlatformImplDestination -Label "Skyrim Platform runtime dependency"
  Sync-OptionalFile -Source $skyrimPlatformCefSource -Destination $skyrimPlatformCefDestination -Label "Skyrim Platform CEF subprocess"
} else {
  Write-Host "[sync] Skipped: Skyrim Platform native binaries"
}

if (-not $SkipNirnLab) {
  Sync-OptionalFile -Source $nirnLabPluginSource -Destination $nirnLabPluginDistDestination -Label "NirnLab UI SKSE plugin (dist)"
  Sync-OptionalDirectoryContents -SourceDirectory $nirnLabUiSource -DestinationDirectory $nirnLabUiDistDestination -Label "NirnLab UI runtime files (dist)"
  Sync-OptionalFile -Source $nirnLabPluginSource -Destination $nirnLabPluginDestination -Label "NirnLab UI SKSE plugin"
  Sync-OptionalDirectoryContents -SourceDirectory $nirnLabUiSource -DestinationDirectory $nirnLabUiDestination -Label "NirnLab UI runtime files"
} else {
  Write-Host "[sync] Skipped: NirnLab UI runtime"
}

if (Test-Path -LiteralPath $pluginsDevClientPath) {
  Write-Warning "PluginsDev copy detected at '$pluginsDevClientPath'. If it is stale, it can override your normal client plugin during testing."
}

Write-Host "[sync] Done. Restart Skyrim after client changes, and restart the server after gamemode changes."
