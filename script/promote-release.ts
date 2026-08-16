#!/usr/bin/env bun

import { $ } from "bun"
import path from "node:path"
import { z } from "zod"
import { isJsonObject } from "./parse-values"
import { releaseRepository, repositoryParts } from "./release-repositories"

const ROOT_DIR = path.resolve(import.meta.dir, "..")
const RELEASE_TAG_PATTERN = /^v\d+\.\d+\.\d+$/u

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

function usage(): never {
  throw new Error("Usage: bun run release:promote vX.Y.Z")
}

export function normalizePromotionTag(value: string | undefined): string {
  const tag = value?.trim() ?? ""
  if (!RELEASE_TAG_PATTERN.test(tag)) {
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
  if (release.tagName !== expectedTag) {
    throw new Error(`Release tag mismatch: expected ${expectedTag}, got ${release.tagName}`)
  }
  if (release.isDraft) {
    throw new Error(`Release ${expectedTag} is still a draft`)
  }
  if (!release.isPrerelease) {
    throw new Error(`Release ${expectedTag} is already stable`)
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

async function verifyLatestRelease(repo: string, tag: string): Promise<void> {
  const { owner, repo: releaseRepo } = repositoryParts(repo)
  const latestTag =
    await $`gh api ${`repos/${owner}/${releaseRepo}/releases/latest`} --jq .tag_name`
      .text()
      .then((output) => output.trim())

  if (latestTag !== tag) {
    throw new Error(`GitHub latest points to ${latestTag || "empty"}, expected ${tag}`)
  }
}

export async function promoteRelease(input: { repo: string; tag: string }): Promise<void> {
  const release = await readRelease(input.repo, input.tag)
  assertPromotableRelease(release, input.tag)

  await $`bun ./script/verify-release-assets.ts --repo ${input.repo} --tag ${input.tag}`.cwd(
    ROOT_DIR,
  )
  await $`gh release edit ${input.tag} --prerelease=false --latest --repo ${input.repo}`.cwd(
    ROOT_DIR,
  )
  await verifyLatestRelease(input.repo, input.tag)
}

if (import.meta.main) {
  const args = parseArgs()
  await promoteRelease(args)
  console.log(`Promoted ${args.repo}@${args.tag} to stable latest`)
}
