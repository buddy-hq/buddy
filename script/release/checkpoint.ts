#!/usr/bin/env bun

import path from "node:path"
import { z } from "zod"
import { resolveAdvancedMathRuntimeVersion } from "../../packages/buddy/script/advanced-math-version"
import {
  resolveMacOsReleaseArtifactFilename,
  resolveWindowsReleaseArtifactFilename,
} from "../../packages/desktop-electron/src/shared/release-asset-names"
import {
  assertAssetDigestSet,
  downloadReleaseAsset,
  githubAssetDigest,
  readGithubReleaseAssets,
  uploadReleaseAssetSafely,
  type GithubReleaseAsset,
  type ReleaseAssetDigest,
} from "./assets"
import { appendGithubOutputs } from "./github-output"

export const RELEASE_CHECKPOINT_SCHEMA_VERSION = 1
const CHECKPOINT_COMMANDS = ["inspect", "record"] as const
export const RELEASE_CHECKPOINT_TARGETS = [
  "electron-macos-arm64",
  "electron-macos-x64",
  "electron-windows-x64",
  "advanced-math-macos-arm64",
  "advanced-math-macos-x64",
  "standards",
] as const

type ReleaseCheckpointCommand = (typeof CHECKPOINT_COMMANDS)[number]
export type ReleaseCheckpointTarget = (typeof RELEASE_CHECKPOINT_TARGETS)[number]

type ReleaseCheckpointArguments = {
  command: ReleaseCheckpointCommand
  target: ReleaseCheckpointTarget
}

const releaseAssetDigestSchema = z.object({
  name: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  size: z.number().int().nonnegative(),
})

const releaseCheckpointSchema = z.object({
  assets: z.array(releaseAssetDigestSchema).min(1),
  planDigest: z.string().regex(/^[0-9a-f]{64}$/u),
  schemaVersion: z.literal(RELEASE_CHECKPOINT_SCHEMA_VERSION),
  sourceSha: z.string().regex(/^[0-9a-f]{40}$/u),
  target: z.enum(RELEASE_CHECKPOINT_TARGETS),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
})

export type ReleaseCheckpoint = z.infer<typeof releaseCheckpointSchema>

export function releaseCheckpointFilename(target: ReleaseCheckpointTarget): string {
  return `buddy-release-checkpoint-${target}.json`
}

function isReleaseCheckpointCommand(value: string): value is ReleaseCheckpointCommand {
  return CHECKPOINT_COMMANDS.some((command) => command === value)
}

function isReleaseCheckpointTarget(value: string): value is ReleaseCheckpointTarget {
  return RELEASE_CHECKPOINT_TARGETS.some((target) => target === value)
}

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim()
  if (!value) throw new Error(`${key} is required`)
  return value
}

export function parseReleaseCheckpoint<TValue>(value: TValue): ReleaseCheckpoint {
  const parsed = releaseCheckpointSchema.safeParse(value)
  if (!parsed.success) throw new Error("Invalid Buddy release checkpoint")
  return {
    ...parsed.data,
    assets: parsed.data.assets.toSorted((left, right) => left.name.localeCompare(right.name)),
  }
}

export function renderReleaseCheckpoint(checkpoint: ReleaseCheckpoint): string {
  return `${JSON.stringify(parseReleaseCheckpoint(checkpoint), null, 2)}\n`
}

export function expectedCheckpointAssetNames(
  target: ReleaseCheckpointTarget,
  version: string,
  advancedMathVersion: string,
): readonly string[] {
  switch (target) {
    case "electron-macos-arm64": {
      const dmg = resolveMacOsReleaseArtifactFilename(version, "arm64", "dmg")
      const zip = resolveMacOsReleaseArtifactFilename(version, "arm64", "zip")
      return [dmg, `${dmg}.blockmap`, zip, `${zip}.blockmap`]
    }
    case "electron-macos-x64": {
      const dmg = resolveMacOsReleaseArtifactFilename(version, "x64", "dmg")
      const zip = resolveMacOsReleaseArtifactFilename(version, "x64", "zip")
      return [dmg, `${dmg}.blockmap`, zip, `${zip}.blockmap`]
    }
    case "electron-windows-x64": {
      const executable = resolveWindowsReleaseArtifactFilename(version, "x64", "exe")
      return [executable, `${executable}.blockmap`]
    }
    case "advanced-math-macos-arm64": {
      const archive = `buddy-advanced-math-v${advancedMathVersion}-aarch64-apple-darwin.zip`
      return [archive, `${archive}.sha256`]
    }
    case "advanced-math-macos-x64": {
      const archive = `buddy-advanced-math-v${advancedMathVersion}-x86_64-apple-darwin.zip`
      return [archive, `${archive}.sha256`]
    }
    case "standards":
      return [
        "learning-commons-knowledge-graph.db.json",
        "learning-commons-knowledge-graph.db.zst",
        "learning-commons-knowledge-graph.db.zst.sha256",
      ]
  }
}

function checkpointAssetPaths(input: {
  assetDirectory: string
  target: ReleaseCheckpointTarget
  version: string
}): string[] {
  return expectedCheckpointAssetNames(
    input.target,
    input.version,
    resolveAdvancedMathRuntimeVersion(),
  ).map((name) => path.join(input.assetDirectory, name))
}

function checkpointIdentity(input: {
  environment: NodeJS.ProcessEnv
  target: ReleaseCheckpointTarget
}): Omit<ReleaseCheckpoint, "assets"> {
  return {
    planDigest: requiredEnvironmentValue(input.environment, "BUDDY_RELEASE_PLAN_DIGEST"),
    schemaVersion: RELEASE_CHECKPOINT_SCHEMA_VERSION,
    sourceSha: requiredEnvironmentValue(
      input.environment,
      "BUDDY_RELEASE_SOURCE_SHA",
    ).toLowerCase(),
    target: input.target,
    version: requiredEnvironmentValue(input.environment, "BUDDY_VERSION"),
  }
}

export function assertCheckpointMatches(input: {
  checkpoint: ReleaseCheckpoint
  currentAssets: readonly ReleaseAssetDigest[]
  expectedAssetNames: readonly string[]
  identity: Omit<ReleaseCheckpoint, "assets">
}): void {
  if (
    input.checkpoint.planDigest !== input.identity.planDigest ||
    input.checkpoint.schemaVersion !== input.identity.schemaVersion ||
    input.checkpoint.sourceSha !== input.identity.sourceSha ||
    input.checkpoint.target !== input.identity.target ||
    input.checkpoint.version !== input.identity.version
  ) {
    throw new Error(`Checkpoint identity mismatch for ${input.identity.target}`)
  }

  const checkpointNames = input.checkpoint.assets.map((asset) => asset.name).toSorted()
  const expectedNames = input.expectedAssetNames.toSorted()
  if (JSON.stringify(checkpointNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`Checkpoint inventory mismatch for ${input.identity.target}`)
  }

  const currentCheckpointAssets = input.checkpoint.assets.map((checkpointAsset) => {
    const current = input.currentAssets.find((asset) => asset.name === checkpointAsset.name)
    if (!current) throw new Error(`Checkpoint asset is missing: ${checkpointAsset.name}`)
    return current
  })
  assertAssetDigestSet({
    actual: currentCheckpointAssets,
    expected: input.checkpoint.assets,
    label: `Checkpoint ${input.identity.target}`,
  })
}

export function releaseCheckpointIsReusable(input: {
  checkpointValue: unknown
  currentAssets: readonly ReleaseAssetDigest[]
  expectedAssetNames: readonly string[]
  identity: Omit<ReleaseCheckpoint, "assets">
}): boolean {
  try {
    const checkpoint = parseReleaseCheckpoint(input.checkpointValue)
    assertCheckpointMatches({
      checkpoint,
      currentAssets: input.currentAssets,
      expectedAssetNames: input.expectedAssetNames,
      identity: input.identity,
    })
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`Checkpoint ${input.identity.target} cannot be reused: ${message}`)
    return false
  }
}

export function checkpointGithubAssetDigests(
  assets: readonly GithubReleaseAsset[],
  expectedAssetNames: readonly string[],
): ReleaseAssetDigest[] {
  return expectedAssetNames.map((name) => {
    const asset = assets.find((candidate) => candidate.name === name)
    if (!asset) throw new Error(`Checkpoint asset is missing: ${name}`)
    return githubAssetDigest(asset)
  })
}

export async function inspectReleaseCheckpoint(input: {
  environment: NodeJS.ProcessEnv
  target: ReleaseCheckpointTarget
}): Promise<boolean> {
  const repository = requiredEnvironmentValue(input.environment, "BUDDY_RELEASE_REPO")
  const tag = requiredEnvironmentValue(input.environment, "BUDDY_RELEASE_TAG")
  const assets = await readGithubReleaseAssets(repository, tag)
  const checkpointName = releaseCheckpointFilename(input.target)
  if (!assets.some((asset) => asset.name === checkpointName)) return false

  const temporaryDirectory = requiredEnvironmentValue(input.environment, "RUNNER_TEMP")
  const checkpointPath = await downloadReleaseAsset({
    directory: temporaryDirectory,
    name: checkpointName,
    repository,
    tag,
  })
  let checkpointValue: unknown
  try {
    checkpointValue = JSON.parse(await Bun.file(checkpointPath).text())
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`Checkpoint ${input.target} cannot be parsed: ${message}`)
    return false
  }
  const expectedAssetNames = expectedCheckpointAssetNames(
    input.target,
    requiredEnvironmentValue(input.environment, "BUDDY_VERSION"),
    resolveAdvancedMathRuntimeVersion(),
  )
  const identity = checkpointIdentity(input)
  try {
    return releaseCheckpointIsReusable({
      checkpointValue,
      currentAssets: checkpointGithubAssetDigests(assets, expectedAssetNames),
      expectedAssetNames,
      identity,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`Checkpoint ${input.target} cannot be reused: ${message}`)
    return false
  }
}

export async function recordReleaseCheckpoint(input: {
  environment: NodeJS.ProcessEnv
  target: ReleaseCheckpointTarget
}): Promise<void> {
  const repository = requiredEnvironmentValue(input.environment, "BUDDY_RELEASE_REPO")
  const tag = requiredEnvironmentValue(input.environment, "BUDDY_RELEASE_TAG")
  const assetDirectory = requiredEnvironmentValue(input.environment, "BUDDY_RELEASE_ASSET_DIR")
  const identity = checkpointIdentity(input)
  const assetPaths = checkpointAssetPaths({
    assetDirectory,
    target: input.target,
    version: identity.version,
  })
  const assets: ReleaseAssetDigest[] = []
  for (const filePath of assetPaths) {
    assets.push(await uploadReleaseAssetSafely({ filePath, repository, tag }))
  }

  const checkpoint = parseReleaseCheckpoint({ ...identity, assets })
  const checkpointPath = path.join(assetDirectory, releaseCheckpointFilename(input.target))
  await Bun.write(checkpointPath, renderReleaseCheckpoint(checkpoint))
  await uploadReleaseAssetSafely({ filePath: checkpointPath, repository, tag })
  console.log(`Recorded verified release checkpoint ${input.target}`)
}

function parseArgs(): ReleaseCheckpointArguments {
  const command = process.argv[2]?.trim() ?? ""
  const target = process.argv[3]?.trim() ?? ""
  if (!isReleaseCheckpointCommand(command) || !isReleaseCheckpointTarget(target)) {
    throw new Error(
      `Usage: bun ./script/release/checkpoint.ts <inspect|record> <${RELEASE_CHECKPOINT_TARGETS.join("|")}>`,
    )
  }
  return { command, target }
}

async function writeInspectionOutput(
  valid: boolean,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  await appendGithubOutputs(environment, [`valid=${String(valid)}`])
}

async function main(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const { command, target } = parseArgs()
  if (command === "record") {
    await recordReleaseCheckpoint({ environment, target })
    return
  }

  const valid = await inspectReleaseCheckpoint({ environment, target })
  await writeInspectionOutput(valid, environment)
  console.log(`${target} checkpoint: ${valid ? "verified" : "missing"}`)
}

if (import.meta.main) {
  await main()
}
