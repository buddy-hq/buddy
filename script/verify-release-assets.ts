#!/usr/bin/env bun

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
    "Usage: bun ./script/verify-release-assets.ts --tag v0.0.40 [--repo owner/repo] [--macos-arm64 true|false] [--macos-x64 true|false] [--windows-x64 true|false]",
  )
}

function parseArgs(): { repo: string; tag: string; targets: ReleaseTargetSelection } {
  const args = process.argv.slice(2)
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

  return { repo, tag, targets }
}

function parseBooleanFlag(value: string | undefined): boolean {
  if (value === "true" || value === "1") return true
  if (value === "false" || value === "0") return false
  usage()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseReleaseAssets(value: unknown): GithubReleaseAsset[] {
  if (!isRecord(value)) {
    throw new Error("GitHub release response was not an object")
  }

  const rawAssets = value.assets
  if (!Array.isArray(rawAssets)) {
    throw new Error("GitHub release response did not include an assets array")
  }

  return rawAssets.map((asset) => {
    if (!isRecord(asset)) {
      throw new Error("GitHub release asset was not an object")
    }

    const name = asset.name
    const browserDownloadUrl = asset.browser_download_url
    if (typeof name !== "string" || typeof browserDownloadUrl !== "string") {
      throw new Error("GitHub release asset was missing name or browser_download_url")
    }

    return { browserDownloadUrl, name }
  })
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": GITHUB_USER_AGENT,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

function findAsset(assets: GithubReleaseAsset[], required: RequiredAsset): GithubReleaseAsset {
  const asset = assets.find((candidate) =>
    typeof required.matcher === "string"
      ? candidate.name === required.matcher
      : required.matcher.test(candidate.name),
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
  const response = await fetch(asset.browserDownloadUrl, {
    method: "HEAD",
  })

  if (!response.ok) {
    throw new Error(
      `Release asset is not reachable: ${asset.name} (${response.status} ${response.statusText})`,
    )
  }
}

async function fetchTextAsset(asset: GithubReleaseAsset): Promise<string> {
  const response = await fetch(asset.browserDownloadUrl)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch text release asset: ${asset.name} (${response.status} ${response.statusText})`,
    )
  }

  return await response.text()
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

const { repo, tag, targets } = parseArgs()
const releaseApiUrl = `https://api.github.com/repos/${repo}/releases/tags/${tag}`
const assets = parseReleaseAssets(await fetchJson(releaseApiUrl))
const required = requiredAssetsForTag(tag, targets).map((asset) => findAsset(assets, asset))

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

console.log(`Verified ${required.length} release assets for ${repo}@${tag}`)
