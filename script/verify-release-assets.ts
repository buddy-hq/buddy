#!/usr/bin/env bun

import { $ } from "bun"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { verifySignedMessage } from "@buddy/script/minisign"
import { z } from "zod"
import { BUDDY_MINISIGN_PUBLIC_KEY } from "../packages/desktop-electron/src/main/update-common"
import {
  resolveMacOsReleaseArtifactFilename,
  resolveMacOsUpdateManifestFilename,
  resolveWindowsReleaseArtifactFilename,
  resolveWindowsUpdateManifestFilename,
} from "../packages/desktop-electron/src/shared/release-asset-names"
import {
  assertAssetDigestSet,
  githubAssetDigest,
  normalizeSha256Digest,
  readGithubReleaseAssets,
  sha256File,
  type GithubReleaseAsset,
} from "./release/assets"

const MAX_RELEASE_ARCHIVE_BUFFER_BYTES = 512 * 1024 * 1024
import {
  assertCheckpointMatches,
  expectedCheckpointAssetNames,
  parseReleaseCheckpoint,
  RELEASE_CHECKPOINT_SCHEMA_VERSION,
  releaseCheckpointFilename,
  type ReleaseCheckpointTarget,
} from "./release/checkpoint"
import { parseReleaseFreeze, RELEASE_FREEZE_FILENAME } from "./release/freeze"
import { parseReleasePlan, releasePlanDigest, RELEASE_PLAN_FILENAME } from "./release/plan"
import { readNewestPublishedReleaseWithAssets } from "./release/published-manifest"
import {
  parseReleaseSourceMetadata,
  RELEASE_SOURCE_METADATA_FILENAME,
} from "./release-source-metadata"
import { releaseRepository } from "./release-repositories"
import { resolveGithubSourceTag } from "./release-source-tag"

const VERIFICATION_DIRECTORY_PREFIX = "buddy-release-verify-"
const PUBLIC_VERIFICATION_ATTEMPTS = 5
const PUBLIC_VERIFICATION_RETRY_DELAY_MS = 2_000

type ReleaseTargetSelection = {
  macosArm64: boolean
  macosX64: boolean
  windowsX64: boolean
}

type RequiredAsset = {
  label: string
  matcher: RegExp | string
}

type VerifyArguments = {
  assetDirectory?: string
  draft: boolean
  planDigest?: string
  repo: string
  sourceSha?: string
  tag: string
  targets: ReleaseTargetSelection
}

type UpdateManifest = {
  files: {
    blockMapSize?: number
    sha512: string
    size: number
    url: string
  }[]
  releaseDate?: string
  version: string
}

const updateManifestSchema = z.object({
  files: z
    .array(
      z.object({
        blockMapSize: z.number().optional(),
        sha512: z.string().min(1),
        size: z.number().int().nonnegative(),
        url: z.string().url(),
      }),
    )
    .min(1),
  releaseDate: z.string().optional(),
  version: z.string().min(1),
})

function usage(): never {
  throw new Error(
    "Usage: verify-release-assets.ts --tag vX.Y.Z [--repo owner/repo] [--draft] [--source-sha SHA] [--plan-digest SHA256] [--macos-arm64 true|false] [--macos-x64 true|false] [--windows-x64 true|false]",
  )
}

function parseBooleanFlag(value: string | undefined): boolean {
  if (value === "true" || value === "1") return true
  if (value === "false" || value === "0") return false
  usage()
}

function parseArgs(): VerifyArguments {
  const args = process.argv.slice(2)
  const result: VerifyArguments = {
    draft: false,
    repo: releaseRepository(),
    tag: "",
    targets: { macosArm64: true, macosX64: true, windowsX64: true },
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--draft") {
      result.draft = true
      continue
    }
    if (argument === "--asset-dir") {
      result.assetDirectory = args[index + 1]?.trim() ?? ""
      index += 1
      continue
    }
    if (argument === "--repo") {
      result.repo = args[index + 1]?.trim() ?? ""
      index += 1
      continue
    }
    if (argument === "--tag") {
      result.tag = args[index + 1]?.trim() ?? ""
      index += 1
      continue
    }
    if (argument === "--source-sha") {
      result.sourceSha = args[index + 1]?.trim().toLowerCase()
      index += 1
      continue
    }
    if (argument === "--plan-digest") {
      result.planDigest = args[index + 1]?.trim().toLowerCase()
      index += 1
      continue
    }
    if (argument === "--macos-arm64") {
      result.targets.macosArm64 = parseBooleanFlag(args[index + 1])
      index += 1
      continue
    }
    if (argument === "--macos-x64") {
      result.targets.macosX64 = parseBooleanFlag(args[index + 1])
      index += 1
      continue
    }
    if (argument === "--windows-x64") {
      result.targets.windowsX64 = parseBooleanFlag(args[index + 1])
      index += 1
      continue
    }
    if (!argument?.startsWith("--") && !result.tag) {
      result.tag = argument.trim()
      continue
    }
    usage()
  }

  if (!result.repo || !/^v\d+\.\d+\.\d+$/u.test(result.tag)) usage()
  if (!result.targets.macosArm64 && !result.targets.macosX64 && !result.targets.windowsX64) {
    throw new Error("At least one release target must be selected")
  }
  if (result.sourceSha && !/^[0-9a-f]{40}$/u.test(result.sourceSha)) {
    throw new Error("source-sha must be a full 40-character commit SHA")
  }
  if (result.planDigest) result.planDigest = normalizeSha256Digest(result.planDigest)
  return result
}

function releaseVersionFromTag(tag: string): string {
  return tag.slice(1)
}

function checkpointTargets(targets: ReleaseTargetSelection): ReleaseCheckpointTarget[] {
  return [
    ...(targets.macosArm64 ? (["electron-macos-arm64", "advanced-math-macos-arm64"] as const) : []),
    ...(targets.macosX64 ? (["electron-macos-x64", "advanced-math-macos-x64"] as const) : []),
    ...(targets.windowsX64 ? (["electron-windows-x64"] as const) : []),
    "standards",
  ]
}

function requiredAssetsForRelease(options: VerifyArguments): RequiredAsset[] {
  const version = releaseVersionFromTag(options.tag)
  const exactNames = [
    ...(options.targets.macosArm64
      ? [
          resolveMacOsReleaseArtifactFilename(version, "arm64", "dmg"),
          `${resolveMacOsReleaseArtifactFilename(version, "arm64", "dmg")}.blockmap`,
          resolveMacOsReleaseArtifactFilename(version, "arm64", "zip"),
          `${resolveMacOsReleaseArtifactFilename(version, "arm64", "zip")}.blockmap`,
        ]
      : []),
    ...(options.targets.macosX64
      ? [
          resolveMacOsReleaseArtifactFilename(version, "x64", "dmg"),
          `${resolveMacOsReleaseArtifactFilename(version, "x64", "dmg")}.blockmap`,
          resolveMacOsReleaseArtifactFilename(version, "x64", "zip"),
          `${resolveMacOsReleaseArtifactFilename(version, "x64", "zip")}.blockmap`,
        ]
      : []),
    ...(options.targets.windowsX64
      ? [
          resolveWindowsReleaseArtifactFilename(version, "x64", "exe"),
          `${resolveWindowsReleaseArtifactFilename(version, "x64", "exe")}.blockmap`,
        ]
      : []),
    resolveMacOsUpdateManifestFilename("arm64"),
    `${resolveMacOsUpdateManifestFilename("arm64")}.sig`,
    resolveMacOsUpdateManifestFilename("x64"),
    `${resolveMacOsUpdateManifestFilename("x64")}.sig`,
    resolveWindowsUpdateManifestFilename("x64"),
    `${resolveWindowsUpdateManifestFilename("x64")}.sig`,
    "learning-commons-knowledge-graph.db.json",
    "learning-commons-knowledge-graph.db.zst",
    "learning-commons-knowledge-graph.db.zst.sha256",
    "recovery-policy.json",
    "recovery-policy.json.sig",
    "install-buddy-macos.sh",
    "install-buddy-windows.ps1",
    RELEASE_PLAN_FILENAME,
    RELEASE_SOURCE_METADATA_FILENAME,
    ...checkpointTargets(options.targets).map(releaseCheckpointFilename),
    ...(!options.draft ? [RELEASE_FREEZE_FILENAME] : []),
  ]
  const advancedMathTargets = [
    ...(options.targets.macosArm64 ? ["aarch64-apple-darwin"] : []),
    ...(options.targets.macosX64 ? ["x86_64-apple-darwin"] : []),
  ]

  return [
    ...exactNames.map((name) => ({ label: name, matcher: name })),
    ...advancedMathTargets.flatMap((target) => [
      {
        label: `advanced math bundle (${target})`,
        matcher: new RegExp(`^buddy-advanced-math-v.+-${target}\\.zip$`, "u"),
      },
      {
        label: `advanced math checksum (${target})`,
        matcher: new RegExp(`^buddy-advanced-math-v.+-${target}\\.zip\\.sha256$`, "u"),
      },
    ]),
  ]
}

function findAsset(
  assets: readonly GithubReleaseAsset[],
  required: RequiredAsset,
): GithubReleaseAsset {
  const asset = assets.find((candidate) =>
    required.matcher instanceof RegExp
      ? required.matcher.test(candidate.name)
      : candidate.name === required.matcher,
  )
  if (!asset) throw new Error(`Missing required release asset: ${required.label}`)
  return asset
}

function assertExactReleaseInventory(
  actual: readonly GithubReleaseAsset[],
  required: readonly GithubReleaseAsset[],
): void {
  const actualNames = actual.map((asset) => asset.name).toSorted()
  const requiredNames = required.map((asset) => asset.name).toSorted()
  if (JSON.stringify(actualNames) !== JSON.stringify(requiredNames)) {
    const unexpected = actualNames.filter((name) => !requiredNames.includes(name))
    const missing = requiredNames.filter((name) => !actualNames.includes(name))
    throw new Error(
      `Release asset inventory mismatch; missing=${missing.join(",") || "none"}; unexpected=${unexpected.join(",") || "none"}`,
    )
  }
}

async function downloadAssets(input: {
  assets: readonly GithubReleaseAsset[]
  directory: string
  repo: string
  tag: string
}): Promise<void> {
  await mkdir(input.directory, { recursive: true })
  const missing: GithubReleaseAsset[] = []
  for (const asset of input.assets) {
    if (!(await Bun.file(path.join(input.directory, asset.name)).exists())) missing.push(asset)
  }
  if (missing.length === 0) return
  await $`gh release download ${input.tag} --repo ${input.repo} --dir ${input.directory} ${missing.flatMap((asset) => ["--pattern", asset.name])}`.quiet()
}

async function verifyDownloadedDigests(
  assets: readonly GithubReleaseAsset[],
  directory: string,
): Promise<void> {
  for (const asset of assets) {
    const filePath = path.join(directory, asset.name)
    const file = Bun.file(filePath)
    if (!(await file.exists())) throw new Error(`Downloaded asset is missing: ${asset.name}`)
    if (file.size !== asset.size) {
      throw new Error(`Downloaded asset size mismatch: ${asset.name}`)
    }
    const digest = await sha256File(filePath)
    if (digest !== normalizeSha256Digest(asset.digest)) {
      throw new Error(`Downloaded asset SHA-256 mismatch: ${asset.name}`)
    }
  }
}

async function sha512File(filePath: string): Promise<string> {
  const hash = createHash("sha512")
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest("base64")
}

async function verifySignedFile(directory: string, filename: string): Promise<void> {
  const verified = await verifySignedMessage({
    message: await Bun.file(path.join(directory, filename)).bytes(),
    publicKey: BUDDY_MINISIGN_PUBLIC_KEY,
    signatureFileText: await Bun.file(path.join(directory, `${filename}.sig`)).text(),
  })
  if (!verified) throw new Error(`Signature verification failed: ${filename}`)
}

function parseUpdateManifest(directory: string, filename: string): Promise<UpdateManifest> {
  return Bun.file(path.join(directory, filename))
    .text()
    .then((content) =>
      updateManifestSchema.parse(
        filename.endsWith(".json") ? JSON.parse(content) : Bun.YAML.parse(content),
      ),
    )
}

async function verifySelectedUpdateManifest(input: {
  artifactName: string
  directory: string
  manifestName: string
  repo: string
  tag: string
  version: string
}): Promise<void> {
  await verifySignedFile(input.directory, input.manifestName)
  const manifest = await parseUpdateManifest(input.directory, input.manifestName)
  if (manifest.version !== input.version) {
    throw new Error(
      `${input.manifestName} version mismatch: expected ${input.version}, received ${manifest.version}`,
    )
  }
  const entry = manifest.files.find(
    (file) => path.basename(new URL(file.url).pathname) === input.artifactName,
  )
  if (!entry) throw new Error(`${input.manifestName} does not reference ${input.artifactName}`)
  const expectedUrl = `https://github.com/${input.repo}/releases/download/${input.tag}/${input.artifactName}`
  if (entry.url !== expectedUrl) {
    throw new Error(`${input.manifestName} contains an unexpected updater URL: ${entry.url}`)
  }
  const artifactPath = path.join(input.directory, input.artifactName)
  if (entry.size !== Bun.file(artifactPath).size) {
    throw new Error(`${input.manifestName} contains the wrong artifact size`)
  }
  if (entry.sha512 !== (await sha512File(artifactPath))) {
    throw new Error(`${input.manifestName} contains the wrong artifact SHA-512`)
  }
}

function assertManifestUsesReleaseRepository(
  manifest: UpdateManifest,
  manifestName: string,
  repository: string,
): void {
  const expectedPathPrefix = `/${repository}/releases/download/`
  for (const file of manifest.files) {
    const url = new URL(file.url)
    if (url.origin !== "https://github.com" || !url.pathname.startsWith(expectedPathPrefix)) {
      throw new Error(`${manifestName} contains an updater URL outside ${repository}: ${file.url}`)
    }
  }
}

async function verifyAdvancedMathChecksum(directory: string, archiveName: string): Promise<void> {
  const checksum = (await Bun.file(path.join(directory, `${archiveName}.sha256`)).text())
    .trim()
    .split(/\s+/u)[0]
  if (
    !checksum ||
    normalizeSha256Digest(checksum) !== (await sha256File(path.join(directory, archiveName)))
  ) {
    throw new Error(`Advanced math checksum mismatch: ${archiveName}`)
  }
}

function commandText(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: MAX_RELEASE_ARCHIVE_BUFFER_BYTES,
  })
  if (result.error) {
    throw new Error(`${command} ${args.join(" ")} failed to start: ${result.error.message}`, {
      cause: result.error,
    })
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr.trim()}`)
  }
  return result.stdout
}

async function extractZipEntry(
  archivePath: string,
  entryMatcher: (entry: string) => boolean,
  outputPath: string,
): Promise<void> {
  const entry = commandText("unzip", ["-Z1", archivePath]).split(/\r?\n/u).find(entryMatcher)
  if (!entry)
    throw new Error(`Could not locate required executable inside ${path.basename(archivePath)}`)
  const result = spawnSync("unzip", ["-p", archivePath, entry], {
    maxBuffer: MAX_RELEASE_ARCHIVE_BUFFER_BYTES,
  })
  if (result.error) {
    throw new Error(`Failed to extract ${entry}: ${result.error.message}`, { cause: result.error })
  }
  if (result.status !== 0) throw new Error(`Failed to extract ${entry}`)
  await writeFile(outputPath, result.stdout)
}

async function verifyMacOsBundleVersion(input: {
  archivePath: string
  directory: string
  version: string
}): Promise<void> {
  const plistPath = path.join(input.directory, `${path.basename(input.archivePath)}.Info.plist`)
  await extractZipEntry(
    input.archivePath,
    (entry) => entry.endsWith(".app/Contents/Info.plist"),
    plistPath,
  )
  const actualVersion = commandText("python3", [
    "-c",
    "import plistlib,sys; print(plistlib.load(open(sys.argv[1], 'rb')).get('CFBundleShortVersionString', ''))",
    plistPath,
  ]).trim()
  if (actualVersion !== input.version) {
    throw new Error(
      `${path.basename(input.archivePath)} bundle version mismatch: expected ${input.version}, received ${actualVersion || "empty"}`,
    )
  }
}

async function verifyMachOArchitecture(input: {
  archivePath: string
  architecture: "arm64" | "x86_64"
  directory: string
  entryMatcher: (entry: string) => boolean
}): Promise<void> {
  const executablePath = path.join(
    input.directory,
    `${path.basename(input.archivePath)}.executable`,
  )
  await extractZipEntry(input.archivePath, input.entryMatcher, executablePath)
  const description = commandText("file", [executablePath])
  if (!description.includes("Mach-O") || !description.includes(input.architecture)) {
    throw new Error(
      `${path.basename(input.archivePath)} architecture mismatch: expected ${input.architecture}, received ${description.trim()}`,
    )
  }
}

function verifyWindowsArchitecture(executablePath: string): void {
  const description = commandText("file", [executablePath])
  if (!description.includes("PE32+") || !description.includes("x86-64")) {
    throw new Error(
      `${path.basename(executablePath)} architecture mismatch: expected Windows x86-64, received ${description.trim()}`,
    )
  }
}

async function verifyProvenance(input: {
  arguments: VerifyArguments
  assets: readonly GithubReleaseAsset[]
  directory: string
}): Promise<{ advancedMathVersion: string; planDigest: string; sourceSha: string }> {
  const plan = parseReleasePlan(
    JSON.parse(await Bun.file(path.join(input.directory, RELEASE_PLAN_FILENAME)).text()),
  )
  const planDigest = releasePlanDigest(plan)
  const source = parseReleaseSourceMetadata(
    JSON.parse(await Bun.file(path.join(input.directory, RELEASE_SOURCE_METADATA_FILENAME)).text()),
  )
  const expectedTargets = {
    macosArm64: input.arguments.targets.macosArm64,
    macosX64: input.arguments.targets.macosX64,
    windowsX64: input.arguments.targets.windowsX64,
  }
  if (
    plan.tag !== input.arguments.tag ||
    plan.version !== releaseVersionFromTag(input.arguments.tag) ||
    JSON.stringify(plan.targets) !== JSON.stringify(expectedTargets)
  ) {
    throw new Error("Release plan does not match the requested release inventory")
  }
  if (
    source.sourceRepository !== plan.sourceRepository ||
    source.sourceSha !== plan.sourceSha ||
    (input.arguments.sourceSha && input.arguments.sourceSha !== plan.sourceSha) ||
    (input.arguments.planDigest && input.arguments.planDigest !== planDigest)
  ) {
    throw new Error("Release provenance does not match the immutable plan")
  }

  const currentDigests = input.assets.map(githubAssetDigest)
  for (const target of checkpointTargets(input.arguments.targets)) {
    const checkpoint = parseReleaseCheckpoint(
      JSON.parse(
        await Bun.file(path.join(input.directory, releaseCheckpointFilename(target))).text(),
      ),
    )
    assertCheckpointMatches({
      checkpoint,
      currentAssets: currentDigests,
      expectedAssetNames: expectedCheckpointAssetNames(
        target,
        plan.version,
        plan.advancedMathVersion,
      ),
      identity: {
        planDigest,
        schemaVersion: RELEASE_CHECKPOINT_SCHEMA_VERSION,
        sourceSha: plan.sourceSha,
        target,
        version: plan.version,
      },
    })
  }

  if (!input.arguments.draft) {
    const freeze = parseReleaseFreeze(
      JSON.parse(await Bun.file(path.join(input.directory, RELEASE_FREEZE_FILENAME)).text()),
    )
    if (
      freeze.planDigest !== planDigest ||
      freeze.sourceRepository !== plan.sourceRepository ||
      freeze.sourceSha !== plan.sourceSha ||
      freeze.tag !== plan.tag ||
      freeze.version !== plan.version
    ) {
      throw new Error("Published release freeze does not match the immutable plan")
    }
    assertAssetDigestSet({
      actual: input.assets
        .filter((asset) => asset.name !== RELEASE_FREEZE_FILENAME)
        .map(githubAssetDigest),
      expected: freeze.assets,
      label: `Published release ${input.arguments.tag}`,
    })
    const sourceTag = await resolveGithubSourceTag({
      repository: plan.sourceRepository,
      tag: plan.tag,
    })
    if (sourceTag?.type !== "commit" || sourceTag.sha !== plan.sourceSha) {
      throw new Error(
        `Source tag ${plan.sourceRepository}@${plan.tag} does not resolve to ${plan.sourceSha}`,
      )
    }
  }

  return { advancedMathVersion: plan.advancedMathVersion, planDigest, sourceSha: plan.sourceSha }
}

async function assertPubliclyReachable(url: string, label: string): Promise<void> {
  for (let attempt = 1; attempt <= PUBLIC_VERIFICATION_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, { headers: { Range: "bytes=0-0" } })
    await response.body?.cancel()
    if (response.ok) return
    if (attempt === PUBLIC_VERIFICATION_ATTEMPTS) {
      throw new Error(`Published release asset is not reachable: ${label} (${response.status})`)
    }
    await Bun.sleep(PUBLIC_VERIFICATION_RETRY_DELAY_MS)
  }
}

async function assertOmittedManifestUsesNewestPublishedFeed(input: {
  currentTag: string
  manifest: UpdateManifest
  manifestName: string
  repository: string
}): Promise<void> {
  const previous = await readNewestPublishedReleaseWithAssets({
    currentTag: input.currentTag,
    repository: input.repository,
    requiredAssetNames: [input.manifestName, `${input.manifestName}.sig`],
  })
  if (!previous) return
  const expectedPathSegment = `/releases/download/${previous.tag}/`
  if (
    input.manifest.files.some((file) => !new URL(file.url).pathname.includes(expectedPathSegment))
  ) {
    throw new Error(
      `${input.manifestName} does not carry forward newest compatible feed ${previous.tag}`,
    )
  }
}

async function main(): Promise<void> {
  const options = parseArgs()
  const allAssets = await readGithubReleaseAssets(options.repo, options.tag)
  const requiredAssets = requiredAssetsForRelease(options).map((required) =>
    findAsset(allAssets, required),
  )
  assertExactReleaseInventory(allAssets, requiredAssets)
  const ownsDirectory = !options.assetDirectory
  const directory =
    options.assetDirectory || (await mkdtemp(path.join(os.tmpdir(), VERIFICATION_DIRECTORY_PREFIX)))

  try {
    await downloadAssets({
      assets: requiredAssets,
      directory,
      repo: options.repo,
      tag: options.tag,
    })
    await verifyDownloadedDigests(requiredAssets, directory)
    const { advancedMathVersion, sourceSha } = await verifyProvenance({
      arguments: options,
      assets: allAssets,
      directory,
    })
    const version = releaseVersionFromTag(options.tag)

    await Promise.all([
      verifySignedFile(directory, "recovery-policy.json"),
      verifySignedFile(directory, resolveMacOsUpdateManifestFilename("arm64")),
      verifySignedFile(directory, resolveMacOsUpdateManifestFilename("x64")),
      verifySignedFile(directory, resolveWindowsUpdateManifestFilename("x64")),
    ])

    const manifestReferencedUrls: string[] = []
    for (const { manifestName, selected } of [
      {
        manifestName: resolveMacOsUpdateManifestFilename("arm64"),
        selected: options.targets.macosArm64,
      },
      {
        manifestName: resolveMacOsUpdateManifestFilename("x64"),
        selected: options.targets.macosX64,
      },
      {
        manifestName: resolveWindowsUpdateManifestFilename("x64"),
        selected: options.targets.windowsX64,
      },
    ]) {
      const manifest = await parseUpdateManifest(directory, manifestName)
      assertManifestUsesReleaseRepository(manifest, manifestName, options.repo)
      if (!selected) {
        await assertOmittedManifestUsesNewestPublishedFeed({
          currentTag: options.tag,
          manifest,
          manifestName,
          repository: options.repo,
        })
      }
      manifestReferencedUrls.push(...manifest.files.map((file) => file.url))
    }

    if (options.targets.macosArm64) {
      const archiveName = resolveMacOsReleaseArtifactFilename(version, "arm64", "zip")
      await verifySelectedUpdateManifest({
        artifactName: archiveName,
        directory,
        manifestName: resolveMacOsUpdateManifestFilename("arm64"),
        repo: options.repo,
        tag: options.tag,
        version,
      })
      await verifyMachOArchitecture({
        architecture: "arm64",
        archivePath: path.join(directory, archiveName),
        directory,
        entryMatcher: (entry) => /\.app\/Contents\/MacOS\/[^/]+$/u.test(entry),
      })
      await verifyMacOsBundleVersion({
        archivePath: path.join(directory, archiveName),
        directory,
        version,
      })
    }
    if (options.targets.macosX64) {
      const archiveName = resolveMacOsReleaseArtifactFilename(version, "x64", "zip")
      await verifySelectedUpdateManifest({
        artifactName: archiveName,
        directory,
        manifestName: resolveMacOsUpdateManifestFilename("x64"),
        repo: options.repo,
        tag: options.tag,
        version,
      })
      await verifyMachOArchitecture({
        architecture: "x86_64",
        archivePath: path.join(directory, archiveName),
        directory,
        entryMatcher: (entry) => /\.app\/Contents\/MacOS\/[^/]+$/u.test(entry),
      })
      await verifyMacOsBundleVersion({
        archivePath: path.join(directory, archiveName),
        directory,
        version,
      })
    }
    if (options.targets.windowsX64) {
      const executableName = resolveWindowsReleaseArtifactFilename(version, "x64", "exe")
      await verifySelectedUpdateManifest({
        artifactName: executableName,
        directory,
        manifestName: resolveWindowsUpdateManifestFilename("x64"),
        repo: options.repo,
        tag: options.tag,
        version,
      })
      verifyWindowsArchitecture(path.join(directory, executableName))
    }

    for (const [target, architecture] of [
      ...(options.targets.macosArm64 ? ([["aarch64-apple-darwin", "arm64"]] as const) : []),
      ...(options.targets.macosX64 ? ([["x86_64-apple-darwin", "x86_64"]] as const) : []),
    ] as const) {
      const archiveName = `buddy-advanced-math-v${advancedMathVersion}-${target}.zip`
      await verifyAdvancedMathChecksum(directory, archiveName)
      await verifyMachOArchitecture({
        architecture,
        archivePath: path.join(directory, archiveName),
        directory,
        entryMatcher: (entry) => entry.endsWith("/buddy-advanced-math"),
      })
    }

    if (!options.draft) {
      const publicAssets = requiredAssets.map((asset) => ({
        label: asset.name,
        url: `https://github.com/${options.repo}/releases/download/${options.tag}/${asset.name}`,
      }))
      for (const url of new Set(manifestReferencedUrls)) {
        publicAssets.push({ label: url, url })
      }
      await Promise.all(
        publicAssets.map((asset) => assertPubliclyReachable(asset.url, asset.label)),
      )
    }

    console.log(
      `Deep-verified ${requiredAssets.length} ${options.draft ? "draft " : ""}release assets for ${options.repo}@${options.tag} from ${sourceSha}`,
    )
  } finally {
    if (ownsDirectory) await rm(directory, { force: true, recursive: true })
  }
}

await main()
