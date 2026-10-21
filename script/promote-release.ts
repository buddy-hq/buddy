#!/usr/bin/env bun

import { $ } from "bun"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { z } from "zod"
import { isJsonObject } from "./parse-values"
import { downloadReleaseAsset } from "./release/assets"
import { verifyReleaseFreeze } from "./release/freeze"
import { parseReleasePlan, RELEASE_PLAN_FILENAME, type ReleasePlan } from "./release/plan"
import { releaseRepository, repositoryParts } from "./release-repositories"

import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import { assertReleaseTag, parseReleaseTag } from "@buddy/script/release-stream"
import {
  assertReleaseDestination,
  assertReleaseRecordChannel,
  releaseDistribution,
} from "./release/distribution-guard"

export function assertPromotionDestination(
  repo: string,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (releaseDistribution(environment).id === "beta") {
    throw new Error("Beta releases cannot be promoted; promotion is not supported")
  }
  assertReleaseDestination(repo, environment)
}

const ROOT_DIR = path.resolve(import.meta.dir, "..")

export type GithubReleasePromotionState = {
  isDraft: boolean
  isPrerelease: boolean
  tagName: string
}

const githubReleasePromotionStateSchema = z.object({
  isDraft: z.boolean(),
  isPrerelease: z.boolean(),
  tagName: z.string().min(1),
})
const stableReleaseTagSchema = z.object({ tagName: z.string().min(1) })

function usage(): never {
  throw new Error("Usage: bun run release:promote vX.Y.Z")
}

export function normalizePromotionTag(value: string | undefined): string {
  const tag = value?.trim() ?? ""
  if (parseReleaseTag(BUDDY_DISTRIBUTIONS.prod, tag) === undefined) {
    throw new Error(`Malformed release tag: ${tag || "empty"}`)
  }

  return tag
}

export function parseGithubReleasePromotionState<TValue>(
  value: TValue,
): GithubReleasePromotionState {
  const parsed = githubReleasePromotionStateSchema.safeParse(value)
  if (parsed.success) return parsed.data
  if (!isJsonObject(value)) {
    throw new Error("GitHub release response was not an object")
  }
  throw new Error("GitHub release response was missing promotion fields")
}

export function assertPromotableRelease(
  release: GithubReleasePromotionState,
  expectedTag: string,
): void {
  assertReleaseTag(BUDDY_DISTRIBUTIONS.prod, expectedTag)
  assertReleaseTag(BUDDY_DISTRIBUTIONS.prod, release.tagName)
  if (release.tagName !== expectedTag) {
    throw new Error(`Release tag mismatch: expected ${expectedTag}, got ${release.tagName}`)
  }
  if (release.isDraft) {
    throw new Error(`Release ${expectedTag} is still a draft`)
  }
}

function compareReleaseTags(left: string, right: string): number {
  const leftParts = assertReleaseTag(BUDDY_DISTRIBUTIONS.prod, normalizePromotionTag(left))
    .split(".")
    .map(BigInt)
  const rightParts = assertReleaseTag(BUDDY_DISTRIBUTIONS.prod, normalizePromotionTag(right))
    .split(".")
    .map(BigInt)
  for (let index = 0; index < leftParts.length; index += 1) {
    const leftPart = leftParts[index]
    const rightPart = rightParts[index]
    if (leftPart === undefined || rightPart === undefined) {
      throw new Error("Release tags must contain major, minor, and patch versions")
    }
    if (leftPart > rightPart) return 1
    if (leftPart < rightPart) return -1
  }
  return 0
}

export function assertPrereleasePromotionMovesForward(
  candidateTag: string,
  highestStableTag: string | undefined,
): void {
  if (highestStableTag && compareReleaseTags(candidateTag, highestStableTag) <= 0) {
    throw new Error(
      `Release ${candidateTag} is not newer than stable ${highestStableTag}; refusing to move latest backward`,
    )
  }
}

function parseArgs() {
  const args = process.argv.slice(2)
  let repo = releaseRepository()
  let tag = ""

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--repo") {
      repo = args[index + 1]?.trim() || ""
      index += 1
      continue
    }
    if (!arg?.startsWith("--") && !tag) {
      tag = arg.trim()
      continue
    }
    usage()
  }

  if (!repo) usage()
  return {
    repo,
    tag: normalizePromotionTag(tag),
  }
}

async function readRelease(repo: string, tag: string): Promise<GithubReleasePromotionState> {
  const value =
    await $`gh release view ${tag} --json isDraft,isPrerelease,tagName --repo ${repo}`.json()
  return parseGithubReleasePromotionState(value)
}

export function latestReleaseTagFromCommandResult(input: {
  exitCode: number
  output: string
}): string | undefined {
  if (input.exitCode !== 0) return undefined
  return input.output.trim() || undefined
}

async function readLatestReleaseTag(repo: string): Promise<string | undefined> {
  const { owner, repo: releaseRepo } = repositoryParts(repo)
  const result = await $`gh api ${`repos/${owner}/${releaseRepo}/releases/latest`} --jq .tag_name`
    .quiet()
    .nothrow()
  return latestReleaseTagFromCommandResult({
    exitCode: result.exitCode,
    output: result.text(),
  })
}

async function verifyLatestRelease(repo: string, tag: string): Promise<void> {
  const latestTag = await readLatestReleaseTag(repo)
  if (latestTag !== tag) {
    throw new Error(`GitHub latest points to ${latestTag || "empty"}, expected ${tag}`)
  }
}

async function readHighestStableReleaseTag(repo: string): Promise<string | undefined> {
  const releases =
    await $`gh release list --repo ${repo} --exclude-drafts --exclude-pre-releases --limit 1000 --json tagName`.json()
  return selectHighestStableReleaseTag(z.array(stableReleaseTagSchema).parse(releases))
}

export function selectHighestStableReleaseTag(
  releases: readonly { tagName: string }[],
): string | undefined {
  return releases
    .map((release) => release.tagName.trim())
    .filter((tag) => parseReleaseTag(BUDDY_DISTRIBUTIONS.prod, tag) !== undefined)
    .toSorted(compareReleaseTags)
    .at(-1)
}

async function repairLatestRelease(repo: string): Promise<string> {
  const highestStableTag = await readHighestStableReleaseTag(repo)
  if (!highestStableTag) throw new Error(`No stable release exists in ${repo}`)
  if ((await readLatestReleaseTag(repo)) !== highestStableTag) {
    await $`gh release edit ${highestStableTag} --latest --repo ${repo}`.cwd(ROOT_DIR)
  }
  await verifyLatestRelease(repo, highestStableTag)
  return highestStableTag
}

async function readReleasePlan(
  repository: string,
  tag: string,
  directory: string,
): Promise<ReleasePlan> {
  const planPath = await downloadReleaseAsset({
    directory,
    name: RELEASE_PLAN_FILENAME,
    repository,
    tag,
  })
  return parseReleasePlan(JSON.parse(await Bun.file(planPath).text()))
}

function releaseVerificationTargetArguments(plan: ReleasePlan): string[] {
  return [
    "--macos-arm64",
    String(plan.targets.macosArm64),
    "--macos-x64",
    String(plan.targets.macosX64),
    "--windows-x64",
    String(plan.targets.windowsX64),
  ]
}

export async function promoteRelease(input: { repo: string; tag: string }): Promise<void> {
  assertPromotionDestination(input.repo)
  normalizePromotionTag(input.tag)
  const release = await readRelease(input.repo, input.tag)
  assertPromotableRelease(release, input.tag)
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "buddy-release-promote-"))

  try {
    if (release.isPrerelease) {
      assertPrereleasePromotionMovesForward(
        release.tagName,
        await readHighestStableReleaseTag(input.repo),
      )
    } else if ((await readHighestStableReleaseTag(input.repo)) !== release.tagName) {
      await repairLatestRelease(input.repo)
      throw new Error(
        `Release ${release.tagName} is already stable but is not the highest stable version`,
      )
    }
    const plan = await readReleasePlan(input.repo, input.tag, temporaryDirectory)
    assertReleaseRecordChannel(plan, "prod")
    if (plan.tag !== input.tag) throw new Error("Release plan tag does not match promotion")
    const targetArguments = releaseVerificationTargetArguments(plan)
    await $`bun ./script/verify-release-assets.ts --repo ${input.repo} --tag ${input.tag} ${targetArguments}`.cwd(
      ROOT_DIR,
    )
    await verifyReleaseFreeze({
      directory: temporaryDirectory,
      repository: input.repo,
      tag: input.tag,
    })
    if (release.isPrerelease) {
      assertPrereleasePromotionMovesForward(
        release.tagName,
        await readHighestStableReleaseTag(input.repo),
      )
      await $`gh release edit ${input.tag} --prerelease=false --latest=false --repo ${input.repo}`.cwd(
        ROOT_DIR,
      )
    }
    await verifyReleaseFreeze({
      directory: temporaryDirectory,
      repository: input.repo,
      tag: input.tag,
    })
    const highestStableTag = await repairLatestRelease(input.repo)
    if (highestStableTag !== input.tag) {
      throw new Error(
        `Release ${input.tag} is stable, but newer stable ${highestStableTag} remains latest`,
      )
    }
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true })
  }
}

if (import.meta.main) {
  const args = parseArgs()
  await promoteRelease(args)
  console.log(`Promoted ${args.repo}@${args.tag} to stable latest`)
}
