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

$latestReleaseDownloadBaseUrl = "https://github.com/$repo/releases/latest/download"
$supportsUseBasicParsing =
  (Get-Command -Name Invoke-WebRequest).Parameters.ContainsKey("UseBasicParsing")

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

function Invoke-WebRequestCompat {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Uri,
    [string]$OutFile
  )

  $requestParameters = @{
    Uri = $Uri
  }

  if (-not [string]::IsNullOrWhiteSpace($OutFile)) {
    $requestParameters.OutFile = $OutFile
  }

  if ($supportsUseBasicParsing) {
    $requestParameters.UseBasicParsing = $true
  }

  Invoke-WebRequest @requestParameters -ErrorAction Stop
}

function Download-CandidateAsset {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CandidateName
  )

  $candidateUrl = "$latestReleaseDownloadBaseUrl/$CandidateName"
  $candidateOutput = Join-Path $destDir $CandidateName
  $delaySeconds = 2

  Write-Info "Downloading $CandidateName..."
  for ($attempt = 1; $attempt -le $downloadRetries; $attempt++) {
    try {
      Invoke-WebRequestCompat -Uri $candidateUrl -OutFile $candidateOutput | Out-Null
      return @{
        Name = $CandidateName
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
        Write-Warn2 "Asset $CandidateName not found (HTTP 404), trying next..."
        return $null
      }

      if ($attempt -eq $downloadRetries) {
        throw "Failed to download $CandidateName after $downloadRetries attempts. $errorMessage"
      }

      Write-Warn2 "Attempt $attempt/$downloadRetries failed: $errorMessage"
      Write-Warn2 "Retrying in $delaySeconds seconds..."
      Start-Sleep -Seconds $delaySeconds
      $delaySeconds = $delaySeconds * 2
    }
  }

  return $null
}

function Resolve-ReleaseTag {
  try {
    $headers = @{
      "User-Agent" = "buddy-windows-installer"
      "Accept" = "application/vnd.github+json"
    }
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers $headers -ErrorAction Stop
    if ($release -and -not [string]::IsNullOrWhiteSpace($release.tag_name)) {
      return $release.tag_name
    }
  } catch {
  }

  return "latest"
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

Enable-Tls12ForWindowsPowerShell

$arch = Get-NativeArchitecture
$tag = Resolve-ReleaseTag
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
foreach ($assetName in $candidateAssets) {
  $downloadResult = Download-CandidateAsset -CandidateName $assetName
  if ($null -ne $downloadResult) {
    break
  }
}

if ($null -eq $downloadResult) {
  Write-Fail "No Windows installer found in release $tag: $($candidateAssets -join ", ")"
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
