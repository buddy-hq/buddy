#!/usr/bin/env bun

import { $ } from "bun"
import path from "node:path"
import { createHash } from "node:crypto"
import { access, mkdir, readFile, stat } from "node:fs/promises"
import { resolveAllMacOsReleaseArchiveFilenames } from "../src/shared/release-asset-names"
import { resolveTauriSignerBinaryPath } from "./utils"

const LATEST_YML_DIR_ENV_KEY = "LATEST_YML_DIR"
const RELEASE_REPOSITORY_ENV_KEY = "GH_REPO"
const VERSION_ENV_KEY = "BUDDY_VERSION"
const ELECTRON_DIST_DIR_ENV_KEY = "ELECTRON_DIST_DIR"
const UPDATE_OUTPUT_DIR_ENV_KEY = "BUDDY_UPDATE_OUTPUT_DIR"
const UPDATE_ASSET_BASE_URL_ENV_KEY = "BUDDY_UPDATE_ASSET_BASE_URL"
const UPDATE_SKIP_UPLOAD_ENV_KEY = "BUDDY_UPDATE_SKIP_UPLOAD"
const TRUE_ENV_VALUE = "1"
const SHA512_HASH_ALGORITHM = "sha512"
const DEFAULT_OUTPUT_DIRECTORY = "/tmp"

const latestYmlDir = process.env[LATEST_YML_DIR_ENV_KEY]?.trim() || ""
const repo = process.env[RELEASE_REPOSITORY_ENV_KEY]?.trim() || ""
const version = process.env[VERSION_ENV_KEY]?.trim() || ""
if (!version) {
  throw new Error(`${VERSION_ENV_KEY} is required`)
}

const electronDistDir = process.env[ELECTRON_DIST_DIR_ENV_KEY]?.trim() || ""
const assetBaseUrl = process.env[UPDATE_ASSET_BASE_URL_ENV_KEY]?.trim() || ""
const skipUpload = process.env[UPDATE_SKIP_UPLOAD_ENV_KEY]?.trim() === TRUE_ENV_VALUE
const releaseVersion = version
const tag = `v${releaseVersion}`
const outputDirectory =
  process.env[UPDATE_OUTPUT_DIR_ENV_KEY]?.trim() ||
  process.env.RUNNER_TEMP ||
  DEFAULT_OUTPUT_DIRECTORY
const outputPath = path.join(outputDirectory, "latest-mac.json")

type FileEntry = {
  url: string
  sha512: string
  size: number
}

type LatestYml = {
  version: string
  files: FileEntry[]
}

function parse(content: string): LatestYml {
  const lines = content.split("\n")
  let parsedVersion = ""
  const files: FileEntry[] = []
  let current: Partial<FileEntry> | undefined

  const flush = () => {
    if (
      typeof current?.url === "string" &&
      typeof current.sha512 === "string" &&
      typeof current.size === "number"
    ) {
      files.push({
        url: current.url,
        sha512: current.sha512,
        size: current.size,
      })
    }

    current = undefined
  }

  for (const line of lines) {
    const indented = line.startsWith("    ") || line.startsWith("  -")

    if (line.startsWith("version:")) {
      parsedVersion = line.slice("version:".length).trim()
      continue
    }

    if (line.trim().startsWith("- url:")) {
      flush()
      current = { url: line.trim().slice("- url:".length).trim() }
      continue
    }

    if (indented && current && line.trim().startsWith("sha512:")) {
      current.sha512 = line.trim().slice("sha512:".length).trim()
      continue
    }

    if (indented && current && line.trim().startsWith("size:")) {
      current.size = Number(line.trim().slice("size:".length).trim())
      continue
    }

    if (!indented && current) {
      flush()
    }
  }

  flush()
  return {
    version: parsedVersion,
    files,
  }
}

async function fileExists(filepath: string) {
  try {
    await access(filepath)
    return true
  } catch {
    return false
  }
}

async function toFileEntry(filepath: string): Promise<FileEntry> {
  const [fileBuffer, fileStats] = await Promise.all([readFile(filepath), stat(filepath)])
  return {
    url: path.basename(filepath),
    sha512: createHash(SHA512_HASH_ALGORITHM).update(fileBuffer).digest("base64"),
    size: fileStats.size,
  }
}

async function synthesizeManifest() {
  if (!electronDistDir) {
    return undefined
  }

  const candidates = resolveAllMacOsReleaseArchiveFilenames(releaseVersion)
  const files: FileEntry[] = []

  for (const candidate of candidates) {
    const artifactPath = path.join(electronDistDir, candidate)
    if (!(await fileExists(artifactPath))) {
      continue
    }

    files.push(await toFileEntry(artifactPath))
  }

  if (files.length === 0) {
    return undefined
  }

  return {
    version: releaseVersion,
    files,
  }
}

async function readLatestMacYml() {
  if (!latestYmlDir) {
    return undefined
  }

  const candidates = [
    path.join(latestYmlDir, "latest-yml-aarch64-apple-darwin", "latest-mac.yml"),
    path.join(latestYmlDir, "latest-yml-x86_64-apple-darwin", "latest-mac.yml"),
  ]

  for (const candidate of candidates) {
    if (!(await fileExists(candidate))) {
      continue
    }

    return parse(await Bun.file(candidate).text())
  }

  return undefined
}

function resolveAssetUrl(filename: string) {
  if (assetBaseUrl) {
    return new URL(filename, ensureTrailingSlash(assetBaseUrl)).toString()
  }

  if (!repo) {
    throw new Error(
      `${RELEASE_REPOSITORY_ENV_KEY} is required when ${UPDATE_ASSET_BASE_URL_ENV_KEY} is not set`,
    )
  }

  return `https://github.com/${repo}/releases/download/${tag}/${filename}`
}

async function requireTauriSignerBinaryPath() {
  const binaryPath = resolveTauriSignerBinaryPath(process.env)
  try {
    await access(binaryPath)
  } catch {
    throw new Error(`Missing Tauri signer binary at ${binaryPath}`)
  }

  return binaryPath
}

function ensureTauriSigningKeyPresent() {
  const rawPrivateKey = process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()
  const privateKeyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH?.trim()

  if (rawPrivateKey || privateKeyPath) {
    return
  }

  throw new Error(
    "TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH is required for signed mac update manifests",
  )
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`
}

const latest = (await readLatestMacYml()) ?? (await synthesizeManifest())
if (!latest) {
  throw new Error("No macOS update artifacts available to build latest-mac.json")
}

const output = {
  version: latest.version,
  files: latest.files.map((file) => {
    return {
      url: resolveAssetUrl(file.url),
      sha512: file.sha512,
      size: file.size,
    }
  }),
}

await mkdir(outputDirectory, { recursive: true })
await Bun.write(outputPath, `${JSON.stringify(output, null, 2)}\n`)

ensureTauriSigningKeyPresent()
const tauriSigner = await requireTauriSignerBinaryPath()

await $`${tauriSigner} signer sign ${outputPath}`.env(resolveSignerEnvironment())

if (!skipUpload) {
  if (!repo) {
    throw new Error(`${RELEASE_REPOSITORY_ENV_KEY} is required when uploading signed manifests`)
  }

  await $`gh release upload ${tag} ${outputPath} ${`${outputPath}.sig`} --clobber --repo ${repo}`
}

console.log("finalized latest-mac.json")

function resolveSignerEnvironment() {
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
