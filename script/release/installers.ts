import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import { BUDDY_DISTRIBUTIONS, type BuddyDistributionId } from "@buddy/script/distribution"
import { assertReleaseTag } from "@buddy/script/release-stream"
import { releaseDistribution, assertReleaseDestination } from "./distribution-guard"
import { uploadReleaseAssetSafely } from "./assets"

const INSTALLERS = ["install-buddy-macos.sh", "install-buddy-windows.ps1"] as const

const BETA_MACOS_DISCOVERY = String.raw`resolve_latest_release_tag() {
  if [[ "$REPO" != "prashantbhudwal/buddy-releases" ]]; then
    fail "Beta releases must come from prashantbhudwal/buddy-releases"
    exit 1
  fi
  local page=1
  local page_result
  local count
  TAG=""
  while true; do
    page_result="$(
      curl -fsSL -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "https://api.github.com/repos/$REPO/releases?per_page=100&page=$page" |
        osascript -l JavaScript -e '
          ObjC.import("Foundation");
          function run(argv) {
            var input = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
            var releases = JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(input, $.NSUTF8StringEncoding)));
            if (!Array.isArray(releases)) throw new Error("Expected a release list");
            var highest = argv[0];
            function newer(left, right) {
              var a = left.slice(6).split(".").map(Number);
              var b = right.slice(6).split(".").map(Number);
              for (var i = 0; i < 3; i++) {
                if (a[i] !== b[i]) return a[i] > b[i];
              }
              return false;
            }
            releases.forEach(function(release) {
              if (release.draft !== false || release.prerelease !== true || !/^beta-v[0-9]+\.[0-9]+\.[0-9]+$/.test(release.tag_name)) return;
              if (!highest || newer(release.tag_name, highest)) highest = release.tag_name;
            });
            return releases.length + "\n" + highest;
          }
        ' "$TAG"
    )"
    count="$(printf '%s\n' "$page_result" | head -1)"
    TAG="$(printf '%s\n' "$page_result" | tail -n +2)"
    if (( count < 100 )); then break; fi
    page=$((page + 1))
  done
  if [[ -z "$TAG" ]]; then
    fail "No published Beta prerelease found in $REPO"
    exit 1
  fi
  LATEST_RELEASE_DOWNLOAD_BASE_URL="https://github.com/$REPO/releases/download/$TAG"
}

version_from_tag() {
  printf '%s\n' "$TAG" | sed 's/^beta-v//'
}`

const BETA_WINDOWS_DISCOVERY = String.raw`function Resolve-LatestRelease {
  if ($repo -cne "prashantbhudwal/buddy-releases") {
    throw "Beta releases must come from prashantbhudwal/buddy-releases"
  }
  $headers = @{ "User-Agent" = "buddy-beta-windows-installer"; "Accept" = "application/vnd.github+json" }
  $selected = $null
  $page = 1
  do {
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases?per_page=100&page=$page" -Headers $headers -ErrorAction Stop
    $releases = @($response)
    foreach ($candidate in $releases) {
      if ($candidate.draft -ne $false -or $candidate.prerelease -ne $true -or $candidate.tag_name -cnotmatch '^beta-v[0-9]+\.[0-9]+\.[0-9]+$') { continue }
      if ($null -eq $selected -or [version]$candidate.tag_name.Substring(6) -gt [version]$selected.tag_name.Substring(6)) {
        $selected = $candidate
      }
    }
    $page++
  } while ($releases.Count -eq 100)
  if ($null -eq $selected) { throw "No published Beta prerelease found in $repo" }
  return $selected
}

function Get-VersionFromTag {
  param([Parameter(Mandatory = $true)][string]$Tag)
  return $Tag.Substring(6)
}`

const BETA_MACOS_MANIFEST_CHECK = String.raw`  if ! [[ "$archive_url" =~ ^https://github\.com/prashantbhudwal/buddy-releases/releases/download/beta-v[0-9]+\.[0-9]+\.[0-9]+/[^/?#]+$ ]]; then
    fail "Beta manifest URL must stay inside a Beta release of prashantbhudwal/buddy-releases"
    return 1
  fi`

const BETA_WINDOWS_MANIFEST_URL = String.raw`  $installerUrl = $match.Groups[1].Value.Trim()
  if (-not ($installerUrl.StartsWith("https://", [System.StringComparison]::OrdinalIgnoreCase) -or $installerUrl.StartsWith("http://", [System.StringComparison]::OrdinalIgnoreCase))) {
    $installerUrl = "https://github.com/$repo/releases/download/$tag/$installerUrl"
  }
  if ($installerUrl -cnotmatch '^https://github\.com/prashantbhudwal/buddy-releases/releases/download/beta-v[0-9]+\.[0-9]+\.[0-9]+/[^/?#]+$') {
    throw "Beta manifest URL must stay inside a Beta release of prashantbhudwal/buddy-releases"
  }`

function replaceInstallerBlock(source: string, name: string, replacement: string): string {
  return source.replace(
    new RegExp(
      `(# BEGIN RELEASE ${name})\\r?\\n[\\s\\S]*?(# END RELEASE ${name})(?=\\r?\\n|$)`,
      "u",
    ),
    (_match, start: string, end: string) => `${start}\n${replacement}\n${end}`,
  )
}

/** Artifact names and all prod bytes remain unchanged. Only Beta defaults are rendered. */
export function renderReleaseInstaller(source: string, channel: BuddyDistributionId): string {
  if (channel === "prod") return source
  const macos = source.includes("resolve_latest_release_tag()")
  let rendered = replaceInstallerBlock(
    source,
    "DISCOVERY",
    macos ? BETA_MACOS_DISCOVERY : BETA_WINDOWS_DISCOVERY,
  )
  rendered = replaceInstallerBlock(rendered, "DOWNLOAD BASE", 'LATEST_RELEASE_DOWNLOAD_BASE_URL=""')
  rendered = replaceInstallerBlock(rendered, "MANIFEST URL CHECK", BETA_MACOS_MANIFEST_CHECK)
  rendered = replaceInstallerBlock(
    rendered,
    "CANDIDATE URL",
    '      BrowserDownloadUrl = "https://github.com/$repo/releases/download/$tag/$($asset.name)"',
  )
  rendered = replaceInstallerBlock(
    rendered,
    "MANIFEST BASE",
    '  $manifestUrl = "https://github.com/$repo/releases/download/$tag/$manifestName"',
  )
  rendered = replaceInstallerBlock(rendered, "MANIFEST URL", BETA_WINDOWS_MANIFEST_URL)
  return rendered
    .replaceAll("BUDDY_RELEASE_REPO", "BUDDY_BETA_RELEASE_REPO")
    .replaceAll("Downloads/buddy-release", "Downloads/buddy-beta-release")
    .replace(/\bBuddy\b(?! Beta\b)/gu, BUDDY_DISTRIBUTIONS.beta.productName)
}

if (import.meta.main) {
  const repository = process.env.RELEASE_REPO?.trim() ?? ""
  const tag = process.env.RELEASE_TAG?.trim() ?? ""
  const distribution = assertReleaseDestination(repository)
  assertReleaseTag(distribution, tag)
  const directory = await mkdtemp(
    path.join(os.tmpdir(), `buddy-${releaseDistribution().id}-installers-`),
  )
  try {
    for (const filename of INSTALLERS) {
      const sourcePath = path.resolve(import.meta.dir, "../../scripts", filename)
      const filePath = distribution.id === "prod" ? sourcePath : path.join(directory, filename)
      if (distribution.id === "beta") {
        await Bun.write(
          filePath,
          renderReleaseInstaller(await Bun.file(sourcePath).text(), distribution.id),
        )
      }
      await uploadReleaseAssetSafely({ filePath, repository, tag })
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
