import { describe, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { renderReleaseInstaller } from "./release/installers"

const sharedRepository = "https://github.com/prashantbhudwal/buddy-releases/releases/download"
const betaBase = `${sharedRepository}/beta-v0.10.0`
const macTest = process.platform === "darwin" ? test : test.skip
const powershellTest =
  spawnSync("pwsh", ["-NoProfile", "-Command", "exit 0"]).status === 0 ? test : test.skip
const release = (tag_name: string, prerelease = true, draft = false) => ({
  tag_name,
  prerelease,
  draft,
  assets: [
    {
      name: "buddy-v0.10.0-windows-x64.exe",
      size: 7,
      browser_download_url: `${sharedRepository}/v0.10.0/stable.exe`,
    },
  ],
})
const mixedPages = [
  [
    release("v99.0.0", false),
    release("v98.0.0"),
    release("beta-v0.9.0"),
    release("beta-v99.0.0", false),
    release("beta-v98.0.0", true, true),
    release("beta-v1.0"),
    release("beta-v2.0.0-extra"),
    ...Array.from({ length: 93 }, () => release("skill-artifacts")),
  ],
  [release("beta-v0.10.0"), release("v0.10.0", false)],
]

type FixtureInput = {
  platform: "macos" | "windows"
  pages?: typeof mixedPages
  manifest?: string
  candidates?: boolean
}

async function installerFixture({
  platform,
  pages = mixedPages,
  manifest = "fallback.zip",
  candidates = false,
}: FixtureInput) {
  const root = await mkdtemp(path.join(os.tmpdir(), "buddy-public-beta-installer-"))
  try {
    const bin = path.join(root, "bin")
    await mkdir(bin)
    const suffix = platform === "macos" ? "macos.sh" : "windows.ps1"
    const source = await Bun.file(
      path.resolve(import.meta.dir, `../scripts/install-buddy-${suffix}`),
    ).text()
    const installer = path.join(root, `install.${platform === "macos" ? "sh" : "ps1"}`)
    await Bun.write(installer, renderReleaseInstaller(source, "beta"))
    await Bun.write(path.join(root, "pages.json"), JSON.stringify(pages))
    const log = path.join(root, "commands.txt")
    const curl = path.join(bin, "curl")
    await Bun.write(
      curl,
      `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
const url = args.find((arg) => arg.startsWith("https://"));
fs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify(args) + "\\n");
if (!url) process.exit(2);
if (url.includes("api.github.com")) {
  const page = Number(new URL(url).searchParams.get("page"));
  process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync(process.env.FIXTURE_PAGES, "utf8"))[page - 1] ?? []));
} else if (args.includes("-w")) {
  process.stdout.write(url);
} else if (url.endsWith(".json")) {
  process.stdout.write(JSON.stringify({ url: process.env.FIXTURE_MANIFEST }));
} else if (args.includes("-fsSLI")) {
  if (process.env.FIXTURE_CANDIDATES === "true" || url.endsWith("fallback.zip")) process.stdout.write("content-length: 7\\n");
  else process.exit(22);
} else {
  const output = args[args.indexOf("-o") + 1];
  fs.writeFileSync(output, "fixture");
}
`,
    )
    await chmod(curl, 0o755)
    const uname = path.join(bin, "uname")
    await Bun.write(uname, "#!/bin/bash\necho arm64\n")
    await chmod(uname, 0o755)
    const wrapper = path.join(root, platform === "macos" ? "wrapper.sh" : "wrapper.ps1")
    if (platform === "macos") {
      await Bun.write(
        wrapper,
        `function /usr/bin/open { printf 'launch %s\\n' "$*" >> "$FIXTURE_LOG"; }
function /usr/bin/xattr { :; }
source "$1"
`,
      )
    } else {
      await Bun.write(
        wrapper,
        `Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
# Load the real configuration and functions, then replace only network and OS boundaries.
$parts = (Get-Content -LiteralPath $env:FIXTURE_INSTALLER -Raw) -split "\\r?\\nEnable-Tls12ForWindowsPowerShell\\r?\\n", 2
Invoke-Expression $parts[0]
function Invoke-RestMethod {
  param($Uri, $Headers, $ErrorAction)
  Add-Content -LiteralPath $env:FIXTURE_LOG -Value "api $Uri"
  $pages = Get-Content -LiteralPath $env:FIXTURE_PAGES -Raw | ConvertFrom-Json
  $page = [int]([regex]::Match($Uri, 'page=([0-9]+)$').Groups[1].Value)
  if ($page -le $pages.Count) { return $pages[$page - 1] }
  return @()
}
function Invoke-WebRequest {
  param($Uri, [switch]$UseBasicParsing, $ErrorAction)
  Add-Content -LiteralPath $env:FIXTURE_LOG -Value "manifest $Uri"
  return @{ Content = "- url: $env:FIXTURE_MANIFEST" }
}
function Save-FileFromUrl {
  param($Uri, $OutFile, $ExpectedBytes)
  Add-Content -LiteralPath $env:FIXTURE_LOG -Value "download $Uri"
  Set-Content -LiteralPath $OutFile -Value "fixture" -NoNewline
}
function Get-RemoteFileSize {
  param($Uri)
  Add-Content -LiteralPath $env:FIXTURE_LOG -Value "head $Uri"
  return 7
}
function Unblock-File { param($Path, $ErrorAction) }
function Start-Process {
  param($FilePath)
  Add-Content -LiteralPath $env:FIXTURE_LOG -Value "launch $FilePath"
}
Invoke-Expression ("Enable-Tls12ForWindowsPowerShell" + [Environment]::NewLine + $parts[1])
`,
      )
    }
    const result = spawnSync(
      platform === "macos" ? "bash" : "pwsh",
      platform === "macos" ? [wrapper, installer] : ["-NoProfile", "-File", wrapper],
      {
        env: {
          ...process.env,
          HOME: root,
          TMPDIR: root,
          PATH: `${bin}:${process.env.PATH}`,
          BUDDY_BETA_RELEASE_REPO: "",
          BUDDY_DOWNLOAD_DIR: path.join(root, "downloads"),
          BUDDY_DOWNLOAD_RETRIES: "1",
          PROCESSOR_ARCHITEW6432: "",
          PROCESSOR_ARCHITECTURE: "AMD64",
          FIXTURE_INSTALLER: installer,
          FIXTURE_PAGES: path.join(root, "pages.json"),
          FIXTURE_LOG: log,
          FIXTURE_MANIFEST: manifest,
          FIXTURE_CANDIDATES: String(candidates),
        },
        encoding: "utf8",
        timeout: 20_000,
      },
    )
    return { result, commands: (await Bun.file(log).exists()) ? await Bun.file(log).text() : "" }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function realHttpDiscovery(platform: "macos" | "windows", singleObjectPage = false) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-beta-http-discovery-"))
  const requested: number[] = []
  const firstPage =
    mixedPages[0]?.map((item) =>
      item.tag_name === "beta-v0.9.0" ? { ...item, tag_name: "beta-v0.1.0" } : item,
    ) ?? []
  const secondPage = release("beta-v0.2.0")
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const page = Number(new URL(request.url).searchParams.get("page"))
      requested.push(page)
      return Response.json(
        page === 1
          ? firstPage
          : singleObjectPage
            ? secondPage
            : [secondPage, release("v99.0.0", false)],
      )
    },
  })
  try {
    const suffix = platform === "macos" ? "macos.sh" : "windows.ps1"
    const source = await Bun.file(
      path.resolve(import.meta.dir, `../scripts/install-buddy-${suffix}`),
    ).text()
    const discovery = renderReleaseInstaller(source, "beta").match(
      /# BEGIN RELEASE DISCOVERY\r?\n([\s\S]*?)# END RELEASE DISCOVERY/u,
    )?.[1]
    if (!discovery) throw new Error("Rendered discovery block is missing")
    const localDiscovery = discovery.replaceAll("https://api.github.com", server.url.origin)
    const driver =
      platform === "windows"
        ? `Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repo = "prashantbhudwal/buddy-releases"
${localDiscovery}
(Resolve-LatestRelease).tag_name
`
        : `set -euo pipefail
REPO="prashantbhudwal/buddy-releases"
fail() { printf '%s\\n' "$1" >&2; }
${localDiscovery}
resolve_latest_release_tag
printf '%s\\n' "$TAG"
`
    const driverPath = path.join(
      directory,
      platform === "windows" ? "discovery.ps1" : "discovery.sh",
    )
    await Bun.write(driverPath, driver)
    const child = Bun.spawn(
      platform === "windows" ? ["pwsh", "-NoProfile", "-File", driverPath] : ["bash", driverPath],
      {
        cwd: directory,
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    try {
      const [status, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      return { status, stdout, stderr, requested }
    } finally {
      if (child.exitCode === null) {
        child.kill()
        await child.exited
      }
    }
  } finally {
    server.stop(true)
    await rm(directory, { recursive: true, force: true })
  }
}

describe("rendered Beta macOS installer", () => {
  macTest(
    "real curl JSON output paginates a mixed page and selects Beta from page two",
    async () => {
      const result = await realHttpDiscovery("macos")
      expect(result.status).toBe(0)
      expect(result.stderr).toBe("")
      expect(result.stdout.trim()).toBe("beta-v0.2.0")
      expect(result.requested).toEqual([1, 2])
    },
  )

  macTest(
    "paginates, orders numerically and pins direct assets to the selected Beta tag",
    async () => {
      const fixture = await installerFixture({ platform: "macos", candidates: true })
      expect(fixture.result.status).toBe(0)
      expect(fixture.commands).toContain("per_page=100&page=2")
      expect(fixture.commands).toContain(`${betaBase}/buddy-v0.10.0-macos-apple-silicon.dmg`)
      expect(fixture.commands).toContain("launch ")
      expect(fixture.commands).not.toContain("/releases/latest")
      expect(fixture.commands).not.toContain("/releases/download/v")
    },
  )

  macTest.each(["fallback.zip", `${sharedRepository}/beta-v0.9.0/fallback.zip`])(
    "pins target manifest and fallback URL: %s",
    async (manifest) => {
      const fixture = await installerFixture({ platform: "macos", manifest })
      expect(fixture.result.status).toBe(0)
      expect(fixture.commands).toContain(`${betaBase}/latest-macos-arm64.json`)
      expect(fixture.commands).toContain(
        manifest.startsWith("https:") ? manifest : `${betaBase}/${manifest}`,
      )
      expect(fixture.commands).toContain("launch ")
      expect(fixture.commands).not.toContain("/releases/latest")
      expect(fixture.commands).toContain(`${betaBase}/buddy-electron-mac-arm64.zip`)
    },
  )

  macTest.each([
    `${sharedRepository}/v0.10.0/fallback.zip`,
    "https://example.com/fallback.zip",
    "../v0.10.0/fallback.zip",
  ])("rejects fallback outside a Beta release: %s", async (manifest) => {
    const fixture = await installerFixture({ platform: "macos", manifest })
    expect(fixture.result.status).toBe(1)
    expect(fixture.result.stderr).toContain("Beta manifest URL must stay inside")
    expect(fixture.commands).not.toContain("launch ")
    expect(fixture.commands).not.toContain('"-o"')
  })

  macTest("fails before any asset download or launch when no published Beta exists", async () => {
    const fixture = await installerFixture({
      platform: "macos",
      pages: [
        [release("v1.0.0"), release("beta-v9.0.0", false), release("beta-v8.0.0", true, true)],
      ],
    })
    expect(fixture.result.status).toBe(1)
    expect(fixture.result.stderr).toContain("No published Beta prerelease")
    expect(fixture.commands).not.toContain(
      "github.com/prashantbhudwal/buddy-releases/releases/download",
    )
    expect(fixture.commands).not.toContain("launch ")
  })
})

describe("rendered Beta Windows installer", () => {
  powershellTest.each([
    ["array", false],
    ["single object", true],
  ] as const)(
    "real Invoke-RestMethod paginates a mixed page and selects Beta from page two (%s)",
    async (_pageForm, singleObjectPage) => {
      const result = await realHttpDiscovery("windows", singleObjectPage)
      expect(result.status).toBe(0)
      expect(result.stderr).toBe("")
      expect(result.stdout.trim()).toBe("beta-v0.2.0")
      expect(result.requested).toEqual([1, 2])
    },
  )

  powershellTest("paginates and pins API asset metadata to the selected Beta tag", async () => {
    const fixture = await installerFixture({ platform: "windows", candidates: true })
    expect(fixture.result.status).toBe(0)
    expect(fixture.commands).toContain("per_page=100&page=2")
    expect(fixture.commands).toContain(`download ${betaBase}/buddy-v0.10.0-windows-x64.exe`)
    expect(fixture.commands).not.toContain("/releases/download/v")
    expect(fixture.commands).toContain("launch ")
  })

  powershellTest.each(["fallback.exe", `${sharedRepository}/beta-v0.9.0/fallback.exe`])(
    "pins manifest fallback: %s",
    async (manifest) => {
      const pages = mixedPages.map((page) => page.map((item) => ({ ...item, assets: [] })))
      const fixture = await installerFixture({ platform: "windows", manifest, pages })
      expect(fixture.result.status).toBe(0)
      expect(fixture.commands).toContain(`manifest ${betaBase}/latest-windows-x64.yml`)
      expect(fixture.commands).toContain(
        `download ${manifest.startsWith("https:") ? manifest : `${betaBase}/${manifest}`}`,
      )
      expect(fixture.commands).toContain("launch ")
      expect(fixture.commands).not.toContain("/releases/latest")
    },
  )

  powershellTest.each([
    `${sharedRepository}/v0.10.0/fallback.exe`,
    "https://example.com/fallback.exe",
    "../v0.10.0/fallback.exe",
  ])("rejects fallback outside a Beta release: %s", async (manifest) => {
    const pages = mixedPages.map((page) => page.map((item) => ({ ...item, assets: [] })))
    const fixture = await installerFixture({ platform: "windows", manifest, pages })
    expect(fixture.result.status).toBe(1)
    expect(fixture.result.stderr).toContain("Beta manifest URL must stay inside")
    expect(fixture.commands).not.toContain("download ")
    expect(fixture.commands).not.toContain("launch ")
  })

  powershellTest("fails before downloads or launch without a published Beta release", async () => {
    const fixture = await installerFixture({
      platform: "windows",
      pages: [[release("v1.0.0"), release("beta-v9.0.0", false)]],
    })
    expect(fixture.result.status).toBe(1)
    expect(fixture.result.stderr).toContain("No published Beta prerelease")
    expect(fixture.commands).not.toContain("download ")
    expect(fixture.commands).not.toContain("manifest ")
    expect(fixture.commands).not.toContain("launch ")
  })
})
