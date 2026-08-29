#!/usr/bin/env bun

import { $ } from "bun"
import path from "node:path"
import { z } from "zod"
import {
  assertAssetDigestSet,
  downloadReleaseAsset,
  githubAssetDigest,
  readGithubReleaseAssets,
  readGithubReleaseState,
  uploadReleaseAssetSafely,
  type ReleaseAssetDigest,
} from "./assets"
import { RELEASE_FREEZE_FILENAME } from "./constants"
import { appendGithubOutputs } from "./github-output"

export { RELEASE_FREEZE_FILENAME } from "./constants"
const RELEASE_FREEZE_SCHEMA_VERSION = 1

const releaseAssetDigestSchema = z.object({
  name: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  size: z.number().int().nonnegative(),
})

const releaseFreezeSchema = z.object({
  assets: z.array(releaseAssetDigestSchema).min(1),
  planDigest: z.string().regex(/^[0-9a-f]{64}$/u),
  schemaVersion: z.literal(RELEASE_FREEZE_SCHEMA_VERSION),
  sourceRepository: z.string().min(1),
  sourceSha: z.string().regex(/^[0-9a-f]{40}$/u),
  tag: z.string().regex(/^v\d+\.\d+\.\d+$/u),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
})

export type ReleaseFreeze = z.infer<typeof releaseFreezeSchema>

type ReleaseFreezeVerifyArguments = {
  repository: string
  tag: string
}

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim()
  if (!value) throw new Error(`${key} is required`)
  return value
}

export function parseReleaseFreeze<TValue>(value: TValue): ReleaseFreeze {
  const parsed = releaseFreezeSchema.safeParse(value)
  if (!parsed.success) throw new Error("Invalid Buddy release freeze")
  return {
    ...parsed.data,
    assets: parsed.data.assets.toSorted((left, right) => left.name.localeCompare(right.name)),
  }
}

export function renderReleaseFreeze(freeze: ReleaseFreeze): string {
  return `${JSON.stringify(parseReleaseFreeze(freeze), null, 2)}\n`
}

export function releaseFreezeIdentity(
  environment: NodeJS.ProcessEnv,
): Omit<ReleaseFreeze, "assets"> {
  return {
    planDigest: requiredEnvironmentValue(environment, "BUDDY_RELEASE_PLAN_DIGEST"),
    schemaVersion: RELEASE_FREEZE_SCHEMA_VERSION,
    sourceRepository: requiredEnvironmentValue(environment, "BUDDY_RELEASE_SOURCE_REPOSITORY"),
    sourceSha: requiredEnvironmentValue(environment, "BUDDY_RELEASE_SOURCE_SHA").toLowerCase(),
    tag: requiredEnvironmentValue(environment, "BUDDY_RELEASE_TAG"),
    version: requiredEnvironmentValue(environment, "BUDDY_VERSION"),
  }
}

export function assertReleaseFreezeIdentity(
  actual: Omit<ReleaseFreeze, "assets">,
  expected: Omit<ReleaseFreeze, "assets">,
): void {
  if (
    actual.planDigest !== expected.planDigest ||
    actual.schemaVersion !== expected.schemaVersion ||
    actual.sourceRepository !== expected.sourceRepository ||
    actual.sourceSha !== expected.sourceSha ||
    actual.tag !== expected.tag ||
    actual.version !== expected.version
  ) {
    throw new Error("Release freeze identity does not match the release plan")
  }
}

function mutableReleaseAssetDigests(
  assets: Awaited<ReturnType<typeof readGithubReleaseAssets>>,
): ReleaseAssetDigest[] {
  return assets
    .filter((asset) => asset.name !== RELEASE_FREEZE_FILENAME)
    .map(githubAssetDigest)
    .toSorted((left, right) => left.name.localeCompare(right.name))
}

async function readReleaseFreeze(input: {
  directory: string
  repository: string
  tag: string
}): Promise<ReleaseFreeze> {
  const freezePath = await downloadReleaseAsset({
    directory: input.directory,
    name: RELEASE_FREEZE_FILENAME,
    repository: input.repository,
    tag: input.tag,
  })
  return parseReleaseFreeze(JSON.parse(await Bun.file(freezePath).text()))
}

export async function verifyReleaseFreeze(input: {
  directory: string
  expectedIdentity?: Omit<ReleaseFreeze, "assets">
  repository: string
  tag: string
}): Promise<ReleaseFreeze> {
  const [assets, freeze] = await Promise.all([
    readGithubReleaseAssets(input.repository, input.tag),
    readReleaseFreeze(input),
  ])
  if (input.expectedIdentity) {
    const actualIdentity = {
      planDigest: freeze.planDigest,
      schemaVersion: freeze.schemaVersion,
      sourceRepository: freeze.sourceRepository,
      sourceSha: freeze.sourceSha,
      tag: freeze.tag,
      version: freeze.version,
    }
    assertReleaseFreezeIdentity(actualIdentity, input.expectedIdentity)
  }

  assertAssetDigestSet({
    actual: mutableReleaseAssetDigests(assets),
    expected: freeze.assets,
    label: `Release freeze ${input.repository}@${input.tag}`,
  })
  return freeze
}

async function recordReleaseFreeze(environment: NodeJS.ProcessEnv): Promise<void> {
  const identity = releaseFreezeIdentity(environment)
  const repository = requiredEnvironmentValue(environment, "BUDDY_RELEASE_REPO")
  const directory = requiredEnvironmentValue(environment, "RUNNER_TEMP")
  const existingAssets = await readGithubReleaseAssets(repository, identity.tag)

  if (existingAssets.some((asset) => asset.name === RELEASE_FREEZE_FILENAME)) {
    await verifyReleaseFreeze({
      directory,
      expectedIdentity: identity,
      repository,
      tag: identity.tag,
    })
    console.log(`Release freeze already matches ${identity.tag}`)
    return
  }

  const freeze = parseReleaseFreeze({
    ...identity,
    assets: mutableReleaseAssetDigests(existingAssets),
  })
  const freezePath = path.join(directory, RELEASE_FREEZE_FILENAME)
  await Bun.write(freezePath, renderReleaseFreeze(freeze))
  await uploadReleaseAssetSafely({ filePath: freezePath, repository, tag: identity.tag })
  try {
    await verifyReleaseFreeze({
      directory,
      expectedIdentity: identity,
      repository,
      tag: identity.tag,
    })
  } catch (error) {
    const release = await readGithubReleaseState(repository, identity.tag)
    const freezeAsset = release.assets.find((asset) => asset.name === RELEASE_FREEZE_FILENAME)
    if (release.isDraft && freezeAsset) {
      await $`gh api --method DELETE ${freezeAsset.apiUrl}`.quiet()
      console.warn(`Removed an unverifiable release freeze from ${identity.tag}`)
    }
    throw error
  }
  console.log(`Froze ${freeze.assets.length} release assets for ${identity.tag}`)
}

async function inspectReleaseFreeze(environment: NodeJS.ProcessEnv): Promise<void> {
  const identity = releaseFreezeIdentity(environment)
  const repository = requiredEnvironmentValue(environment, "BUDDY_RELEASE_REPO")
  const directory = requiredEnvironmentValue(environment, "RUNNER_TEMP")
  const assets = await readGithubReleaseAssets(repository, identity.tag)
  const frozen = assets.some((asset) => asset.name === RELEASE_FREEZE_FILENAME)
  if (frozen) {
    await verifyReleaseFreeze({
      directory,
      expectedIdentity: identity,
      repository,
      tag: identity.tag,
    })
  }
  await appendGithubOutputs(environment, [`frozen=${String(frozen)}`])
  console.log(`${identity.tag} is ${frozen ? "frozen and verified" : "not frozen"}`)
}

function parseVerifyArgs(): ReleaseFreezeVerifyArguments {
  let repository = ""
  let tag = ""
  for (let index = 3; index < process.argv.length; index += 1) {
    const argument = process.argv[index]
    if (argument === "--repo") {
      repository = process.argv[index + 1]?.trim() ?? ""
      index += 1
      continue
    }
    if (argument === "--tag") {
      tag = process.argv[index + 1]?.trim() ?? ""
      index += 1
      continue
    }
    throw new Error("Usage: release-freeze.ts verify --repo owner/repo --tag vX.Y.Z")
  }
  if (!repository || !tag) {
    throw new Error("Usage: release-freeze.ts verify --repo owner/repo --tag vX.Y.Z")
  }
  return { repository, tag }
}

async function main(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const command = process.argv[2]?.trim()
  if (command === "record") {
    await recordReleaseFreeze(environment)
    return
  }
  if (command === "inspect") {
    await inspectReleaseFreeze(environment)
    return
  }
  if (command === "verify") {
    const args = parseVerifyArgs()
    await verifyReleaseFreeze({
      directory: environment.RUNNER_TEMP?.trim() || "/tmp",
      repository: args.repository,
      tag: args.tag,
    })
    console.log(`Verified immutable release bytes for ${args.repository}@${args.tag}`)
    return
  }
  throw new Error("Usage: release-freeze.ts <inspect|record|verify>")
}

if (import.meta.main) {
  await main()
}
