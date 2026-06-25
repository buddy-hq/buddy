#!/usr/bin/env bun

import { $ } from "bun"
import path from "node:path"
import { readdir } from "node:fs/promises"

const RELEASE_REPOSITORY_ENV_KEY = "BUDDY_RELEASE_REPO"
const RELEASE_TAG_ENV_KEY = "BUDDY_RELEASE_TAG"
const RELEASE_ASSET_DIR_ENV_KEY = "BUDDY_RELEASE_ASSET_DIR"
const RELEASE_ASSET_EXTENSIONS = new Set([".blockmap", ".dmg", ".exe", ".zip"])

async function collectReleaseAssets(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const assets = entries
    .filter((entry) => entry.isFile() && RELEASE_ASSET_EXTENSIONS.has(path.extname(entry.name)))
    .map((entry) => path.join(directory, entry.name))

  return assets.toSorted((left, right) => left.localeCompare(right))
}

const repo = process.env[RELEASE_REPOSITORY_ENV_KEY]?.trim() || ""
if (!repo) {
  throw new Error(`${RELEASE_REPOSITORY_ENV_KEY} is required`)
}

const tag = process.env[RELEASE_TAG_ENV_KEY]?.trim() || ""
if (!tag) {
  throw new Error(`${RELEASE_TAG_ENV_KEY} is required`)
}

const assetDirectory =
  process.env[RELEASE_ASSET_DIR_ENV_KEY]?.trim() || path.resolve(import.meta.dir, "..", "dist")
const assets = await collectReleaseAssets(assetDirectory)

if (assets.length === 0) {
  throw new Error(`No release assets found under ${assetDirectory}`)
}

await $`gh release upload ${tag} ${assets} --clobber --repo ${repo}`

console.log(`uploaded ${assets.length} release asset(s) from ${assetDirectory}`)
