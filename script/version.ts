#!/usr/bin/env bun

import { $ } from "bun"
import os from "node:os"
import path from "node:path"
import { Script } from "@buddy/script"
import { buildNotes, getLatestRelease } from "./changelog.ts"

function releaseRepo() {
  return process.env.BUDDY_REPO || process.env.GITHUB_REPOSITORY || "prashantbhudwal/buddy"
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

if (!tagRef) {
  const branch = await currentBranch()

  if (branch !== "main") {
    throw new Error(`Stable releases must be cut from main, received '${branch || "detached"}'`)
  }

  if (!process.env.BUDDY_VERSION && !process.env.BUDDY_BUMP) {
    throw new Error("Non-tag releases require BUDDY_VERSION or BUDDY_BUMP")
  }
}

const repo = releaseRepo()
const tag = `v${Script.version}`

if (tagRef && tagRef !== tag) {
  throw new Error(`Tag ref ${tagRef} does not match computed version ${tag}`)
}

const existing = await $`gh release view ${tag} --repo ${repo}`.quiet().nothrow()
let release: {
  databaseId: number
  isDraft?: boolean
  tagName: string
}

if (existing.exitCode === 0) {
  release = await $`gh release view ${tag} --json tagName,databaseId,isDraft --repo ${repo}`.json() as {
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
  const file = path.join(process.env.RUNNER_TEMP || os.tmpdir(), `buddy-release-notes-${Script.version}.md`)
  await Bun.write(file, body)

  if (tagRef) {
    await $`gh release create ${tag} -d --title ${tag} --notes-file ${file} --repo ${repo}`
  } else {
    await $`gh release create ${tag} -d --title ${tag} --notes-file ${file} --target ${process.env.GITHUB_SHA || "HEAD"} --repo ${repo}`
  }

  release = await $`gh release view ${tag} --json tagName,databaseId --repo ${repo}`.json() as {
    databaseId: number
    tagName: string
  }
}

const output = [
  `version=${Script.version}`,
  `release=${release.databaseId}`,
  `tag=${release.tagName}`,
  `repo=${repo}`,
]

if (process.env.GITHUB_OUTPUT) {
  await Bun.write(process.env.GITHUB_OUTPUT, output.join("\n"))
}
