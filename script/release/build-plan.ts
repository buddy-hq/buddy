#!/usr/bin/env bun

import { inspectReleaseCheckpoint, type ReleaseCheckpointTarget } from "./checkpoint"
import { readGithubReleaseState } from "./assets"
import { RELEASE_FREEZE_FILENAME } from "./constants"
import { verifyReleaseFreeze } from "./freeze"

const TRUE_ENV_VALUE = "1"
const RELEASE_BUILD_PLAN_SCOPES = ["all", "non-math", "advanced-math"] as const
type ReleaseBuildPlanScope = (typeof RELEASE_BUILD_PLAN_SCOPES)[number]

type ElectronBuild = {
  architecture: "arm64" | "x64"
  checkpoint: ReleaseCheckpointTarget
  platform: "darwin" | "win32"
  runner: string
  target: "macos-arm64" | "macos-x64" | "windows-x64"
}

type AdvancedMathBuild = {
  checkpoint: ReleaseCheckpointTarget
  runner: string
  target: "aarch64-apple-darwin" | "x86_64-apple-darwin"
}

type ElectronBuildSpec = Omit<ElectronBuild, "runner"> & {
  runnerKey: string
  selectionKey: string
}

type AdvancedMathBuildSpec = Omit<AdvancedMathBuild, "runner"> & {
  reuseKey: string
  runnerKey: string
  selectionKey: string
}

export type ReleaseBuildPlan = {
  advancedMath: AdvancedMathBuild[]
  buildStandards: boolean
  electron: ElectronBuild[]
  frozen: boolean
}

const ELECTRON_BUILD_TARGETS: readonly ElectronBuildSpec[] = [
  {
    architecture: "arm64",
    checkpoint: "electron-macos-arm64",
    platform: "darwin",
    runnerKey: "BUDDY_RELEASE_RUNNER_MACOS_ARM64",
    selectionKey: "BUDDY_RELEASE_TARGET_MACOS_ARM64",
    target: "macos-arm64",
  },
  {
    architecture: "x64",
    checkpoint: "electron-macos-x64",
    platform: "darwin",
    runnerKey: "BUDDY_RELEASE_RUNNER_MACOS_X64",
    selectionKey: "BUDDY_RELEASE_TARGET_MACOS_X64",
    target: "macos-x64",
  },
  {
    architecture: "x64",
    checkpoint: "electron-windows-x64",
    platform: "win32",
    runnerKey: "BUDDY_RELEASE_RUNNER_WINDOWS_X64",
    selectionKey: "BUDDY_RELEASE_TARGET_WINDOWS_X64",
    target: "windows-x64",
  },
] as const

const ADVANCED_MATH_BUILD_TARGETS: readonly AdvancedMathBuildSpec[] = [
  {
    checkpoint: "advanced-math-macos-arm64",
    reuseKey: "BUDDY_RELEASE_REUSED_MATH_MACOS_ARM64",
    runnerKey: "BUDDY_RELEASE_RUNNER_MACOS_ARM64",
    selectionKey: "BUDDY_RELEASE_TARGET_MACOS_ARM64",
    target: "aarch64-apple-darwin",
  },
  {
    checkpoint: "advanced-math-macos-x64",
    reuseKey: "BUDDY_RELEASE_REUSED_MATH_MACOS_X64",
    runnerKey: "BUDDY_RELEASE_RUNNER_MACOS_X64",
    selectionKey: "BUDDY_RELEASE_TARGET_MACOS_X64",
    target: "x86_64-apple-darwin",
  },
] as const

function requiredBooleanEnvironmentValue(environment: NodeJS.ProcessEnv, key: string): boolean {
  const value = environment[key]?.trim()
  if (value === "true" || value === TRUE_ENV_VALUE) return true
  if (value === "false" || value === "0") return false
  throw new Error(`${key} must be true or false`)
}

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim()
  if (!value) throw new Error(`${key} is required`)
  return value
}

function isDefined<TValue>(value: TValue | undefined): value is TValue {
  return value !== undefined
}

async function checkpointIsReusable(
  target: ReleaseCheckpointTarget,
  environment: NodeJS.ProcessEnv,
): Promise<boolean> {
  return inspectReleaseCheckpoint({ environment, target })
}

async function assertFrozenReleaseIsComplete(
  environment: NodeJS.ProcessEnv,
  selectedCheckpoints: readonly ReleaseCheckpointTarget[],
): Promise<void> {
  const repository = requiredEnvironmentValue(environment, "BUDDY_RELEASE_REPO")
  const tag = requiredEnvironmentValue(environment, "BUDDY_RELEASE_TAG")
  await verifyReleaseFreeze({
    directory: requiredEnvironmentValue(environment, "RUNNER_TEMP"),
    repository,
    tag,
  })
  const checkpoints: ReleaseCheckpointTarget[] = [...selectedCheckpoints, "standards"]
  const validity = await Promise.all(
    checkpoints.map((target) => inspectReleaseCheckpoint({ environment, target })),
  )
  if (validity.some((valid) => !valid)) {
    throw new Error(`Frozen release ${repository}@${tag} is missing a required checkpoint`)
  }
}

export async function resolveReleaseBuildPlan(
  environment: NodeJS.ProcessEnv = process.env,
  scope: ReleaseBuildPlanScope = "all",
): Promise<ReleaseBuildPlan> {
  const selectedElectron = ELECTRON_BUILD_TARGETS.filter((target) =>
    requiredBooleanEnvironmentValue(environment, target.selectionKey),
  )
  const selectedAdvancedMath = ADVANCED_MATH_BUILD_TARGETS.filter((target) =>
    requiredBooleanEnvironmentValue(environment, target.selectionKey),
  )
  const dryRun = environment.BUDDY_RELEASE_DRY_RUN?.trim() === TRUE_ENV_VALUE

  if (!dryRun) {
    const repository = requiredEnvironmentValue(environment, "BUDDY_RELEASE_REPO")
    const tag = requiredEnvironmentValue(environment, "BUDDY_RELEASE_TAG")
    const release = await readGithubReleaseState(repository, tag)
    const frozen = release.assets.some((asset) => asset.name === RELEASE_FREEZE_FILENAME)
    if (frozen) {
      await assertFrozenReleaseIsComplete(environment, [
        ...selectedElectron.map((target) => target.checkpoint),
        ...selectedAdvancedMath.map((target) => target.checkpoint),
      ])
      return { advancedMath: [], buildStandards: false, electron: [], frozen: true }
    }
    if (!release.isDraft) {
      throw new Error(`Published release ${repository}@${tag} has no immutable freeze`)
    }
  }

  const electron =
    scope === "advanced-math"
      ? []
      : (
          await Promise.all(
            selectedElectron.map(async (target): Promise<ElectronBuild | undefined> => {
              if (!dryRun && (await checkpointIsReusable(target.checkpoint, environment))) {
                return undefined
              }
              return {
                architecture: target.architecture,
                checkpoint: target.checkpoint,
                platform: target.platform,
                runner: requiredEnvironmentValue(environment, target.runnerKey),
                target: target.target,
              }
            }),
          )
        ).filter(isDefined)

  const advancedMath =
    scope === "non-math"
      ? []
      : (
          await Promise.all(
            selectedAdvancedMath.map(async (target): Promise<AdvancedMathBuild | undefined> => {
              if (
                environment[target.reuseKey]?.trim() === "true" ||
                (!dryRun && (await checkpointIsReusable(target.checkpoint, environment)))
              ) {
                return undefined
              }
              return {
                checkpoint: target.checkpoint,
                runner: requiredEnvironmentValue(environment, target.runnerKey),
                target: target.target,
              }
            }),
          )
        ).filter(isDefined)

  return {
    advancedMath,
    buildStandards:
      scope === "advanced-math"
        ? false
        : dryRun || !(await checkpointIsReusable("standards", environment)),
    electron,
    frozen: false,
  }
}

async function writeOutputs(plan: ReleaseBuildPlan, environment: NodeJS.ProcessEnv): Promise<void> {
  const outputPath = environment.GITHUB_OUTPUT?.trim()
  if (!outputPath) return
  await Bun.write(
    outputPath,
    `${[
      `any_electron=${String(plan.electron.length > 0)}`,
      `any_math=${String(plan.advancedMath.length > 0)}`,
      `build_standards=${String(plan.buildStandards)}`,
      `electron_matrix=${JSON.stringify({ include: plan.electron })}`,
      `frozen=${String(plan.frozen)}`,
      `math_matrix=${JSON.stringify({ include: plan.advancedMath })}`,
    ].join("\n")}\n`,
  )
}

if (import.meta.main) {
  const requestedScope = process.argv[2]?.trim() || "all"
  const scope = RELEASE_BUILD_PLAN_SCOPES.find((candidate) => candidate === requestedScope)
  if (!scope) {
    throw new Error(
      `Usage: bun ./script/release/build-plan.ts [${RELEASE_BUILD_PLAN_SCOPES.join("|")}]`,
    )
  }
  const plan = await resolveReleaseBuildPlan(process.env, scope)
  await writeOutputs(plan, process.env)
  console.log(JSON.stringify(plan, null, 2))
}
