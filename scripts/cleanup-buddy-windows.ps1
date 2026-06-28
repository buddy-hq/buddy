[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$KeepDownloads,
  [switch]$KeepDocuments,
  [switch]$SkipUninstallers,
  [switch]$SkipCredentialManager
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Info { param([string]$Msg) Write-Host "  $Msg" -ForegroundColor Cyan }
function Write-Ok { param([string]$Msg) Write-Host "  [ok] " -NoNewline -ForegroundColor Green; Write-Host $Msg }
function Write-Warn2 { param([string]$Msg) Write-Host "  [warn] " -NoNewline -ForegroundColor Yellow; Write-Host $Msg }

Write-Host ""
Write-Host "  Buddy cleanup" -ForegroundColor White
Write-Host "  Windows current-user reset" -ForegroundColor DarkGray
Write-Host ""

$productNames = @("Buddy", "Buddy Dev", "Buddy Beta")
$appIds = @("ai.buddy.desktop", "ai.buddy.desktop.dev", "ai.buddy.desktop.beta")
$credentialPatterns = @("Buddy", "buddy", "ai.buddy", "buddydesktop")
$displayNamePattern = "^(Buddy|Buddy Dev|Buddy Beta)(\s|$)"

$localAppData = [Environment]::GetFolderPath("LocalApplicationData")
$roamingAppData = [Environment]::GetFolderPath("ApplicationData")
$homeDir = [Environment]::GetFolderPath("UserProfile")
$documentsDir = [Environment]::GetFolderPath("MyDocuments")
$tempDir = [System.IO.Path]::GetTempPath().TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
$startMenuPrograms = Join-Path $roamingAppData "Microsoft\Windows\Start Menu\Programs"

function Join-NonEmptyPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BasePath,
    [Parameter(Mandatory = $true)]
    [string]$ChildPath
  )

  if ([string]::IsNullOrWhiteSpace($BasePath)) {
    throw "Required Windows known folder path is empty."
  }

  return Join-Path $BasePath $ChildPath
}

function Get-CleanupPaths {
  $paths = New-Object System.Collections.Generic.List[string]

  foreach ($productName in $productNames) {
    $paths.Add((Join-NonEmptyPath -BasePath (Join-NonEmptyPath -BasePath $localAppData -ChildPath "Programs") -ChildPath $productName))
    $paths.Add((Join-NonEmptyPath -BasePath $startMenuPrograms -ChildPath "$productName.lnk"))
    $paths.Add((Join-NonEmptyPath -BasePath $roamingAppData -ChildPath $productName))
    $paths.Add((Join-NonEmptyPath -BasePath $localAppData -ChildPath $productName))
  }

  foreach ($appId in $appIds) {
    $paths.Add((Join-NonEmptyPath -BasePath $roamingAppData -ChildPath $appId))
    $paths.Add((Join-NonEmptyPath -BasePath $localAppData -ChildPath $appId))
    $paths.Add((Join-NonEmptyPath -BasePath $tempDir -ChildPath $appId))
  }

  $paths.Add((Join-NonEmptyPath -BasePath $localAppData -ChildPath "@buddydesktop-electron-updater"))
  $paths.Add((Join-NonEmptyPath -BasePath $roamingAppData -ChildPath "@buddy"))
  $paths.Add((Join-NonEmptyPath -BasePath $homeDir -ChildPath ".buddy"))
  $paths.Add((Join-NonEmptyPath -BasePath $homeDir -ChildPath ".buddy-dev-tools"))
  $paths.Add((Join-NonEmptyPath -BasePath $homeDir -ChildPath ".buddy-runtime"))

  if (-not $KeepDownloads) {
    $paths.Add((Join-NonEmptyPath -BasePath (Join-NonEmptyPath -BasePath $homeDir -ChildPath "Downloads") -ChildPath "buddy-release"))
  }

  if (-not $KeepDocuments -and -not [string]::IsNullOrWhiteSpace($documentsDir)) {
    $paths.Add((Join-NonEmptyPath -BasePath $documentsDir -ChildPath "Buddy"))
  }

  return $paths | Select-Object -Unique
}

function Stop-BuddyProcesses {
  $processes = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $processName = $_.ProcessName
    $path = $null
    try {
      $path = $_.Path
    } catch {
    }

    $productNames -contains $processName -or (
      -not [string]::IsNullOrWhiteSpace($path) -and
      ($path -match "\\Buddy( Dev| Beta)?\\" -or $path -match "ai\.buddy\.desktop")
    )
  }

  if ($null -eq $processes -or $processes.Count -eq 0) {
    Write-Ok "No Buddy processes running"
    return
  }

  foreach ($process in $processes) {
    if ($PSCmdlet.ShouldProcess("$($process.ProcessName) ($($process.Id))", "Stop Buddy process")) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      Write-Ok "Stopped $($process.ProcessName) ($($process.Id))"
    }
  }
}

function Split-UninstallString {
  param(
    [Parameter(Mandatory = $true)]
    [string]$UninstallString
  )

  $trimmed = $UninstallString.Trim()
  if ([string]::IsNullOrWhiteSpace($trimmed)) {
    return $null
  }

  if ($trimmed.StartsWith('"')) {
    $closingQuote = $trimmed.IndexOf('"', 1)
    if ($closingQuote -lt 1) {
      return $null
    }

    return @{
      FilePath = $trimmed.Substring(1, $closingQuote - 1)
      Arguments = $trimmed.Substring($closingQuote + 1).Trim()
    }
  }

  $firstSpace = $trimmed.IndexOf(" ")
  if ($firstSpace -lt 0) {
    return @{
      FilePath = $trimmed
      Arguments = ""
    }
  }

  return @{
    FilePath = $trimmed.Substring(0, $firstSpace)
    Arguments = $trimmed.Substring($firstSpace + 1).Trim()
  }
}

function Get-BuddyUninstallEntries {
  $uninstallRoot = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
  if (-not (Test-Path -LiteralPath $uninstallRoot)) {
    return @()
  }

  return Get-ChildItem -LiteralPath $uninstallRoot -ErrorAction SilentlyContinue |
    ForEach-Object {
      $entry = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
      if ($null -ne $entry -and
        $entry.PSObject.Properties.Name -contains "DisplayName" -and
        $entry.DisplayName -match $displayNamePattern) {
        $entry
      }
    }
}

function Invoke-BuddyUninstallers {
  if ($SkipUninstallers) {
    Write-Warn2 "Skipping registered uninstallers"
    return
  }

  $entries = @(Get-BuddyUninstallEntries)
  if ($entries.Count -eq 0) {
    Write-Ok "No Buddy uninstallers registered"
    return
  }

  foreach ($entry in $entries) {
    if (-not ($entry.PSObject.Properties.Name -contains "UninstallString")) {
      continue
    }

    $uninstall = Split-UninstallString -UninstallString $entry.UninstallString
    if ($null -eq $uninstall) {
      Write-Warn2 "Could not parse uninstaller for $($entry.DisplayName)"
      continue
    }

    $filePath = $uninstall.FilePath
    $arguments = $uninstall.Arguments
    if ($arguments -notmatch "(^|\s)/S(\s|$)") {
      $arguments = "$arguments /S".Trim()
    }

    if (-not (Test-Path -LiteralPath $filePath)) {
      Write-Warn2 "Registered uninstaller is missing for $($entry.DisplayName): $filePath"
      continue
    }

    if ($PSCmdlet.ShouldProcess($entry.DisplayName, "Run silent uninstaller")) {
      $process = Start-Process -FilePath $filePath -ArgumentList $arguments -Wait -PassThru
      if ($process.ExitCode -ne 0) {
        Write-Warn2 "Uninstaller for $($entry.DisplayName) exited with $($process.ExitCode)"
      } else {
        Write-Ok "Ran uninstaller for $($entry.DisplayName)"
      }
    }
  }
}

function Remove-BuddyPaths {
  $removedCount = 0
  foreach ($path in (Get-CleanupPaths)) {
    if (-not (Test-Path -LiteralPath $path)) {
      continue
    }

    if ($PSCmdlet.ShouldProcess($path, "Remove Buddy-owned path")) {
      Remove-Item -LiteralPath $path -Recurse -Force
      Write-Ok "Removed $path"
      $removedCount++
    }
  }

  if ($removedCount -eq 0) {
    Write-Ok "No Buddy files or folders found"
  }
}

function Remove-BuddyUninstallEntries {
  $entries = @(Get-BuddyUninstallEntries)
  if ($entries.Count -eq 0) {
    Write-Ok "No stale Buddy uninstall entries"
    return
  }

  foreach ($entry in $entries) {
    $registryKeyPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$($entry.PSChildName)"
    if ($PSCmdlet.ShouldProcess($registryKeyPath, "Remove Buddy uninstall registry entry")) {
      Remove-Item -LiteralPath $registryKeyPath -Recurse -Force
      Write-Ok "Removed $registryKeyPath"
    }
  }
}

function Remove-BuddyProtocolEntries {
  $registryKeys = New-Object System.Collections.Generic.List[string]
  $registryKeys.Add("HKCU:\Software\Classes\buddy")

  foreach ($productName in $productNames) {
    $registryKeys.Add("HKCU:\Software\Classes\Applications\$productName.exe")
    $registryKeys.Add("HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\$productName.exe")
  }

  $removedCount = 0
  foreach ($registryKey in ($registryKeys | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $registryKey)) {
      continue
    }

    if ($PSCmdlet.ShouldProcess($registryKey, "Remove Buddy registry key")) {
      Remove-Item -LiteralPath $registryKey -Recurse -Force
      Write-Ok "Removed $registryKey"
      $removedCount++
    }
  }

  if ($removedCount -eq 0) {
    Write-Ok "No Buddy protocol or app path registry entries"
  }
}

function Remove-BuddyRunEntries {
  $runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
  if (-not (Test-Path -LiteralPath $runKey)) {
    Write-Ok "No current-user Run key"
    return
  }

  $properties = Get-ItemProperty -LiteralPath $runKey
  $removedCount = 0
  foreach ($property in $properties.PSObject.Properties) {
    if ($property.Name.StartsWith("PS", [System.StringComparison]::Ordinal)) {
      continue
    }

    $value = [string]$property.Value
    if ($property.Name -notmatch "Buddy|buddy" -and $value -notmatch "Buddy|buddy|ai\.buddy\.desktop") {
      continue
    }

    if ($PSCmdlet.ShouldProcess("$runKey\$($property.Name)", "Remove Buddy startup entry")) {
      Remove-ItemProperty -LiteralPath $runKey -Name $property.Name -Force
      Write-Ok "Removed startup entry $($property.Name)"
      $removedCount++
    }
  }

  if ($removedCount -eq 0) {
    Write-Ok "No Buddy startup entries"
  }
}

function Remove-BuddyCredentials {
  if ($SkipCredentialManager) {
    Write-Warn2 "Skipping Windows Credential Manager"
    return
  }

  $targets = @()
  $cmdkeyOutput = & cmdkey /list
  foreach ($line in $cmdkeyOutput) {
    if ($line -match "^\s*Target:\s*(.+)$") {
      $target = $Matches[1].Trim()
      foreach ($pattern in $credentialPatterns) {
        if ($target -match [regex]::Escape($pattern)) {
          $targets += $target
          break
        }
      }
    }
  }

  $targets = @($targets | Select-Object -Unique)
  if ($targets.Count -eq 0) {
    Write-Ok "No Buddy credentials found"
    return
  }

  foreach ($target in $targets) {
    if ($PSCmdlet.ShouldProcess($target, "Delete Windows Credential Manager entry")) {
      & cmdkey "/delete:$target" | Out-Null
      Write-Ok "Deleted credential $target"
    }
  }
}

Stop-BuddyProcesses
Invoke-BuddyUninstallers
Remove-BuddyPaths
Remove-BuddyUninstallEntries
Remove-BuddyProtocolEntries
Remove-BuddyRunEntries
Remove-BuddyCredentials

Write-Host ""
Write-Ok "Buddy cleanup complete"
Write-Host ""
