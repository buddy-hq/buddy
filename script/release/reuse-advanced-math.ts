#!/usr/bin/env bun

import path from "node:path"
import { z } from "zod"
import { resolveAdvancedMathRuntimeVersion } from "../../packages/buddy/script/advanced-math-version"
import {
  assertAssetDigestSet,
  downloadReleaseAsset,
  localReleaseAssetDigest,
  normalizeSha256Digest,
  readGithubReleaseAssets,
  readGithubReleaseState,
  sha256File,
  type GithubReleaseAsset,
} from "./assets"
import {
  expectedCheckpointAssetNames,
  inspectReleaseCheckpoint,
  recordReleaseCheckpoint,
  type ReleaseCheckpointTarget,
} from "./checkpoint"
import { RELEASE_FREEZE_FILENAME } from "./constants"
import { verifyReleaseFreeze, type ReleaseFreeze } from "./freeze"
import {
  hashAdvancedMathInputs,
  parseReleasePlan,
  RELEASE_PLAN_FILENAME,
  type ReleasePlan,
} from "./plan"

const TRUE_ENV_VALUE = "1"
const REUSED_ARM64_OUTPUT = "reused_macos_arm64"
const REUSED_X64_OUTPUT = "reused_macos_x64"

const publishedReleaseSchema = z.object({
  publishedAt: z.string().min(1),
  tagName: z.string().min(1),
})

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim()
  if (!value) throw new Error(`${key} is required`)
  return value
}

export function advancedMathPlanCanBeReused(input: {
  currentInputSha256: string
  currentPythonVersion: string
  currentRuntimeVersion: string
  previousPlan: ReleasePlan
}): boolean {
  return (
    input.previousPlan.advancedMathInputSha256 === input.currentInputSha256 &&
    input.previousPlan.advancedMathVersion === input.currentRuntimeVersion &&
    input.previousPlan.toolchain.python === input.currentPythonVersion
  )
}

function selectedTargets(environment: NodeJS.ProcessEnv): ReleaseCheckpointTarget[] {
  const targets: ReleaseCheckpointTarget[] = []
  if (environment.BUDDY_RELEASE_TARGET_MACOS_ARM64?.trim() === "true") {
    targets.push("advanced-math-macos-arm64")
  }
  if (environment.BUDDY_RELEASE_TARGET_MACOS_X64?.trim() === "true") {
    targets.push("advanced-math-macos-x64")
  }
  return targets
}

function writeReuseOutputs(
  reusedTargets: readonly ReleaseCheckpointTarget[],
  environment: NodeJS.ProcessEnv,
): Promise<number> {
  const outputPath = environment.GITHUB_OUTPUT?.trim()
  if (!outputPath) return Promise.resolve(0)
  return Bun.write(
    outputPath,
    `${REUSED_ARM64_OUTPUT}=${String(reusedTargets.includes("advanced-math-macos-arm64"))}\n${REUSED_X64_OUTPUT}=${String(reusedTargets.includes("advanced-math-macos-x64"))}\n`,
  )
}

async function previousPublishedReleaseTags(
  repository: string,
  currentTag: string,
): Promise<string[]> {
  const value =
    await Bun.$`gh release list --repo ${repository} --exclude-drafts --limit 100 --json tagName,publishedAt`
      .quiet()
      .json()
  return z
    .array(publishedReleaseSchema)
    .parse(value)
    .filter((release) => release.tagName !== currentTag)
    .toSorted((left, right) => right.publishedAt.localeCompare(left.publishedAt))
    .map((release) => release.tagName)
}

async function downloadedRuntimeIsValid(directory: string, archiveName: string): Promise<boolean> {
  const checksum = (await Bun.file(path.join(directory, `${archiveName}.sha256`)).text())
    .trim()
    .split(/\s+/u)[0]
  return Boolean(
    checksum &&
    normalizeSha256Digest(checksum) === (await sha256File(path.join(directory, archiveName))),
  )
}

async function tryReuseTarget(input: {
  dryRun: boolean
  environment: NodeJS.ProcessEnv
  previousAssets: readonly GithubReleaseAsset[]
  previousFreeze: ReleaseFreeze
  previousPlan: ReleasePlan | undefined
  previousTag: string
  repository: string
  target: ReleaseCheckpointTarget
  temporaryDirectory: string
}): Promise<boolean> {
  if (
    !input.dryRun &&
    (await inspectReleaseCheckpoint({ environment: input.environment, target: input.target }))
  ) {
    return true
  }
  if (!input.previousPlan) return false

  const names = expectedCheckpointAssetNames(
    input.target,
    requiredEnvironmentValue(input.environment, "BUDDY_VERSION"),
    resolveAdvancedMathRuntimeVersion(),
  )
  if (!names.every((name) => input.previousAssets.some((asset) => asset.name === name)))
    return false

  const previousRunner =
    input.target === "advanced-math-macos-arm64"
      ? input.previousPlan.toolchain.runners.macosArm64
      : input.previousPlan.toolchain.runners.macosX64
  const currentRunner = requiredEnvironmentValue(
    input.environment,
    input.target === "advanced-math-macos-arm64"
      ? "BUDDY_RELEASE_RUNNER_MACOS_ARM64"
      : "BUDDY_RELEASE_RUNNER_MACOS_X64",
  )
  if (previousRunner !== currentRunner) return false

  try {
    for (const name of names) {
      await downloadReleaseAsset({
        directory: input.temporaryDirectory,
        name,
        repository: input.repository,
        tag: input.previousTag,
      })
    }
    const downloadedAssets = await Promise.all(
      names.map((name) => localReleaseAssetDigest(path.join(input.temporaryDirectory, name))),
    )
    assertAssetDigestSet({
      actual: downloadedAssets,
      expected: input.previousFreeze.assets.filter((asset) => names.includes(asset.name)),
      label: `Reusable advanced math assets from ${input.previousTag}`,
    })
    const archiveName = names.find((name) => name.endsWith(".zip"))
    if (!archiveName || !(await downloadedRuntimeIsValid(input.temporaryDirectory, archiveName))) {
      return false
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`Advanced math target ${input.target} cannot be reused: ${message}`)
    return false
  }

  if (input.dryRun) return true

  await recordReleaseCheckpoint({
    environment: {
      ...input.environment,
      BUDDY_RELEASE_ASSET_DIR: input.temporaryDirectory,
    },
    target: input.target,
  })
  return true
}

async function readReusablePreviousPlan(input: {
  environment: NodeJS.ProcessEnv
  previousAssets: readonly GithubReleaseAsset[]
  previousTag: string
  repository: string
  temporaryDirectory: string
}): Promise<{ freeze: ReleaseFreeze; plan: ReleasePlan } | undefined> {
  if (
    !input.previousAssets.some((asset) => asset.name === RELEASE_PLAN_FILENAME) ||
    !input.previousAssets.some((asset) => asset.name === RELEASE_FREEZE_FILENAME)
  ) {
    return undefined
  }

  try {
    const previousDirectory = path.join(input.temporaryDirectory, "previous-release")
    const freeze = await verifyReleaseFreeze({
      directory: previousDirectory,
      repository: input.repository,
      tag: input.previousTag,
    })
    const planPath = await downloadReleaseAsset({
      directory: previousDirectory,
      name: RELEASE_PLAN_FILENAME,
      repository: input.repository,
      tag: input.previousTag,
    })
    const plan = parseReleasePlan(JSON.parse(await Bun.file(planPath).text()))
    const matches = advancedMathPlanCanBeReused({
      currentInputSha256: await hashAdvancedMathInputs(),
      currentPythonVersion: requiredEnvironmentValue(
        input.environment,
        "BUDDY_RELEASE_PYTHON_VERSION",
      ),
      currentRuntimeVersion: resolveAdvancedMathRuntimeVersion(),
      previousPlan: plan,
    })
    return matches ? { freeze, plan } : undefined
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`Previous advanced math plan cannot be reused: ${message}`)
    return undefined
  }
}

async function main(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const targets = selectedTargets(environment)
  if (targets.length === 0) {
    await writeReuseOutputs([], environment)
    console.log("Advanced math reuse skipped")
    return
  }

  const repository = requiredEnvironmentValue(environment, "BUDDY_RELEASE_REPO")
  const tag = requiredEnvironmentValue(environment, "BUDDY_RELEASE_TAG")
  const dryRun = environment.BUDDY_RELEASE_DRY_RUN?.trim() === TRUE_ENV_VALUE
  if (!dryRun) {
    const release = await readGithubReleaseState(repository, tag)
    if (release.assets.some((asset) => asset.name === RELEASE_FREEZE_FILENAME)) {
      await writeReuseOutputs([], environment)
      console.log(`Advanced math reuse skipped for frozen release ${tag}`)
      return
    }
    if (!release.isDraft) throw new Error(`Published release ${repository}@${tag} has no freeze`)
  }

  const previousTags = await previousPublishedReleaseTags(repository, tag)
  if (previousTags.length === 0) {
    await writeReuseOutputs([], environment)
    console.log("No previous published release can provide advanced math runtime assets")
    return
  }

  const temporaryDirectory = requiredEnvironmentValue(environment, "RUNNER_TEMP")
  let reusableRelease:
    | {
        assets: GithubReleaseAsset[]
        freeze: ReleaseFreeze
        plan: ReleasePlan
        tag: string
      }
    | undefined
  for (const previousTag of previousTags) {
    const previousAssets = await readGithubReleaseAssets(repository, previousTag)
    const reusable = await readReusablePreviousPlan({
      environment,
      previousAssets,
      previousTag,
      repository,
      temporaryDirectory,
    })
    if (reusable) {
      reusableRelease = {
        assets: previousAssets,
        freeze: reusable.freeze,
        plan: reusable.plan,
        tag: previousTag,
      }
      break
    }
  }
  if (!reusableRelease) {
    await writeReuseOutputs([], environment)
    console.log("No compatible frozen published release can provide advanced math runtimes")
    return
  }
  const reused = await Promise.all(
    targets.map((target) =>
      tryReuseTarget({
        dryRun,
        environment,
        previousAssets: reusableRelease.assets,
        previousFreeze: reusableRelease.freeze,
        previousPlan: reusableRelease.plan,
        previousTag: reusableRelease.tag,
        repository,
        target,
        temporaryDirectory,
      }),
    ),
  )
  const reusedTargets = targets.filter((_, index) => reused[index])
  await writeReuseOutputs(reusedTargets, environment)
  console.log(`Reused ${reusedTargets.length}/${targets.length} advanced math targets`)
}

if (import.meta.main) {
  await main()
}
