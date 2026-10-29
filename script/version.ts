#!/usr/bin/env bun

import { $ } from "bun"
import { z } from "zod"
import {
  assertReleaseTagVersion,
  formatReleaseTag,
  readBetaReleaseBody,
} from "@buddy/script/release-stream"
import { Script } from "@buddy/script"
import { requireValidReleaseNotes } from "./release/notes"
import { releaseRepository, sourceRepository } from "./release-repositories"
import { appendGithubOutputs } from "./release/github-output"
import { assertReleaseBranch, releaseDistribution } from "./release/distribution-guard"
import { RELEASE_FREEZE_FILENAME } from "./release/freeze"
import { requireUpdaterPublicKey } from "@buddy/script/distribution"
import {
  assertBetaVersionMovesForward,
  highestPublishedBetaVersion,
} from "./release/beta-publication"

const distribution = releaseDistribution()
const releaseRepo = releaseRepository()
requireUpdaterPublicKey(distribution)

const DRY_RUN_ENV_KEY = "BUDDY_RELEASE_DRY_RUN"
const TRUE_ENV_VALUE = "1"
const DRY_RUN_RELEASE_ID = "dry-run"

type CreatedRelease = {
  databaseId: number | string
  isDraft?: boolean
  isPrerelease?: boolean
  tagName: string
}

const ExistingReleaseSchema = z.object({
  databaseId: z.number(),
  isDraft: z.boolean(),
  isPrerelease: z.boolean(),
  tagName: z.string(),
  body: z.string(),
})

async function currentBranch() {
  if (process.env.GITHUB_REF_NAME?.trim()) {
    return process.env.GITHUB_REF_NAME.trim()
  }

  return $`git branch --show-current`.text().then((output) => output.trim())
}

const dryRun = process.env[DRY_RUN_ENV_KEY]?.trim() === TRUE_ENV_VALUE
const branch = await currentBranch()
if (!dryRun) assertReleaseBranch(branch || "detached", distribution)
if (!process.env.BUDDY_VERSION?.trim()) {
  throw new Error(
    `${distribution.id === "beta" ? "Beta releases" : "Preview release candidates"} require an explicit BUDDY_VERSION`,
  )
}

const sourceRepo = sourceRepository()
const tag = formatReleaseTag(distribution, Script.version)
if (process.env.BUDDY_RELEASE_TAG?.trim()) {
  assertReleaseTagVersion(distribution, process.env.BUDDY_RELEASE_TAG.trim(), Script.version)
}

let release: CreatedRelease

if (dryRun) {
  release = {
    databaseId: DRY_RUN_RELEASE_ID,
    tagName: tag,
  }
} else {
  if (distribution.id === "beta") {
    assertBetaVersionMovesForward(Script.version, await highestPublishedBetaVersion(releaseRepo))
  }
  const existing = await $`gh release view ${tag} --repo ${releaseRepo}`.quiet().nothrow()
  if (existing.exitCode === 0) {
    const releasePayload =
      await $`gh release view ${tag} --json tagName,databaseId,isDraft,isPrerelease,body --repo ${releaseRepo}`.json()
    const existingRelease = ExistingReleaseSchema.parse(releasePayload)
    release = existingRelease
    assertReleaseTagVersion(distribution, release.tagName, Script.version)
    if (release.isDraft) {
      const notes =
        distribution.id === "beta"
          ? (readBetaReleaseBody(existingRelease.body) ?? existingRelease.body)
          : existingRelease.body
      requireValidReleaseNotes({ notes, body: existingRelease.body })
    }

    if (distribution.id === "beta" && !release.isDraft) {
      const assets = await $`gh release view ${tag} --json assets --repo ${releaseRepo}`.json()
      const frozen = z.object({ assets: z.array(z.object({ name: z.string() })) }).parse(assets)
      if (
        !release.isPrerelease ||
        !frozen.assets.some((asset) => asset.name === RELEASE_FREEZE_FILENAME)
      ) {
        throw new Error(`Published Beta ${tag} must be prerelease and frozen to retry`)
      }
    } else if (!release.isDraft && !release.isPrerelease) {
      throw new Error(`Stable release ${tag} already exists`)
    }
  } else {
    throw new Error(
      `No draft release ${tag}. Cut it with the release wizard and authored notes; see docs/ops/releases/notes.md.`,
    )
  }
}

const output = [
  `version=${Script.version}`,
  `release=${release.databaseId}`,
  `tag=${release.tagName}`,
  `release_repo=${releaseRepo}`,
  `repo=${releaseRepo}`,
  `source_repo=${sourceRepo}`,
]

await appendGithubOutputs(process.env, output)
