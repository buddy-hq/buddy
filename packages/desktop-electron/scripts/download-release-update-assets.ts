#!/usr/bin/env bun

import { $ } from "bun"
import { access, mkdir } from "node:fs/promises"
import path from "node:path"
import {
  resolveAllMacOsReleaseArchiveFilenames,
  resolveWindowsReleaseArtifactFilename,
} from "../src/shared/release-asset-names"

const RELEASE_REPOSITORY_ENV_KEY = "BUDDY_RELEASE_REPO"
const RELEASE_TAG_ENV_KEY = "BUDDY_RELEASE_TAG"
const VERSION_ENV_KEY = "BUDDY_VERSION"
const ELECTRON_DIST_DIR_ENV_KEY = "ELECTRON_DIST_DIR"

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
  process.env[ELECTRON_DIST_DIR_ENV_KEY]?.trim() ||
  path.resolve(import.meta.dir, "..", "dist")

const updateAssets = [
  ...resolveAllMacOsReleaseArchiveFilenames(version),
  resolveWindowsReleaseArtifactFilename(version, "x64", "exe"),
].flatMap((filename) => [filename, `${filename}.blockmap`])

async function assertFileExists(filepath: string): Promise<void> {
  try {
    await access(filepath)
  } catch {
    throw new Error(`Release update asset download did not produce ${filepath}`)
  }
}

await mkdir(outputDirectory, { recursive: true })

for (const asset of updateAssets) {
  await $`gh release download ${tag} --repo ${repo} --dir ${outputDirectory} --pattern ${asset}`
  await assertFileExists(path.join(outputDirectory, asset))
}

console.log(`downloaded ${updateAssets.length} release update asset(s) to ${outputDirectory}`)
