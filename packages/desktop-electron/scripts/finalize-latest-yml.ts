#!/usr/bin/env bun

import { $ } from "bun"
import path from "node:path"

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

const tag = `v${version}`
const tmp = process.env.RUNNER_TEMP ?? "/tmp"

for (const [filename, content] of Object.entries(outputs)) {
  const filepath = path.join(tmp, filename)
  await Bun.write(filepath, content)
  await $`gh release upload ${tag} ${filepath} --clobber --repo ${repo}`
}

console.log("finalized latest yml files")
