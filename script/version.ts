#!/usr/bin/env bun

import { $ } from "bun"
import os from "node:os"
import path from "node:path"
import { Script } from "@buddy/script"
import { buildNotes, getLatestRelease } from "./changelog.ts"
import { releaseRepository, sourceRepository } from "./release-repositories"

const DRY_RUN_ENV_KEY = "BUDDY_RELEASE_DRY_RUN"
const TRUE_ENV_VALUE = "1"
const DRY_RUN_RELEASE_ID = "dry-run"
const LOCAL_RUN_ID = "local"

type CreatedRelease = {
  databaseId: number | string
  isDraft?: boolean
  tagName: string
}

function currentTag() {
  if (process.env.GITHUB_REF_TYPE !== "tag") {
    return undefined
  }

  const refName = process.env.GITHUB_REF_NAME?.trim()
  if (!refName) {
    return undefined
  }

  return refName
}

async function currentBranch() {
  if (process.env.GITHUB_REF_NAME?.trim()) {
    return process.env.GITHUB_REF_NAME.trim()
  }

  return $`git branch --show-current`.text().then((output) => output.trim())
}

const tagRef = currentTag()
const dryRun = process.env[DRY_RUN_ENV_KEY]?.trim() === TRUE_ENV_VALUE

if (!tagRef) {
  const branch = await currentBranch()

  if (!dryRun && branch !== "main") {
    throw new Error(
      `Preview release candidates must be cut from main, received '${branch || "detached"}'`,
    )
  }

  if (!process.env.BUDDY_VERSION && !process.env.BUDDY_BUMP) {
    throw new Error("Non-tag releases require BUDDY_VERSION or BUDDY_BUMP")
  }
}

const releaseRepo = releaseRepository()
const sourceRepo = sourceRepository()
const tag = `v${Script.version}`

if (tagRef && tagRef !== tag) {
  throw new Error(`Tag ref ${tagRef} does not match computed version ${tag}`)
}

async function releaseTargetSha() {
  return (
    process.env.GITHUB_SHA?.trim() ||
    (await $`git rev-parse HEAD`.text().then((output) => output.trim()))
  )
}

async function createRelease(file: string) {
  if (releaseRepo === sourceRepo) {
    const target = await releaseTargetSha()
    if (tagRef) {
      await $`gh release create ${tag} -d --title ${tag} --notes-file ${file} --repo ${releaseRepo}`
    } else {
      await $`gh release create ${tag} -d --title ${tag} --notes-file ${file} --target ${target} --repo ${releaseRepo}`
    }
    return
  }

  await $`gh release create ${tag} -d --title ${tag} --notes-file ${file} --repo ${releaseRepo}`
}

let release: CreatedRelease

if (dryRun) {
  const runId = process.env.GITHUB_RUN_ID?.trim() || LOCAL_RUN_ID
  release = {
    databaseId: DRY_RUN_RELEASE_ID,
    tagName: `dry-run-${tag}-${runId}`,
  }
} else {
  const existing = await $`gh release view ${tag} --repo ${releaseRepo}`.quiet().nothrow()
  if (existing.exitCode === 0) {
    // SAFETY: `gh release view --json` returns the requested scalar fields with these documented types.
    release =
      (await $`gh release view ${tag} --json tagName,databaseId,isDraft --repo ${releaseRepo}`.json()) as {
        databaseId: number
        isDraft: boolean
        tagName: string
      }

    if (!release.isDraft) {
      throw new Error(`Release ${tag} already exists`)
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

    // SAFETY: `gh release view --json` returns the requested scalar fields with these documented types.
    release =
      (await $`gh release view ${tag} --json tagName,databaseId --repo ${releaseRepo}`.json()) as {
        databaseId: number
        tagName: string
      }
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

if (process.env.GITHUB_OUTPUT) {
  await Bun.write(process.env.GITHUB_OUTPUT, output.join("\n"))
}
