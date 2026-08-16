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
import { publishWithSourceTag } from "./release-source-tag"

const RELEASE_DRAFT_VALUE = "true"
const RELEASE_PUBLISHED_VALUE = "false"

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

async function releaseTargetSha(): Promise<string> {
  const target = process.env.GITHUB_SHA?.trim() || "HEAD"
  return $`git rev-parse ${`${target}^{commit}`}`
    .cwd(ROOT_DIR)
    .text()
    .then((output) => output.trim())
}

async function isReleasePublished(tag: string, repository: string): Promise<boolean> {
  const isDraft = await $`gh release view ${tag} --json isDraft --jq .isDraft --repo ${repository}`
    .text()
    .then((output) => output.trim())

  if (isDraft === RELEASE_PUBLISHED_VALUE) return true
  if (isDraft === RELEASE_DRAFT_VALUE) return false
  throw new Error(`Unexpected draft state for release ${tag}: ${isDraft || "empty"}`)
}

async function persistWorkflowDispatchReleaseVersion(tag: string, releaseTarget: string) {
  const branch = currentBranch()

  if (branch !== "main") {
    throw new Error(
      `Preview release candidates must sync version files back to main, received '${branch}'`,
    )
  }

  await configureReleaseCommitter()
  await $`git fetch origin ${branch} --tags`.cwd(ROOT_DIR)

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
    (path) => !RELEASE_VERSION_GIT_FILES.some((releasePath) => releasePath === path),
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
const releaseTarget = await releaseTargetSha()
const releaseRepo = releaseRepository()

if (currentRefType() !== "tag") {
  await persistWorkflowDispatchReleaseVersion(tag, releaseTarget)
}

await publishWithSourceTag(
  {
    rootDir: ROOT_DIR,
    tag,
    target: releaseTarget,
  },
  {
    isPublished: () => isReleasePublished(tag, releaseRepo),
    publish: async () => {
      await $`gh release edit ${tag} --draft=false --prerelease --repo ${releaseRepo}`
    },
  },
)
