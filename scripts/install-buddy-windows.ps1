Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -- Helpers ------------------------------------------------------------------
function Write-Info  { param([string]$Msg) Write-Host "  $Msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$Msg) Write-Host "  [ok] " -NoNewline -ForegroundColor Green; Write-Host $Msg }
function Write-Warn2 { param([string]$Msg) Write-Host "  [warn] " -NoNewline -ForegroundColor Yellow; Write-Host $Msg }
function Write-Fail  { param([string]$Msg) Write-Host "  [error] " -NoNewline -ForegroundColor Red; Write-Host $Msg }
function Write-ProgressHint { param([string]$Msg) Write-Host "  [..] " -NoNewline -ForegroundColor Magenta; Write-Host $Msg }

# -- Banner -------------------------------------------------------------------
Write-Host ""
Write-Host "  Buddy installer" -ForegroundColor White
Write-Host "  Windows" -ForegroundColor DarkGray
Write-Host ""

# -- Config -------------------------------------------------------------------
$repo = if ([string]::IsNullOrWhiteSpace($env:BUDDY_RELEASE_REPO)) {
  "prashantbhudwal/buddy-releases"
} else {
  $env:BUDDY_RELEASE_REPO
}
$destDir = if ([string]::IsNullOrWhiteSpace($env:BUDDY_DOWNLOAD_DIR)) {
  Join-Path $HOME "Downloads/buddy-release"
} else {
  $env:BUDDY_DOWNLOAD_DIR
}
$downloadRetriesRaw = if ([string]::IsNullOrWhiteSpace($env:BUDDY_DOWNLOAD_RETRIES)) {
  "3"
} else {
  $env:BUDDY_DOWNLOAD_RETRIES
}

$downloadRetries = 0
if (-not [int]::TryParse($downloadRetriesRaw, [ref]$downloadRetries) -or $downloadRetries -lt 1) {
  throw "BUDDY_DOWNLOAD_RETRIES must be a positive integer, got: $downloadRetriesRaw"
}

$downloadBufferSizeBytes = 1024 * 1024
$progressUpdateMilliseconds = 500
$percentCompleteMax = 100

function Enable-Tls12ForWindowsPowerShell {
  if ($PSVersionTable.PSEdition -ne "Desktop") {
    return
  }

  $tls12 = [System.Net.SecurityProtocolType]::Tls12
  $current = [System.Net.ServicePointManager]::SecurityProtocol
  if (($current -band $tls12) -eq 0) {
    [System.Net.ServicePointManager]::SecurityProtocol = $current -bor $tls12
  }
}

function Get-NativeArchitecture {
  $arch = $env:PROCESSOR_ARCHITEW6432
  if ([string]::IsNullOrWhiteSpace($arch)) {
    $arch = $env:PROCESSOR_ARCHITECTURE
  }
  if ([string]::IsNullOrWhiteSpace($arch)) {
    throw "Unable to determine Windows architecture from PROCESSOR_ARCHITECTURE."
  }

  switch ($arch.ToUpperInvariant()) {
    "AMD64" { return "x64" }
    "X64" { return "x64" }
    "ARM64" { return "arm64" }
    default { throw "Unsupported Windows architecture: $arch" }
  }
}

function Format-Megabytes {
  param(
    [Parameter(Mandatory = $true)]
    [long]$Bytes
  )

  return "$([math]::Round($Bytes / 1MB, 1)) MB"
}

function Save-FileFromUrl {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Uri,
    [Parameter(Mandatory = $true)]
    [string]$OutFile,
    [long]$ExpectedBytes = 0
  )

  $request = [System.Net.HttpWebRequest]::Create($Uri)
  $request.AllowAutoRedirect = $true
  $response = $request.GetResponse()
  $inputStream = $null
  $outputStream = $null
  $bytesWritten = [long]0
  $lastProgressAt = Get-Date

  try {
    $inputStream = $response.GetResponseStream()
    $outputStream = [System.IO.File]::Open($OutFile, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    $buffer = New-Object byte[] $downloadBufferSizeBytes

    while ($true) {
      $bytesRead = $inputStream.Read($buffer, 0, $buffer.Length)
      if ($bytesRead -le 0) {
        break
      }

      $outputStream.Write($buffer, 0, $bytesRead)
      $bytesWritten += $bytesRead

      $now = Get-Date
      if (($now - $lastProgressAt).TotalMilliseconds -ge $progressUpdateMilliseconds) {
        $status = "$(Format-Megabytes -Bytes $bytesWritten)"
        $progressParameters = @{
          Activity = "Downloading Buddy"
          Status = $status
        }

        if ($ExpectedBytes -gt 0) {
          $percentComplete = [math]::Min($percentCompleteMax, [math]::Floor(($bytesWritten * $percentCompleteMax) / $ExpectedBytes))
          $progressParameters.PercentComplete = $percentComplete
          $progressParameters.Status = "$status / $(Format-Megabytes -Bytes $ExpectedBytes)"
        }

        Write-Progress @progressParameters
        $lastProgressAt = $now
      }
    }
  } finally {
    Write-Progress -Activity "Downloading Buddy" -Completed
    if ($null -ne $outputStream) {
      $outputStream.Dispose()
    }
    if ($null -ne $inputStream) {
      $inputStream.Dispose()
    }
    $response.Dispose()
  }

  if ($ExpectedBytes -gt 0 -and $bytesWritten -ne $ExpectedBytes) {
    throw "Downloaded $bytesWritten bytes, expected $ExpectedBytes bytes."
  }
}

function Get-RemoteFileSize {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Uri
  )

  $request = [System.Net.HttpWebRequest]::Create($Uri)
  $request.Method = "HEAD"
  $request.AllowAutoRedirect = $true
  $response = $null

  try {
    $response = $request.GetResponse()
    return [long]$response.ContentLength
  } finally {
    if ($null -ne $response) {
      $response.Dispose()
    }
  }
}

function Download-CandidateAsset {
  param(
    [Parameter(Mandatory = $true)]
    [object]$CandidateAsset
  )

  $candidateName = $CandidateAsset.Name
  $candidateUrl = $CandidateAsset.BrowserDownloadUrl
  $candidateSizeBytes = [long]$CandidateAsset.SizeBytes
  $candidateOutput = Join-Path $destDir $candidateName
  $delaySeconds = 2

  if (Test-Path -LiteralPath $candidateOutput) {
    $existingFile = Get-Item -LiteralPath $candidateOutput
    if ($existingFile.Length -eq $candidateSizeBytes) {
      Write-Ok "Using existing download $candidateName ($(Format-Megabytes -Bytes $candidateSizeBytes))"
      return @{
        Name = $candidateName
        Url = $candidateUrl
        OutputPath = $candidateOutput
      }
    }

    Write-Warn2 "Replacing partial download $candidateName ($(Format-Megabytes -Bytes $existingFile.Length) / $(Format-Megabytes -Bytes $candidateSizeBytes))"
  }

  Write-Info "Downloading $candidateName ($(Format-Megabytes -Bytes $candidateSizeBytes))..."
  for ($attempt = 1; $attempt -le $downloadRetries; $attempt++) {
    try {
      Save-FileFromUrl -Uri $candidateUrl -OutFile $candidateOutput -ExpectedBytes $candidateSizeBytes
      return @{
        Name = $candidateName
        Url = $candidateUrl
        OutputPath = $candidateOutput
      }
    } catch {
      $statusCode = $null
      $webResponse = $null
      if ($_.Exception -is [System.Net.WebException]) {
        $webResponse = $_.Exception.Response
      }

      if ($webResponse -is [System.Net.HttpWebResponse]) {
        $statusCode = [int]$webResponse.StatusCode
      }

      $errorMessage = $_.Exception.Message
      if ($_.Exception.InnerException) {
        $errorMessage = "$errorMessage ($($_.Exception.InnerException.Message))"
      }

      Remove-Item -LiteralPath $candidateOutput -Force -ErrorAction SilentlyContinue

      if ($statusCode -eq 404) {
        Write-Warn2 "Asset $candidateName not found (HTTP 404), trying next..."
        return $null
      }

      if ($attempt -eq $downloadRetries) {
        throw "Failed to download $candidateName after $downloadRetries attempts. $errorMessage"
      }

      Write-Warn2 "Attempt $attempt/$downloadRetries failed: $errorMessage"
      Write-Warn2 "Retrying in $delaySeconds seconds..."
      Start-Sleep -Seconds $delaySeconds
      $delaySeconds = $delaySeconds * 2
    }
  }

  return $null
}

function Resolve-LatestRelease {
  $headers = @{
    "User-Agent" = "buddy-windows-installer"
    "Accept" = "application/vnd.github+json"
  }

  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers $headers -ErrorAction Stop
  if ($null -eq $release -or [string]::IsNullOrWhiteSpace($release.tag_name)) {
    throw "Could not resolve latest Buddy release from https://api.github.com/repos/$repo/releases/latest"
  }

  return $release
}

function Get-VersionFromTag {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Tag
  )

  if ($Tag.StartsWith("v", [System.StringComparison]::OrdinalIgnoreCase)) {
    return $Tag.Substring(1)
  }

  return $Tag
}

function Find-CandidateAssets {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Release,
    [Parameter(Mandatory = $true)]
    [string[]]$CandidateNames
  )

  $foundAssets = New-Object System.Collections.Generic.List[object]
  foreach ($candidateName in $CandidateNames) {
    $asset = $Release.assets | Where-Object { $_.name -eq $candidateName } | Select-Object -First 1
    if ($null -eq $asset) {
      Write-Warn2 "Asset $candidateName not found, trying next..."
      continue
    }

    if ([string]::IsNullOrWhiteSpace($asset.browser_download_url) -or $asset.size -le 0) {
      Write-Warn2 "Asset $candidateName is missing download metadata, trying next..."
      continue
    }

    $foundAssets.Add([pscustomobject]@{
      Name = $asset.name
      BrowserDownloadUrl = $asset.browser_download_url
      SizeBytes = [long]$asset.size
    })
  }

  return $foundAssets
}

function Find-TargetManifestAsset {
  $manifestName = "latest-windows-x64.yml"
  $manifestUrl = "https://github.com/$repo/releases/latest/download/$manifestName"
  $manifestContent = ""

  try {
    $manifestContent = (Invoke-WebRequest -UseBasicParsing -Uri $manifestUrl -ErrorAction Stop).Content
  } catch {
    Write-Warn2 "Could not download $manifestName, no pinned Windows installer fallback is available."
    return $null
  }

  $match = [regex]::Match($manifestContent, "(?m)^\s*-\s*url:\s*['""]?([^'""]+\.exe)['""]?\s*$")
  if (-not $match.Success) {
    Write-Warn2 "$manifestName did not include a Windows installer URL."
    return $null
  }

  $installerUrl = $match.Groups[1].Value.Trim()
  if (-not ($installerUrl.StartsWith("https://", [System.StringComparison]::OrdinalIgnoreCase) -or $installerUrl.StartsWith("http://", [System.StringComparison]::OrdinalIgnoreCase))) {
    $installerUrl = "https://github.com/$repo/releases/latest/download/$installerUrl"
  }

  $installerName = Split-Path ([System.Uri]$installerUrl).AbsolutePath -Leaf
  if ([string]::IsNullOrWhiteSpace($installerName)) {
    Write-Warn2 "$manifestName pointed to an installer URL without a filename."
    return $null
  }

  $installerSizeBytes = Get-RemoteFileSize -Uri $installerUrl
  if ($installerSizeBytes -le 0) {
    Write-Warn2 "$installerName is missing download size metadata."
    return $null
  }

  return [pscustomobject]@{
    Name = $installerName
    BrowserDownloadUrl = $installerUrl
    SizeBytes = [long]$installerSizeBytes
  }
}

Enable-Tls12ForWindowsPowerShell

$arch = Get-NativeArchitecture
$release = Resolve-LatestRelease
$tag = $release.tag_name
Write-Ok "Latest release $tag"
$version = Get-VersionFromTag -Tag $tag
$candidateAssets = @(
  "buddy-v$version-windows-$arch.exe",
  "buddy-electron-win-$arch.exe"
)
if ($arch -ne "x64") {
  $candidateAssets += "buddy-v$version-windows-x64.exe"
  $candidateAssets += "buddy-electron-win-x64.exe"
}

New-Item -ItemType Directory -Path $destDir -Force | Out-Null

Write-ProgressHint "Downloading Buddy for $arch. This can take a minute."
$downloadResult = $null
$candidateReleaseAssets = Find-CandidateAssets -Release $release -CandidateNames $candidateAssets
foreach ($asset in $candidateReleaseAssets) {
  $downloadResult = Download-CandidateAsset -CandidateAsset $asset
  if ($null -ne $downloadResult) {
    break
  }
}

if ($null -eq $downloadResult) {
  $pinnedAsset = Find-TargetManifestAsset
  if ($null -ne $pinnedAsset) {
    Write-ProgressHint "Latest release pins Windows to $($pinnedAsset.Name); downloading pinned installer."
    $downloadResult = Download-CandidateAsset -CandidateAsset $pinnedAsset
  }
}

if ($null -eq $downloadResult) {
  Write-Fail "No Windows installer found or pinned by release ${tag}: $($candidateAssets -join ", ")"
  throw "Download failed"
}

Unblock-File -Path $downloadResult.OutputPath -ErrorAction SilentlyContinue
Write-Ok "Prepared installer"

Start-Process -FilePath $downloadResult.OutputPath
Write-Ok "Installer launched"

Write-Host ""
Write-Host "  Next step" -ForegroundColor White
Write-Host "  Follow the setup window that opened."
Write-Host "  Download: $($downloadResult.OutputPath)" -ForegroundColor DarkGray
Write-Host ""
