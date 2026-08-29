#!/usr/bin/env bun

import { $ } from "bun"
import { Script } from "@buddy/script"
import { z } from "zod"
import { verifyReleaseFreeze } from "./release/freeze"
import { releaseRepository, sourceRepository } from "./release-repositories"

const releaseStateSchema = z.object({
  isDraft: z.boolean(),
  isPrerelease: z.boolean(),
  tagName: z.string(),
})

function requiredEnvironmentValue(key: string): string {
  const value = process.env[key]?.trim()
  if (!value) throw new Error(`${key} is required`)
  return value
}

async function readReleaseState(repository: string, tag: string) {
  const value =
    await $`gh release view ${tag} --repo ${repository} --json isDraft,isPrerelease,tagName`
      .quiet()
      .json()
  return releaseStateSchema.parse(value)
}

if (!Script.release) {
  throw new Error("BUDDY_RELEASE must be set to publish a release")
}

const tag = `v${Script.version}`
const releaseTarget = requiredEnvironmentValue("BUDDY_RELEASE_SOURCE_SHA").toLowerCase()
if (!/^[0-9a-f]{40}$/u.test(releaseTarget)) {
  throw new Error("BUDDY_RELEASE_SOURCE_SHA must be a full 40-character Git commit SHA")
}

const releaseRepo = releaseRepository()
const sourceRepo = sourceRepository()
let release = await readReleaseState(releaseRepo, tag)
if (release.tagName !== tag) {
  throw new Error(`Release tag mismatch: expected ${tag}, received ${release.tagName}`)
}
if (!release.isDraft && !release.isPrerelease) {
  throw new Error(`Release ${tag} is already stable and cannot be republished`)
}

const freeze = await verifyReleaseFreeze({
  directory: requiredEnvironmentValue("RUNNER_TEMP"),
  repository: releaseRepo,
  tag,
})
if (
  freeze.planDigest !== requiredEnvironmentValue("BUDDY_RELEASE_PLAN_DIGEST") ||
  freeze.sourceRepository !== sourceRepo ||
  freeze.sourceSha !== releaseTarget ||
  freeze.tag !== tag ||
  freeze.version !== Script.version
) {
  throw new Error(`Release freeze identity does not match ${releaseRepo}@${tag}`)
}

if (release.isDraft) {
  await $`gh release edit ${tag} --draft=false --prerelease --latest=false --repo ${releaseRepo}`
  release = await readReleaseState(releaseRepo, tag)
}
if (release.isDraft || !release.isPrerelease) {
  throw new Error(
    `Expected ${releaseRepo}@${tag} to be a published Preview prerelease, got draft=${release.isDraft} prerelease=${release.isPrerelease}`,
  )
}

console.log(`Published Preview ${releaseRepo}@${tag} from ${sourceRepo}@${releaseTarget}`)
