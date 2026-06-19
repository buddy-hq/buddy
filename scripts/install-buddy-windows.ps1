Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

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

  Write-Host "Downloading $CandidateName from latest release..."
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
        Write-Host "Asset $CandidateName is not present in the latest release (HTTP 404)."
        return $null
      }

      if ($attempt -eq $downloadRetries) {
        throw "Failed to download $CandidateName after $downloadRetries attempts. $errorMessage"
      }

      Write-Host "Download attempt $attempt/$downloadRetries failed: $errorMessage"
      Write-Host "Retrying in $delaySeconds seconds..."
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

Enable-Tls12ForWindowsPowerShell

$arch = Get-NativeArchitecture
$candidateAssets = @("buddy-electron-win-$arch.exe")
if ($arch -ne "x64") {
  $candidateAssets += "buddy-electron-win-x64.exe"
}

New-Item -ItemType Directory -Path $destDir -Force | Out-Null

$downloadResult = $null
foreach ($assetName in $candidateAssets) {
  $downloadResult = Download-CandidateAsset -CandidateName $assetName
  if ($null -ne $downloadResult) {
    break
  }
}

if ($null -eq $downloadResult) {
  throw "Latest release does not contain any supported Windows installer assets: $($candidateAssets -join ", ")"
}

$tag = Resolve-ReleaseTag

Write-Host "Saved to $($downloadResult.OutputPath)"
Write-Host "Removing Mark of the Web (MotW) quarantine flag..."
Unblock-File -Path $downloadResult.OutputPath -ErrorAction SilentlyContinue
Write-Host "Starting installer $($downloadResult.Name)..."
Start-Process -FilePath $downloadResult.OutputPath

Write-Host ""
Write-Host "Opened the latest Buddy installer."
Write-Host "Release: $tag"
Write-Host "Asset: $($downloadResult.Name)"
Write-Host "Path: $($downloadResult.OutputPath)"
