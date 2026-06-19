#!/usr/bin/env bun

import { $ } from "bun"
import path from "node:path"
import { Script } from "@buddy/script"
import {
  RELEASE_VERSION_GIT_FILES,
  stageReleaseVersionPackageFiles,
  updateReleaseVersionPackageFiles,
} from "./release-version-files"
import { releaseRepository } from "./release-repositories"

function currentRefType() {
  return process.env.GITHUB_REF_TYPE?.trim()
}

function currentBranch() {
  if (currentRefType() === "branch" && process.env.GITHUB_REF_NAME?.trim()) {
    return process.env.GITHUB_REF_NAME.trim()
  }

  return "main"
}

const ROOT_DIR = path.resolve(import.meta.dir, "..")

async function configureReleaseCommitter() {
  await $`git config user.name github-actions[bot]`.cwd(ROOT_DIR)
  await $`git config user.email 41898282+github-actions[bot]@users.noreply.github.com`.cwd(ROOT_DIR)
}

function parseStatusPaths(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.slice(3))
    .map((path) => {
      const renamed = path.split(" -> ")
      return renamed[renamed.length - 1] ?? path
    })
}

async function persistWorkflowDispatchReleaseVersion(tag: string) {
  const branch = currentBranch()

  if (branch !== "main") {
    throw new Error(`Stable releases must sync version files back to main, received '${branch}'`)
  }

  await configureReleaseCommitter()
  await $`git fetch origin ${branch} --tags`.cwd(ROOT_DIR)

  const releaseTarget = (
    process.env.GITHUB_SHA?.trim() ||
    (await $`git rev-parse HEAD`
      .cwd(ROOT_DIR)
      .text()
      .then((output) => output.trim()))
  ).trim()
  const remoteHead = await $`git rev-parse ${`origin/${branch}`}`
    .cwd(ROOT_DIR)
    .text()
    .then((output) => output.trim())

  if (remoteHead !== releaseTarget) {
    throw new Error(
      `Cannot sync release version to ${branch}: origin/${branch} advanced from ${releaseTarget} to ${remoteHead} while the release was building. Rerun the release from the new head.`,
    )
  }

  await $`git switch -c ${`release-sync-${tag}`}`.cwd(ROOT_DIR)
  await updateReleaseVersionPackageFiles(ROOT_DIR, Script.version)

  const dirtyPaths = parseStatusPaths(await $`git status --porcelain`.cwd(ROOT_DIR).text())
  const unexpectedDirtyPaths = dirtyPaths.filter(
    (path) =>
      !RELEASE_VERSION_GIT_FILES.includes(path as (typeof RELEASE_VERSION_GIT_FILES)[number]),
  )
  if (unexpectedDirtyPaths.length > 0) {
    throw new Error(
      `Publish job produced unexpected dirty files: ${unexpectedDirtyPaths.join(", ")}`,
    )
  }

  await stageReleaseVersionPackageFiles(ROOT_DIR)

  const staged = await $`git diff --cached --name-only`.cwd(ROOT_DIR).text()
  if (!staged.trim()) {
    console.log(
      `Release version files already match ${Script.version}; skipping repo version sync.`,
    )
    return
  }

  await $`git commit -m ${`chore(release): sync package versions to ${tag}`}`.cwd(ROOT_DIR)
  await $`git push origin ${`HEAD:refs/heads/${branch}`}`.cwd(ROOT_DIR)
}

if (!Script.release) {
  throw new Error("BUDDY_RELEASE must be set to publish a release")
}

const tag = `v${Script.version}`

if (currentRefType() !== "tag") {
  await persistWorkflowDispatchReleaseVersion(tag)
}

await $`gh release edit ${tag} --draft=false --repo ${releaseRepository()}`
