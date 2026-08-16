#!/usr/bin/env bun

import { $ } from "bun"
import { isJsonObject, parseTJsonValue, parseTString, type TJsonValue } from "./parse-values"
import { releaseRepository } from "./release-repositories"
import {
  resolveMacOsReleaseArtifactFilename,
  resolveMacOsUpdateManifestFilename,
  resolveWindowsReleaseArtifactFilename,
  resolveWindowsUpdateManifestFilename,
} from "../packages/desktop-electron/src/shared/release-asset-names"

const DEFAULT_SOURCE_REPOSITORY = "prashantbhudwal/buddy"
const GITHUB_API_VERSION = "2022-11-28"
const GITHUB_USER_AGENT = "buddy-release-asset-verifier"
const VERIFICATION_ATTEMPTS = 5
const VERIFICATION_RETRY_DELAY_MS = 2_000

type RequiredAsset = {
  label: string
  matcher: RegExp | string
}

type GithubReleaseAsset = {
  browserDownloadUrl: string
  name: string
}

type ReleaseTargetSelection = {
  macosArm64: boolean
  macosX64: boolean
  windowsX64: boolean
}

const advancedMathTargets = ["aarch64-apple-darwin", "x86_64-apple-darwin"] as const

function usage(): never {
  throw new Error(
    "Usage: bun ./script/verify-release-assets.ts --tag v0.0.40 [--repo owner/repo] [--draft] [--macos-arm64 true|false] [--macos-x64 true|false] [--windows-x64 true|false]",
  )
}

function parseArgs() {
  const args = process.argv.slice(2)
  let draft = false
  let repo = releaseRepository()
  let tag = ""
  const targets: ReleaseTargetSelection = {
    macosArm64: true,
    macosX64: true,
    windowsX64: true,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--repo") {
      repo = args[index + 1]?.trim() || ""
      index += 1
      continue
    }
    if (arg === "--draft") {
      draft = true
      continue
    }
    if (arg === "--tag") {
      tag = args[index + 1]?.trim() || ""
      index += 1
      continue
    }
    if (arg === "--macos-arm64") {
      targets.macosArm64 = parseBooleanFlag(args[index + 1])
      index += 1
      continue
    }
    if (arg === "--macos-x64") {
      targets.macosX64 = parseBooleanFlag(args[index + 1])
      index += 1
      continue
    }
    if (arg === "--windows-x64") {
      targets.windowsX64 = parseBooleanFlag(args[index + 1])
      index += 1
      continue
    }
    if (!arg?.startsWith("--") && !tag) {
      tag = arg.trim()
      continue
    }
    usage()
  }

  if (!repo || !tag) usage()
  if (!targets.macosArm64 && !targets.macosX64 && !targets.windowsX64) {
    throw new Error("At least one release target must be selected")
  }

  return { draft, repo, tag, targets }
}

function parseBooleanFlag(value: string | undefined): boolean {
  if (value === "true" || value === "1") return true
  if (value === "false" || value === "0") return false
  usage()
}

function parseReleaseAssets<TValue>(value: TValue): GithubReleaseAsset[] {
  if (!isJsonObject(value)) {
    throw new Error("GitHub release response was not an object")
  }

  const rawAssets = value.assets
  if (!Array.isArray(rawAssets)) {
    throw new Error("GitHub release response did not include an assets array")
  }

  return rawAssets.map((asset) => {
    if (!isJsonObject(asset)) {
      throw new Error("GitHub release asset was not an object")
    }

    const name = parseTString(asset.name)
    const browserDownloadUrl = parseTString(asset.browser_download_url) ?? parseTString(asset.url)
    if (name === undefined || browserDownloadUrl === undefined) {
      throw new Error("GitHub release asset was missing name or browser_download_url")
    }

    return { browserDownloadUrl, name }
  })
}

async function fetchDraftReleaseAssets(repo: string, tag: string): Promise<GithubReleaseAsset[]> {
  const value = await $`gh release view ${tag} --repo ${repo} --json assets`.quiet().json()
  return parseReleaseAssets(value)
}

async function fetchJson(url: string): Promise<TJsonValue> {
  for (let attempt = 1; attempt <= VERIFICATION_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": GITHUB_USER_AGENT,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    })

    if (response.ok) {
      const parsed = parseTJsonValue(await response.json())
      if (parsed === undefined) {
        throw new Error(`Failed to parse ${url}`)
      }
      return parsed
    }
    if (attempt === VERIFICATION_ATTEMPTS) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
    }
    await Bun.sleep(VERIFICATION_RETRY_DELAY_MS)
  }

  throw new Error(`Failed to fetch ${url}`)
}

function findAsset(assets: GithubReleaseAsset[], required: RequiredAsset): GithubReleaseAsset {
  const asset = assets.find((candidate) =>
    required.matcher instanceof RegExp
      ? required.matcher.test(candidate.name)
      : candidate.name === required.matcher,
  )
  if (!asset) {
    throw new Error(`Missing required release asset: ${required.label}`)
  }

  return asset
}

function releaseVersionFromTag(tag: string): string {
  return tag.replace(/^v/, "")
}

function requiredAssetsForTag(tag: string, targets: ReleaseTargetSelection): RequiredAsset[] {
  const version = releaseVersionFromTag(tag)
  const selectedTargetAssets = [
    ...(targets.macosArm64
      ? [
          resolveMacOsReleaseArtifactFilename(version, "arm64", "dmg"),
          `${resolveMacOsReleaseArtifactFilename(version, "arm64", "dmg")}.blockmap`,
          resolveMacOsReleaseArtifactFilename(version, "arm64", "zip"),
          `${resolveMacOsReleaseArtifactFilename(version, "arm64", "zip")}.blockmap`,
        ]
      : []),
    ...(targets.macosX64
      ? [
          resolveMacOsReleaseArtifactFilename(version, "x64", "dmg"),
          `${resolveMacOsReleaseArtifactFilename(version, "x64", "dmg")}.blockmap`,
          resolveMacOsReleaseArtifactFilename(version, "x64", "zip"),
          `${resolveMacOsReleaseArtifactFilename(version, "x64", "zip")}.blockmap`,
        ]
      : []),
    ...(targets.windowsX64
      ? [
          resolveWindowsReleaseArtifactFilename(version, "x64", "exe"),
          `${resolveWindowsReleaseArtifactFilename(version, "x64", "exe")}.blockmap`,
        ]
      : []),
  ] as const
  const targetManifestAssets = [
    resolveMacOsUpdateManifestFilename("arm64"),
    `${resolveMacOsUpdateManifestFilename("arm64")}.sig`,
    resolveMacOsUpdateManifestFilename("x64"),
    `${resolveMacOsUpdateManifestFilename("x64")}.sig`,
    resolveWindowsUpdateManifestFilename("x64"),
    `${resolveWindowsUpdateManifestFilename("x64")}.sig`,
  ] as const
  const exactAssets = [
    ...selectedTargetAssets,
    ...targetManifestAssets,
    "learning-commons-knowledge-graph.db.json",
    "learning-commons-knowledge-graph.db.zst",
    "learning-commons-knowledge-graph.db.zst.sha256",
    "recovery-policy.json",
    "recovery-policy.json.sig",
    "install-buddy-macos.sh",
    "install-buddy-windows.ps1",
  ] as const

  const selectedAdvancedMathTargets = [
    ...(targets.macosArm64 ? [advancedMathTargets[0]] : []),
    ...(targets.macosX64 ? [advancedMathTargets[1]] : []),
  ]

  return [
    ...exactAssets.map((name) => ({ label: name, matcher: name })),
    ...selectedAdvancedMathTargets.flatMap((target) => [
      {
        label: `advanced math bundle (${target})`,
        matcher: new RegExp(`^buddy-advanced-math-v.+-${target}\\.zip$`),
      },
      {
        label: `advanced math checksum (${target})`,
        matcher: new RegExp(`^buddy-advanced-math-v.+-${target}\\.zip\\.sha256$`),
      },
    ]),
  ]
}

async function assertReachable(asset: GithubReleaseAsset): Promise<void> {
  for (let attempt = 1; attempt <= VERIFICATION_ATTEMPTS; attempt += 1) {
    const response = await fetch(asset.browserDownloadUrl, {
      method: "HEAD",
    })
    if (response.ok) {
      return
    }
    if (attempt === VERIFICATION_ATTEMPTS) {
      throw new Error(
        `Release asset is not reachable: ${asset.name} (${response.status} ${response.statusText})`,
      )
    }
    await Bun.sleep(VERIFICATION_RETRY_DELAY_MS)
  }
}

async function fetchTextAsset(asset: GithubReleaseAsset): Promise<string> {
  for (let attempt = 1; attempt <= VERIFICATION_ATTEMPTS; attempt += 1) {
    const response = await fetch(asset.browserDownloadUrl)
    if (response.ok) {
      return await response.text()
    }
    if (attempt === VERIFICATION_ATTEMPTS) {
      throw new Error(
        `Failed to fetch text release asset: ${asset.name} (${response.status} ${response.statusText})`,
      )
    }
    await Bun.sleep(VERIFICATION_RETRY_DELAY_MS)
  }

  throw new Error(`Failed to fetch text release asset: ${asset.name}`)
}

function assertManifestRepositoryReferences(input: {
  content: string
  name: string
  releaseRepo: string
}): void {
  const privateRepoUrl = `github.com/${DEFAULT_SOURCE_REPOSITORY}/`
  if (input.content.includes(privateRepoUrl)) {
    throw new Error(
      `${input.name} references private source repository ${DEFAULT_SOURCE_REPOSITORY}`,
    )
  }

  const githubUrlMatches = input.content.matchAll(/https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\//g)
  for (const match of githubUrlMatches) {
    const referencedRepo = match[1]
    if (referencedRepo && referencedRepo !== input.releaseRepo) {
      throw new Error(`${input.name} references unexpected GitHub repository ${referencedRepo}`)
    }
  }

  if (
    input.name.startsWith("latest-") &&
    !input.content.includes(`github.com/${input.releaseRepo}/`)
  ) {
    throw new Error(`${input.name} does not include absolute ${input.releaseRepo} asset URLs`)
  }
}

const { draft, repo, tag, targets } = parseArgs()
const releaseApiUrl = `https://api.github.com/repos/${repo}/releases/tags/${tag}`
const assets = draft
  ? await fetchDraftReleaseAssets(repo, tag)
  : parseReleaseAssets(await fetchJson(releaseApiUrl))
const required = requiredAssetsForTag(tag, targets).map((asset) => findAsset(assets, asset))

if (!draft) {
  await Promise.all(required.map((asset) => assertReachable(asset)))

  for (const name of [
    resolveMacOsUpdateManifestFilename("arm64"),
    resolveMacOsUpdateManifestFilename("x64"),
    resolveWindowsUpdateManifestFilename("x64"),
  ] as const) {
    const asset = findAsset(assets, { label: name, matcher: name })
    const content = await fetchTextAsset(asset)
    assertManifestRepositoryReferences({ content, name, releaseRepo: repo })
  }
}

console.log(`Verified ${required.length} ${draft ? "draft " : ""}release assets for ${repo}@${tag}`)
