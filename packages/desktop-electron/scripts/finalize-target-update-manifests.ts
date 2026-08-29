#!/usr/bin/env bun

import { $ } from "bun"
import { createHash } from "node:crypto"
import { access, mkdir, readFile, rm, stat } from "node:fs/promises"
import path from "node:path"
import {
  resolveMacOsReleaseArtifactFilename,
  resolveMacOsUpdateManifestFilename,
  resolveWindowsReleaseArtifactFilename,
  resolveWindowsUpdateManifestFilename,
  type MacOsReleaseArch,
  type WindowsReleaseArch,
} from "../src/shared/release-asset-names"
import {
  parseTJsonObject,
  parseTNumber,
  parseTString,
  parseWithSchema,
} from "../src/shared/parse-external"
import { resolveTauriSignerBinaryPath } from "./utils"
import { z } from "zod"
import { uploadReleaseAssetSafely } from "../../../script/release/assets"
import { readNewestPublishedReleaseWithAssets } from "../../../script/release/published-manifest"

const RELEASE_REPOSITORY_ENV_KEY = "BUDDY_RELEASE_REPO"
const LEGACY_RELEASE_REPOSITORY_ENV_KEY = "GH_REPO"
const RELEASE_TAG_ENV_KEY = "BUDDY_RELEASE_TAG"
const VERSION_ENV_KEY = "BUDDY_VERSION"
const RELEASE_DATE_ENV_KEY = "BUDDY_RELEASE_DATE"
const ELECTRON_DIST_DIR_ENV_KEY = "ELECTRON_DIST_DIR"
const UPDATE_OUTPUT_DIR_ENV_KEY = "BUDDY_UPDATE_OUTPUT_DIR"
const MACOS_ARM64_TARGET_ENV_KEY = "BUDDY_RELEASE_TARGET_MACOS_ARM64"
const MACOS_X64_TARGET_ENV_KEY = "BUDDY_RELEASE_TARGET_MACOS_X64"
const WINDOWS_X64_TARGET_ENV_KEY = "BUDDY_RELEASE_TARGET_WINDOWS_X64"
const DRY_RUN_ENV_KEY = "BUDDY_RELEASE_DRY_RUN"
const CHECK_ONLY_ENV_KEY = "BUDDY_RELEASE_CHECK_ONLY"
const SELECTED_TARGETS_ONLY_ENV_KEY = "BUDDY_RELEASE_SELECTED_TARGETS_ONLY"
const TRUE_ENV_VALUE = "1"
const GITHUB_RELEASE_SEARCH_LIMIT = 100
const SHA512_HASH_ALGORITHM = "sha512"
const DEFAULT_OUTPUT_DIRECTORY = "/tmp"
const LEGACY_MACOS_MANIFEST_FILENAME = "latest-mac.json"
const LEGACY_WINDOWS_MANIFEST_FILENAME = "latest.yml"

type FileEntry = {
  blockMapSize?: number
  sha512: string
  size: number
  url: string
}

type MacOsUpdateManifest = {
  files: FileEntry[]
  version: string
}

type WindowsUpdateManifest = {
  files: FileEntry[]
  releaseDate: string
  version: string
}

const githubReleaseSchema = z.object({
  publishedAt: z.string(),
  tagName: z.string(),
})

const fileEntrySchema = z.object({
  blockMapSize: z.number().optional(),
  sha512: z.string(),
  size: z.number(),
  url: z.string(),
})

type MacOsTarget = {
  arch: MacOsReleaseArch
  artifactFilename: string
  manifestFilename: string
  platform: "macos"
  selected: boolean
}

type WindowsTarget = {
  arch: WindowsReleaseArch
  artifactFilename: string
  manifestFilename: string
  platform: "windows"
  selected: boolean
}

type ReleaseTarget = MacOsTarget | WindowsTarget

const repo =
  process.env[RELEASE_REPOSITORY_ENV_KEY]?.trim() ||
  process.env[LEGACY_RELEASE_REPOSITORY_ENV_KEY]?.trim() ||
  ""
if (!repo) {
  throw new Error(`${RELEASE_REPOSITORY_ENV_KEY} is required`)
}

const tag = process.env[RELEASE_TAG_ENV_KEY]?.trim() || ""
if (!tag) {
  throw new Error(`${RELEASE_TAG_ENV_KEY} is required`)
}

const releaseVersion = process.env[VERSION_ENV_KEY]?.trim() || ""
if (!releaseVersion) {
  throw new Error(`${VERSION_ENV_KEY} is required`)
}
const releaseDate = process.env[RELEASE_DATE_ENV_KEY]?.trim() || ""

const checkOnly = process.env[CHECK_ONLY_ENV_KEY]?.trim() === TRUE_ENV_VALUE
const dryRun = process.env[DRY_RUN_ENV_KEY]?.trim() === TRUE_ENV_VALUE || checkOnly
const selectedTargetsOnly = process.env[SELECTED_TARGETS_ONLY_ENV_KEY]?.trim() === TRUE_ENV_VALUE
if (selectedTargetsOnly && !dryRun) {
  throw new Error(`${SELECTED_TARGETS_ONLY_ENV_KEY} requires ${DRY_RUN_ENV_KEY}`)
}
const electronDistDir =
  process.env[ELECTRON_DIST_DIR_ENV_KEY]?.trim() || path.resolve(import.meta.dir, "..", "dist")
const outputDirectory =
  process.env[UPDATE_OUTPUT_DIR_ENV_KEY]?.trim() ||
  process.env.RUNNER_TEMP ||
  DEFAULT_OUTPUT_DIRECTORY

const releaseTargets: readonly ReleaseTarget[] = [
  {
    arch: "arm64",
    artifactFilename: resolveMacOsReleaseArtifactFilename(releaseVersion, "arm64", "zip"),
    manifestFilename: resolveMacOsUpdateManifestFilename("arm64"),
    platform: "macos",
    selected: readRequiredBooleanEnvironmentVariable(MACOS_ARM64_TARGET_ENV_KEY),
  },
  {
    arch: "x64",
    artifactFilename: resolveMacOsReleaseArtifactFilename(releaseVersion, "x64", "zip"),
    manifestFilename: resolveMacOsUpdateManifestFilename("x64"),
    platform: "macos",
    selected: readRequiredBooleanEnvironmentVariable(MACOS_X64_TARGET_ENV_KEY),
  },
  {
    arch: "x64",
    artifactFilename: resolveWindowsReleaseArtifactFilename(releaseVersion, "x64", "exe"),
    manifestFilename: resolveWindowsUpdateManifestFilename("x64"),
    platform: "windows",
    selected: readRequiredBooleanEnvironmentVariable(WINDOWS_X64_TARGET_ENV_KEY),
  },
]

if (!releaseTargets.some((target) => target.selected)) {
  throw new Error("At least one release target must be selected")
}

await mkdir(outputDirectory, { recursive: true })

const signer = checkOnly
  ? undefined
  : {
      environment: resolveSignerEnvironment(),
      path: await requireTauriSignerBinaryPath(),
    }

for (const target of releaseTargets) {
  if (target.selected) {
    if (checkOnly) {
      console.log(`selected ${target.manifestFilename}: current artifact will be used`)
      continue
    }

    await writeSignedTargetManifest(target, signer)
    continue
  }

  if (selectedTargetsOnly) {
    console.log(`skipped omitted ${target.manifestFilename} during selected-target validation`)
    continue
  }

  await resolveOmittedTargetManifest(target, signer)
}

const action = checkOnly ? "validated" : dryRun ? "dry-ran" : "finalized"
console.log(`${action} ${releaseTargets.length} target update manifest(s) for ${repo}@${tag}`)

async function writeSignedTargetManifest(
  target: ReleaseTarget,
  signer: Signer | undefined,
): Promise<void> {
  if (!signer) {
    throw new Error("Signer is required when writing selected target manifests")
  }

  const manifestPath = path.join(outputDirectory, target.manifestFilename)
  const content =
    target.platform === "macos"
      ? JSON.stringify(await buildMacOsUpdateManifest(target), null, 2) + "\n"
      : serializeWindowsUpdateManifest(await buildWindowsUpdateManifest(target))

  await Bun.write(manifestPath, content)
  await signManifest(manifestPath, signer)
  await maybeUploadManifestPair(manifestPath, target.manifestFilename)
}

async function buildMacOsUpdateManifest(target: MacOsTarget): Promise<MacOsUpdateManifest> {
  const artifactPath = path.join(electronDistDir, target.artifactFilename)
  const file = await readFileEntry(artifactPath)

  return {
    files: [
      {
        sha512: file.sha512,
        size: file.size,
        url: resolveReleaseAssetUrl(tag, target.artifactFilename),
      },
    ],
    version: releaseVersion,
  }
}

async function buildWindowsUpdateManifest(target: WindowsTarget): Promise<WindowsUpdateManifest> {
  if (!releaseDate) {
    throw new Error(`${RELEASE_DATE_ENV_KEY} is required for Windows update manifests`)
  }
  const artifactPath = path.join(electronDistDir, target.artifactFilename)
  const file = await readFileEntry(artifactPath)

  return {
    files: [
      {
        ...file,
        url: resolveReleaseAssetUrl(tag, target.artifactFilename),
      },
    ],
    releaseDate,
    version: releaseVersion,
  }
}

async function resolveOmittedTargetManifest(
  target: ReleaseTarget,
  signer: Signer | undefined,
): Promise<void> {
  const previousPublishedTag = await resolvePreviousPublishedTargetManifest(target)
  if (previousPublishedTag) {
    if (checkOnly) {
      console.log(`omitted ${target.manifestFilename}: previous per-target manifest exists`)
      return
    }

    await copyPreviousSignedTargetManifest(target, previousPublishedTag)
    return
  }

  const previousStableTag = await resolvePreviousStableReleaseTag()
  const bootstrapped =
    target.platform === "macos"
      ? await bootstrapMacOsManifest(target, previousStableTag)
      : await bootstrapWindowsManifest(target, previousStableTag)

  if (checkOnly) {
    console.log(`omitted ${target.manifestFilename}: legacy manifest can bootstrap`)
    return
  }

  if (!signer) {
    throw new Error("Signer is required when bootstrapping omitted target manifests")
  }

  const manifestPath = path.join(outputDirectory, target.manifestFilename)
  await Bun.write(manifestPath, bootstrapped)
  await signManifest(manifestPath, signer)
  await maybeUploadManifestPair(manifestPath, target.manifestFilename)
  console.log(`bootstrapped ${target.manifestFilename} from ${previousStableTag}`)
}

async function downloadPreviousTargetManifest(
  target: ReleaseTarget,
  previousTag: string,
): Promise<void> {
  const manifestPath = path.join(outputDirectory, target.manifestFilename)
  const signaturePath = path.join(outputDirectory, `${target.manifestFilename}.sig`)
  await Promise.all([rm(manifestPath, { force: true }), rm(signaturePath, { force: true })])
  await $`gh release download ${previousTag} --repo ${repo} --dir ${outputDirectory} --pattern ${target.manifestFilename} --pattern ${`${target.manifestFilename}.sig`}`.quiet()
  await Promise.all([assertFileExists(manifestPath), assertFileExists(signaturePath)])
}

async function copyPreviousSignedTargetManifest(
  target: ReleaseTarget,
  previousTag: string,
): Promise<void> {
  const manifestPath = path.join(outputDirectory, target.manifestFilename)
  const signaturePath = path.join(outputDirectory, `${target.manifestFilename}.sig`)
  await Promise.all([assertFileExists(manifestPath), assertFileExists(signaturePath)])
  await maybeUploadManifestPair(manifestPath, target.manifestFilename)
  console.log(`copied ${target.manifestFilename} forward from ${previousTag}`)
}

async function bootstrapMacOsManifest(target: MacOsTarget, previousTag: string): Promise<string> {
  const legacyPath = await requireReleaseAsset(previousTag, LEGACY_MACOS_MANIFEST_FILENAME)
  const legacyManifest = parseMacOsManifest(await Bun.file(legacyPath).text())
  const expectedArchive = resolveMacOsReleaseArtifactFilename(
    legacyManifest.version,
    target.arch,
    "zip",
  )
  const file = legacyManifest.files.find((entry) => basenameFromUrl(entry.url) === expectedArchive)
  if (!file) {
    throw new Error(
      `${LEGACY_MACOS_MANIFEST_FILENAME} in ${previousTag} does not contain ${expectedArchive}`,
    )
  }

  return `${JSON.stringify(
    {
      files: [
        {
          ...file,
          url: resolvePreviousReleaseAssetUrl(previousTag, file.url),
        },
      ],
      version: legacyManifest.version,
    } satisfies MacOsUpdateManifest,
    null,
    2,
  )}\n`
}

async function bootstrapWindowsManifest(
  target: WindowsTarget,
  previousTag: string,
): Promise<string> {
  if (!releaseDate) {
    throw new Error(`${RELEASE_DATE_ENV_KEY} is required for Windows update manifests`)
  }
  const legacyPath = await requireReleaseAsset(previousTag, LEGACY_WINDOWS_MANIFEST_FILENAME)
  const legacyManifest = parseWindowsManifest(await Bun.file(legacyPath).text())
  const expectedInstaller = resolveWindowsReleaseArtifactFilename(
    legacyManifest.version,
    target.arch,
    "exe",
  )
  const file = legacyManifest.files.find(
    (entry) => basenameFromUrl(entry.url) === expectedInstaller,
  )
  if (!file) {
    throw new Error(
      `${LEGACY_WINDOWS_MANIFEST_FILENAME} in ${previousTag} does not contain ${expectedInstaller}`,
    )
  }

  return serializeWindowsUpdateManifest({
    files: [
      {
        ...file,
        url: resolvePreviousReleaseAssetUrl(previousTag, file.url),
      },
    ],
    releaseDate: legacyManifest.releaseDate || releaseDate,
    version: legacyManifest.version,
  })
}

async function readFileEntry(filepath: string): Promise<Omit<FileEntry, "url">> {
  const [fileBuffer, fileStats] = await Promise.all([readFile(filepath), stat(filepath)])
  const blockmapPath = `${filepath}.blockmap`
  const blockMapStats = (await fileExists(blockmapPath)) ? await stat(blockmapPath) : undefined

  return Object.assign(
    {
      sha512: createHash(SHA512_HASH_ALGORITHM).update(fileBuffer).digest("base64"),
      size: fileStats.size,
    },
    blockMapStats ? { blockMapSize: blockMapStats.size } : undefined,
  )
}

function parseMacOsManifest(content: string): MacOsUpdateManifest {
  const parsed = parseTJsonObject(JSON.parse(content))
  if (parsed === undefined) {
    throw new Error("macOS legacy manifest was not an object")
  }

  const version = parseTString(parsed.version)
  const files = parsed.files
  if (version === undefined || !Array.isArray(files)) {
    throw new Error("macOS legacy manifest was missing version or files")
  }

  return {
    files: files.map(parseFileEntry),
    version,
  }
}

function parseWindowsManifest(content: string): WindowsUpdateManifest {
  const lines = content.split("\n")
  let version = ""
  let releaseDate = ""
  const files: FileEntry[] = []
  let current: Partial<FileEntry> | undefined

  const flush = () => {
    const url = parseTString(current?.url)
    const sha512 = parseTString(current?.sha512)
    const size = parseTNumber(current?.size)
    if (url !== undefined && sha512 !== undefined && size !== undefined) {
      const blockMapSize = parseTNumber(current?.blockMapSize)
      files.push(
        Object.assign(
          {
            url,
            sha512,
            size,
          },
          blockMapSize !== undefined ? { blockMapSize } : undefined,
        ),
      )
    }
    current = undefined
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const indented = line.startsWith("    ") || line.startsWith("  -")
    if (line.startsWith("version:")) version = cleanYamlScalar(line.slice("version:".length))
    else if (line.startsWith("releaseDate:"))
      releaseDate = cleanYamlScalar(line.slice("releaseDate:".length))
    else if (trimmed.startsWith("- url:")) {
      flush()
      current = { url: cleanYamlScalar(trimmed.slice("- url:".length)) }
    } else if (indented && current && trimmed.startsWith("sha512:")) {
      current.sha512 = cleanYamlScalar(trimmed.slice("sha512:".length))
    } else if (indented && current && trimmed.startsWith("size:")) {
      current.size = Number(cleanYamlScalar(trimmed.slice("size:".length)))
    } else if (indented && current && trimmed.startsWith("blockMapSize:")) {
      current.blockMapSize = Number(cleanYamlScalar(trimmed.slice("blockMapSize:".length)))
    } else if (!indented && current) {
      flush()
    }
  }

  flush()
  if (!version || files.length === 0) {
    throw new Error("Windows legacy manifest was missing version or files")
  }

  return {
    files,
    releaseDate,
    version,
  }
}

function parseFileEntry<TValue>(value: TValue): FileEntry {
  const record = parseTJsonObject(value)
  if (record === undefined) {
    throw new Error("Manifest file entry was not an object")
  }

  const parsed = parseWithSchema(fileEntrySchema, record)
  if (parsed === undefined) {
    throw new Error("Manifest file entry was missing url, sha512, or size")
  }

  return Object.assign(
    {
      sha512: parsed.sha512,
      size: parsed.size,
      url: parsed.url,
    },
    parsed.blockMapSize !== undefined ? { blockMapSize: parsed.blockMapSize } : undefined,
  )
}

function serializeWindowsUpdateManifest(data: WindowsUpdateManifest): string {
  const lines = [`version: ${data.version}`, "files:"]
  for (const file of data.files) {
    lines.push(`  - url: ${file.url}`)
    lines.push(`    sha512: ${file.sha512}`)
    lines.push(`    size: ${file.size}`)
    if (file.blockMapSize !== undefined) {
      lines.push(`    blockMapSize: ${file.blockMapSize}`)
    }
  }
  lines.push(`releaseDate: '${data.releaseDate}'`)
  return `${lines.join("\n")}\n`
}

async function resolvePreviousStableReleaseTag(): Promise<string> {
  const releasesJson =
    await $`gh release list --repo ${repo} --exclude-drafts --exclude-pre-releases --limit ${GITHUB_RELEASE_SEARCH_LIMIT} --json tagName,publishedAt`.text()
  const parsed: unknown = JSON.parse(releasesJson)
  const releases = parseGithubReleases(parsed)
    .filter((release) => release.tagName !== tag)
    .toSorted((left, right) => releasePublishedAtTime(left) - releasePublishedAtTime(right))

  const previous = releases[releases.length - 1]
  if (!previous) {
    throw new Error(
      `Cannot resolve omitted target manifests because ${repo} has no previous stable release`,
    )
  }

  return previous.tagName
}

async function resolvePreviousPublishedTargetManifest(
  target: ReleaseTarget,
): Promise<string | undefined> {
  const release = await readNewestPublishedReleaseWithAssets({
    currentTag: tag,
    repository: repo,
    requiredAssetNames: [target.manifestFilename, `${target.manifestFilename}.sig`],
  })
  if (!release) return undefined
  await downloadPreviousTargetManifest(target, release.tag)
  return release.tag
}

function parseGithubReleases<TValue>(value: TValue): { publishedAt: string; tagName: string }[] {
  if (!Array.isArray(value)) {
    throw new Error("GitHub release list response was not an array")
  }

  return value.map((item) => {
    const record = parseTJsonObject(item)
    if (record === undefined) {
      throw new Error("GitHub release entry was not an object")
    }

    const parsed = parseWithSchema(githubReleaseSchema, record)
    if (parsed === undefined) {
      throw new Error("GitHub release entry was missing tagName or publishedAt")
    }

    return {
      publishedAt: parsed.publishedAt,
      tagName: parsed.tagName,
    }
  })
}

function releasePublishedAtTime(release: { publishedAt: string }): number {
  const time = Date.parse(release.publishedAt)
  return Number.isNaN(time) ? 0 : time
}

async function requireReleaseAsset(releaseTag: string, filename: string): Promise<string> {
  const downloaded = await downloadReleaseAsset(releaseTag, filename)
  if (!downloaded) {
    throw new Error(`Missing ${filename} in ${repo}@${releaseTag}`)
  }

  return path.join(outputDirectory, filename)
}

async function downloadReleaseAsset(releaseTag: string, filename: string): Promise<boolean> {
  const outputPath = path.join(outputDirectory, filename)
  await rm(outputPath, { force: true })
  const result =
    await $`gh release download ${releaseTag} --repo ${repo} --dir ${outputDirectory} --pattern ${filename}`
      .quiet()
      .nothrow()
  return result.exitCode === 0 && (await fileExists(outputPath))
}

async function maybeUploadManifestPair(
  manifestPath: string,
  manifestFilename: string,
): Promise<void> {
  if (dryRun) {
    console.log(`dry run: wrote ${manifestFilename} without uploading`)
    return
  }

  await uploadReleaseAssetSafely({ filePath: manifestPath, repository: repo, tag })
  await uploadReleaseAssetSafely({ filePath: `${manifestPath}.sig`, repository: repo, tag })
  console.log(`uploaded ${manifestFilename}`)
}

type Signer = {
  environment: NodeJS.ProcessEnv
  path: string
}

async function signManifest(manifestPath: string, signer: Signer): Promise<void> {
  await $`${signer.path} signer sign ${manifestPath}`.env(signer.environment)
}

async function requireTauriSignerBinaryPath(): Promise<string> {
  ensureTauriSigningKeyPresent()

  const binaryPath = resolveTauriSignerBinaryPath(process.env)
  try {
    await access(binaryPath)
  } catch {
    throw new Error(`Missing Tauri signer binary at ${binaryPath}`)
  }

  return binaryPath
}

function ensureTauriSigningKeyPresent(): void {
  const rawPrivateKey = process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()
  const privateKeyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH?.trim()

  if (rawPrivateKey || privateKeyPath) {
    return
  }

  throw new Error(
    "TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH is required for signed target update manifests",
  )
}

function resolveSignerEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env }

  if (!environment.TAURI_SIGNING_PRIVATE_KEY_PATH?.trim()) {
    delete environment.TAURI_SIGNING_PRIVATE_KEY_PATH
  }

  if (!environment.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
    delete environment.TAURI_SIGNING_PRIVATE_KEY
  }

  if (!environment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD?.trim()) {
    delete environment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  }

  return environment
}

function resolveReleaseAssetUrl(releaseTag: string, filename: string): string {
  return `https://github.com/${repo}/releases/download/${releaseTag}/${filename}`
}

function resolvePreviousReleaseAssetUrl(releaseTag: string, value: string): string {
  if (isAbsoluteUrl(value)) {
    return value
  }

  return resolveReleaseAssetUrl(releaseTag, value)
}

function basenameFromUrl(value: string): string {
  if (!isAbsoluteUrl(value)) {
    return value
  }

  try {
    const parsed = new URL(value)
    const segments = parsed.pathname.split("/")
    return segments[segments.length - 1] ?? value
  } catch {
    return value
  }
}

function cleanYamlScalar(value: string): string {
  return value.trim().replace(/^['"]|['"]$/gu, "")
}

function isAbsoluteUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://")
}

async function fileExists(filepath: string): Promise<boolean> {
  try {
    await access(filepath)
    return true
  } catch {
    return false
  }
}

async function assertFileExists(filepath: string): Promise<void> {
  try {
    await access(filepath)
  } catch {
    throw new Error(`Expected release manifest file missing: ${filepath}`)
  }
}

function readRequiredBooleanEnvironmentVariable(name: string): boolean {
  const raw = process.env[name]?.trim()
  if (raw === "true" || raw === "1") {
    return true
  }

  if (raw === "false" || raw === "0") {
    return false
  }

  throw new Error(`${name} must be true or false`)
}
