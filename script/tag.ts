#!/usr/bin/env bun

import { $ } from "bun"
import path from "node:path"
import { Script } from "@buddy/script"

const ROOT_DIR = path.resolve(import.meta.dir, "..")
const PACKAGE_FILES = [
  "packages/desktop/package.json",
  "packages/buddy/package.json",
  "packages/web/package.json",
  "packages/ui/package.json",
  "packages/sdk/package.json",
  "packages/opencode-adapter/package.json",
]

async function currentBranch() {
  if (process.env.GITHUB_REF_TYPE === "branch" && process.env.GITHUB_REF_NAME?.trim()) {
    return process.env.GITHUB_REF_NAME.trim()
  }

  return $`git branch --show-current`.cwd(ROOT_DIR).text().then((output) => output.trim())
}

const branch = await currentBranch()

if (branch !== "main") {
  throw new Error(`Release tags must be created from main, received '${branch || "detached"}'`)
}

const dirty = await $`git status --porcelain`.cwd(ROOT_DIR).text()

if (dirty.trim()) {
  throw new Error("Working tree must be clean before creating a release tag")
}

for (const relativePath of PACKAGE_FILES) {
  const target = path.join(ROOT_DIR, relativePath)
  const pkg = await Bun.file(target).json() as {
    version: string
  }
  pkg.version = Script.version
  await Bun.write(target, `${JSON.stringify(pkg, null, 2)}\n`)
}

for (const relativePath of PACKAGE_FILES) {
  await $`git add ${relativePath}`.cwd(ROOT_DIR)
}

const staged = await $`git diff --cached --name-only`.cwd(ROOT_DIR).text()
if (!staged.trim()) {
  throw new Error(`No version changes staged for release ${Script.version}`)
}

const tag = `v${Script.version}`
const existingTag = await $`git rev-parse -q --verify refs/tags/${tag}`.cwd(ROOT_DIR).quiet().nothrow()

if (existingTag.exitCode === 0) {
  throw new Error(`Tag ${tag} already exists`)
}

await $`git commit -m ${`release: ${tag}`}`.cwd(ROOT_DIR)
await $`git tag ${tag}`.cwd(ROOT_DIR)

console.log(`Created local release commit and tag ${tag}`)
console.log(`Next:`)
console.log(`  git push origin ${branch}`)
console.log(`  git push origin ${tag}`)
