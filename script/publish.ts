#!/usr/bin/env bun

import { $ } from "bun"
import path from "node:path"
import { Script } from "@buddy/script"
import {
  stageReleaseVersionPackageFiles,
  updateReleaseVersionPackageFiles,
} from "./release-version-files"

function releaseRepo() {
  return process.env.BUDDY_REPO || process.env.GITHUB_REPOSITORY || "prashantbhudwal/buddy"
}

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

async function persistWorkflowDispatchReleaseVersion(tag: string) {
  const branch = currentBranch()

  if (branch !== "main") {
    throw new Error(`Stable releases must sync version files back to main, received '${branch}'`)
  }

  const dirty = await $`git status --porcelain`.cwd(ROOT_DIR).text()
  if (dirty.trim()) {
    throw new Error(
      "Publish job must start from a clean checkout before persisting release versions",
    )
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

await $`gh release edit ${tag} --draft=false --repo ${releaseRepo()}`
