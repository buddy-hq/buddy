#!/usr/bin/env bun

import { $ } from "bun"
import path from "node:path"
import { Script } from "@buddy/script"
import {
  stageReleaseVersionPackageFiles,
  updateReleaseVersionPackageFiles,
} from "./release-version-files"

const ROOT_DIR = path.resolve(import.meta.dir, "..")

async function currentBranch() {
  if (process.env.GITHUB_REF_TYPE === "branch" && process.env.GITHUB_REF_NAME?.trim()) {
    return process.env.GITHUB_REF_NAME.trim()
  }

  return $`git branch --show-current`
    .cwd(ROOT_DIR)
    .text()
    .then((output) => output.trim())
}

const branch = await currentBranch()

if (branch !== "main") {
  throw new Error(`Release tags must be created from main, received '${branch || "detached"}'`)
}

const dirty = await $`git status --porcelain`.cwd(ROOT_DIR).text()

if (dirty.trim()) {
  throw new Error("Working tree must be clean before creating a release tag")
}

await updateReleaseVersionPackageFiles(ROOT_DIR, Script.version)
await stageReleaseVersionPackageFiles(ROOT_DIR)

const staged = await $`git diff --cached --name-only`.cwd(ROOT_DIR).text()
if (!staged.trim()) {
  throw new Error(`No version changes staged for release ${Script.version}`)
}

const tag = `v${Script.version}`
const existingTag = await $`git rev-parse -q --verify refs/tags/${tag}`
  .cwd(ROOT_DIR)
  .quiet()
  .nothrow()

if (existingTag.exitCode === 0) {
  throw new Error(`Tag ${tag} already exists`)
}

await $`git commit -m ${`release: ${tag}`}`.cwd(ROOT_DIR)
await $`git tag ${tag}`.cwd(ROOT_DIR)

console.log(`Created local release commit and tag ${tag}`)
console.log(`Next:`)
console.log(`  git push origin ${branch}`)
console.log(`  git push origin ${tag}`)
