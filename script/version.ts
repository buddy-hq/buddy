#!/usr/bin/env bun

import { $ } from "bun"
import { z } from "zod"
import os from "node:os"
import path from "node:path"
import { Script } from "@buddy/script"
import { buildNotes, getLatestRelease } from "./changelog.ts"
import { releaseRepository, sourceRepository } from "./release-repositories"
import { appendGithubOutputs } from "./release/github-output"

const DRY_RUN_ENV_KEY = "BUDDY_RELEASE_DRY_RUN"
const TRUE_ENV_VALUE = "1"
const DRY_RUN_RELEASE_ID = "dry-run"

type CreatedRelease = {
  databaseId: number | string
  isDraft?: boolean
  tagName: string
}

const ExistingReleaseSchema = z.object({
  databaseId: z.number(),
  isDraft: z.boolean(),
  isPrerelease: z.boolean(),
  tagName: z.string(),
})

const CreatedReleaseSchema = z.object({
  databaseId: z.number(),
  tagName: z.string(),
})

async function currentBranch() {
  if (process.env.GITHUB_REF_NAME?.trim()) {
    return process.env.GITHUB_REF_NAME.trim()
  }

  return $`git branch --show-current`.text().then((output) => output.trim())
}

const dryRun = process.env[DRY_RUN_ENV_KEY]?.trim() === TRUE_ENV_VALUE
const branch = await currentBranch()
if (!dryRun && branch !== "main") {
  throw new Error(
    `Preview release candidates must be cut from main, received '${branch || "detached"}'`,
  )
}
if (!process.env.BUDDY_VERSION?.trim()) {
  throw new Error("Preview release candidates require an explicit BUDDY_VERSION")
}

const releaseRepo = releaseRepository()
const sourceRepo = sourceRepository()
const tag = `v${Script.version}`

async function releaseTargetSha() {
  return (
    process.env.BUDDY_RELEASE_SOURCE_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    (await $`git rev-parse HEAD`.text().then((output) => output.trim()))
  )
}

async function createRelease(file: string) {
  if (releaseRepo === sourceRepo) {
    const target = await releaseTargetSha()
    await $`gh release create ${tag} -d --title ${tag} --notes-file ${file} --target ${target} --repo ${releaseRepo}`
    return
  }

  await $`gh release create ${tag} -d --title ${tag} --notes-file ${file} --repo ${releaseRepo}`
}

let release: CreatedRelease

if (dryRun) {
  release = {
    databaseId: DRY_RUN_RELEASE_ID,
    tagName: tag,
  }
} else {
  const existing = await $`gh release view ${tag} --repo ${releaseRepo}`.quiet().nothrow()
  if (existing.exitCode === 0) {
    const releasePayload =
      await $`gh release view ${tag} --json tagName,databaseId,isDraft,isPrerelease --repo ${releaseRepo}`.json()
    release = ExistingReleaseSchema.parse(releasePayload)

    if (!release.isDraft && !release.isPrerelease) {
      throw new Error(`Stable release ${tag} already exists`)
    }
  } else {
    const previous = await getLatestRelease(undefined)
    const notes = await buildNotes(previous, "HEAD")
    const body = notes.join("\n") || "No notable changes"
    const file = path.join(
      process.env.RUNNER_TEMP || os.tmpdir(),
      `buddy-release-notes-${Script.version}.md`,
    )
    await Bun.write(file, body)

    await createRelease(file)

    const releasePayload =
      await $`gh release view ${tag} --json tagName,databaseId --repo ${releaseRepo}`.json()
    release = CreatedReleaseSchema.parse(releasePayload)
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
