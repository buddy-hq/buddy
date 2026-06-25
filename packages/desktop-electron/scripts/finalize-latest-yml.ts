#!/usr/bin/env bun

import { $ } from "bun"
import { createHash } from "node:crypto"
import { access, readFile, stat } from "node:fs/promises"
import path from "node:path"
import {
  resolveAllMacOsReleaseArchiveFilenames,
  resolveWindowsReleaseArtifactFilename,
} from "../src/shared/release-asset-names"
import { resolveTauriSignerBinaryPath } from "./utils"

const rawLatestYmlDir = process.env.LATEST_YML_DIR
if (!rawLatestYmlDir) {
  throw new Error("LATEST_YML_DIR is required")
}
const latestYmlDir = rawLatestYmlDir

const repo = process.env.GH_REPO
if (!repo) {
  throw new Error("GH_REPO is required")
}

const version = process.env.BUDDY_VERSION
if (!version) {
  throw new Error("BUDDY_VERSION is required")
}
const releaseVersion = version

const electronDistDir = process.env.ELECTRON_DIST_DIR?.trim() || ""
const SIGNED_MANIFEST_LABEL = "signed latest yml manifests"

type FileEntry = {
  url: string
  sha512: string
  size: number
  blockMapSize?: number
}

type LatestYml = {
  version: string
  files: FileEntry[]
  releaseDate: string
}

function parse(content: string): LatestYml {
  const lines = content.split("\n")
  let parsedVersion = ""
  let releaseDate = ""
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
        ...(typeof current.blockMapSize === "number" ? { blockMapSize: current.blockMapSize } : {}),
      })
    }
    current = undefined
  }

  for (const line of lines) {
    const indented = line.startsWith("    ") || line.startsWith("  -")
    if (line.startsWith("version:")) parsedVersion = line.slice("version:".length).trim()
    else if (line.startsWith("releaseDate:"))
      releaseDate = line.slice("releaseDate:".length).trim().replace(/^'|'$/g, "")
    else if (line.trim().startsWith("- url:")) {
      flush()
      current = { url: line.trim().slice("- url:".length).trim() }
    } else if (indented && current && line.trim().startsWith("sha512:")) {
      current.sha512 = line.trim().slice("sha512:".length).trim()
    } else if (indented && current && line.trim().startsWith("size:")) {
      current.size = Number(line.trim().slice("size:".length).trim())
    } else if (indented && current && line.trim().startsWith("blockMapSize:")) {
      current.blockMapSize = Number(line.trim().slice("blockMapSize:".length).trim())
    } else if (!indented && current) {
      flush()
    }
  }

  flush()
  return {
    version: parsedVersion,
    files,
    releaseDate,
  }
}

function serialize(data: LatestYml) {
  const lines = [`version: ${data.version}`, "files:"]
  for (const file of data.files) {
    lines.push(`  - url: ${file.url}`)
    lines.push(`    sha512: ${file.sha512}`)
    lines.push(`    size: ${file.size}`)
    if (file.blockMapSize) {
      lines.push(`    blockMapSize: ${file.blockMapSize}`)
    }
  }
  lines.push(`releaseDate: '${data.releaseDate}'`)
  return lines.join("\n") + "\n"
}

async function fileExists(filepath: string) {
  try {
    await access(filepath)
    return true
  } catch {
    return false
  }
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
    "TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH is required for signed latest yml manifests",
  )
}

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

async function toFileEntry(filepath: string): Promise<FileEntry> {
  const [fileBuffer, fileStats] = await Promise.all([readFile(filepath), stat(filepath)])
  const blockmapPath = `${filepath}.blockmap`
  const blockMapStats = (await fileExists(blockmapPath)) ? await stat(blockmapPath) : undefined
  return {
    url: path.basename(filepath),
    sha512: createHash("sha512").update(fileBuffer).digest("base64"),
    size: fileStats.size,
    ...(blockMapStats ? { blockMapSize: blockMapStats.size } : {}),
  }
}

async function synthesizeLatest(platform: "mac" | "windows") {
  if (!electronDistDir) return undefined

  const candidates =
    platform === "mac"
      ? resolveAllMacOsReleaseArchiveFilenames(releaseVersion)
      : [resolveWindowsReleaseArtifactFilename(releaseVersion, "x64", "exe")]

  const entries: FileEntry[] = []
  for (const candidate of candidates) {
    const artifactPath = path.join(electronDistDir, candidate)
    if (!(await fileExists(artifactPath))) continue
    entries.push(await toFileEntry(artifactPath))
  }

  if (entries.length === 0) return undefined
  return serialize({
    version: releaseVersion,
    files: entries,
    releaseDate: new Date().toISOString(),
  })
}

async function read(subdir: string, filename: string) {
  const file = Bun.file(path.join(latestYmlDir, subdir, filename))
  if (!(await file.exists())) return undefined
  return parse(await file.text())
}

const outputs: Record<string, string> = {}

const winX64 = await read("latest-yml-x86_64-pc-windows-msvc", "latest.yml")
const winArm64 = await read("latest-yml-aarch64-pc-windows-msvc", "latest.yml")
if (winX64 || winArm64) {
  const base = winArm64 ?? winX64
  if (base) {
    outputs["latest.yml"] = serialize({
      version: base.version,
      files: [...(winArm64?.files ?? []), ...(winX64?.files ?? [])],
      releaseDate: base.releaseDate,
    })
  }
}
if (!outputs["latest.yml"]) {
  const synthesizedWindows = await synthesizeLatest("windows")
  if (synthesizedWindows) {
    outputs["latest.yml"] = synthesizedWindows
  }
}

const macX64 = await read("latest-yml-x86_64-apple-darwin", "latest-mac.yml")
const macArm64 = await read("latest-yml-aarch64-apple-darwin", "latest-mac.yml")
if (macX64 || macArm64) {
  const base = macArm64 ?? macX64
  if (base) {
    outputs["latest-mac.yml"] = serialize({
      version: base.version,
      files: [...(macArm64?.files ?? []), ...(macX64?.files ?? [])],
      releaseDate: base.releaseDate,
    })
  }
}
if (!outputs["latest-mac.yml"]) {
  const synthesizedMac = await synthesizeLatest("mac")
  if (synthesizedMac) {
    outputs["latest-mac.yml"] = synthesizedMac
  }
}

const tag = `v${releaseVersion}`
const tmp = process.env.RUNNER_TEMP ?? "/tmp"
ensureTauriSigningKeyPresent()
const tauriSigner = await requireTauriSignerBinaryPath()
const signerEnvironment = resolveSignerEnvironment()

for (const [filename, content] of Object.entries(outputs)) {
  const filepath = path.join(tmp, filename)
  await Bun.write(filepath, content)
  await $`${tauriSigner} signer sign ${filepath}`.env(signerEnvironment)
  await $`gh release upload ${tag} ${filepath} ${`${filepath}.sig`} --clobber --repo ${repo}`
}

console.log(`finalized ${SIGNED_MANIFEST_LABEL}`)
