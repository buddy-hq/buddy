#!/usr/bin/env bun

import { $ } from "bun"
import { access, mkdir } from "node:fs/promises"
import path from "node:path"
import {
  resolveMacOsReleaseArtifactFilename,
  resolveWindowsReleaseArtifactFilename,
} from "../src/shared/release-asset-names"

const RELEASE_REPOSITORY_ENV_KEY = "BUDDY_RELEASE_REPO"
const RELEASE_TAG_ENV_KEY = "BUDDY_RELEASE_TAG"
const VERSION_ENV_KEY = "BUDDY_VERSION"
const ELECTRON_DIST_DIR_ENV_KEY = "ELECTRON_DIST_DIR"
const MACOS_ARM64_TARGET_ENV_KEY = "BUDDY_RELEASE_TARGET_MACOS_ARM64"
const MACOS_X64_TARGET_ENV_KEY = "BUDDY_RELEASE_TARGET_MACOS_X64"
const WINDOWS_X64_TARGET_ENV_KEY = "BUDDY_RELEASE_TARGET_WINDOWS_X64"

const repo = process.env[RELEASE_REPOSITORY_ENV_KEY]?.trim()
if (!repo) {
  throw new Error(`${RELEASE_REPOSITORY_ENV_KEY} is required`)
}

const tag = process.env[RELEASE_TAG_ENV_KEY]?.trim()
if (!tag) {
  throw new Error(`${RELEASE_TAG_ENV_KEY} is required`)
}

const version = process.env[VERSION_ENV_KEY]?.trim()
if (!version) {
  throw new Error(`${VERSION_ENV_KEY} is required`)
}

const outputDirectory =
  process.env[ELECTRON_DIST_DIR_ENV_KEY]?.trim() || path.resolve(import.meta.dir, "..", "dist")

const updateArchives = [
  ...(readRequiredBooleanEnvironmentVariable(MACOS_ARM64_TARGET_ENV_KEY)
    ? [resolveMacOsReleaseArtifactFilename(version, "arm64", "zip")]
    : []),
  ...(readRequiredBooleanEnvironmentVariable(MACOS_X64_TARGET_ENV_KEY)
    ? [resolveMacOsReleaseArtifactFilename(version, "x64", "zip")]
    : []),
  ...(readRequiredBooleanEnvironmentVariable(WINDOWS_X64_TARGET_ENV_KEY)
    ? [resolveWindowsReleaseArtifactFilename(version, "x64", "exe")]
    : []),
]

if (updateArchives.length === 0) {
  throw new Error("At least one release target must be selected")
}

const updateAssets = updateArchives.flatMap((filename) => [filename, `${filename}.blockmap`])

async function assertFileExists(filepath: string): Promise<void> {
  try {
    await access(filepath)
  } catch {
    throw new Error(`Release update asset download did not produce ${filepath}`)
  }
}

await mkdir(outputDirectory, { recursive: true })

await $`gh release download ${tag} --repo ${repo} --dir ${outputDirectory} ${updateAssets.flatMap((asset) => ["--pattern", asset])}`
for (const asset of updateAssets) {
  await assertFileExists(path.join(outputDirectory, asset))
}

console.log(`downloaded ${updateAssets.length} release update asset(s) to ${outputDirectory}`)

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
