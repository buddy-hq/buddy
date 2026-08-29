#!/usr/bin/env bun

import { $ } from "bun"
import { createHash } from "node:crypto"
import path from "node:path"
import { z } from "zod"
import { resolveAdvancedMathRuntimeVersion } from "../../packages/buddy/script/advanced-math-version"
import {
  downloadReleaseAsset,
  readGithubReleaseAssets,
  sha256File,
  uploadReleaseAssetSafely,
} from "./assets"
import { appendGithubOutputs } from "./github-output"
import { normalizeReleaseSourceSha } from "./preflight"

export const RELEASE_PLAN_FILENAME = "buddy-release-plan.json"
const RELEASE_PLAN_SCHEMA_VERSION = 1
const TRUE_ENV_VALUE = "1"
const ROOT_DIRECTORY = path.resolve(import.meta.dir, "../..")
const ADVANCED_MATH_INPUT_PATHS = [
  "packages/buddy/script/build-advanced-math-runtime.ts",
  "packages/buddy/src/local-runtimes/advanced-math/runtime/main.py",
] as const

const releaseTargetSelectionSchema = z.object({
  macosArm64: z.boolean(),
  macosX64: z.boolean(),
  windowsX64: z.boolean(),
})

const releasePlanToolchainIdentitySchema = z.object({
  bun: z.string().min(1),
  python: z.string().min(1),
})

const releasePlanToolchainSchema = releasePlanToolchainIdentitySchema.extend({
  runners: z.object({
    macosArm64: z.string().min(1),
    macosX64: z.string().min(1),
    windowsX64: z.string().min(1),
  }),
})

const releasePlanIdentitySchema = z.object({
  advancedMathInputSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  advancedMathVersion: z.string().min(1),
  releaseDate: z.string().datetime({ offset: true }),
  schemaVersion: z.literal(RELEASE_PLAN_SCHEMA_VERSION),
  sourceRepository: z.string().min(1),
  sourceSha: z.string().regex(/^[0-9a-f]{40}$/u),
  tag: z.string().regex(/^v\d+\.\d+\.\d+$/u),
  targets: releaseTargetSelectionSchema,
  toolchain: releasePlanToolchainIdentitySchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
})

const releasePlanSchema = releasePlanIdentitySchema.extend({
  createdBy: z.object({
    repository: z.string().min(1),
    runAttempt: z.string().min(1),
    runId: z.string().min(1),
    workflow: z.string().min(1),
  }),
  toolchain: releasePlanToolchainSchema,
})

export type ReleasePlanIdentity = z.infer<typeof releasePlanIdentitySchema>
export type ReleasePlan = z.infer<typeof releasePlanSchema>
export type ReleaseTargetSelection = z.infer<typeof releaseTargetSelectionSchema>

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim()
  if (!value) throw new Error(`${key} is required`)
  return value
}

function requiredBooleanEnvironmentValue(environment: NodeJS.ProcessEnv, key: string): boolean {
  const value = requiredEnvironmentValue(environment, key)
  if (value === "true" || value === TRUE_ENV_VALUE) return true
  if (value === "false" || value === "0") return false
  throw new Error(`${key} must be true or false`)
}

export function parseReleasePlan<TValue>(value: TValue): ReleasePlan {
  const parsed = releasePlanSchema.safeParse(value)
  if (!parsed.success) throw new Error("Invalid Buddy release plan")
  return parsed.data
}

export function releasePlanIdentity(plan: ReleasePlan): ReleasePlanIdentity {
  return releasePlanIdentitySchema.parse(plan)
}

export function assertMatchingReleasePlanIdentity(
  actual: ReleasePlan,
  expected: ReleasePlanIdentity,
): void {
  const actualIdentity = releasePlanIdentity(actual)
  if (JSON.stringify(actualIdentity) !== JSON.stringify(expected)) {
    throw new Error(
      `Existing release plan does not match this release request. Existing: ${JSON.stringify(actualIdentity)} Requested: ${JSON.stringify(expected)}`,
    )
  }
}

export function renderReleasePlan(plan: ReleasePlan): string {
  return `${JSON.stringify(parseReleasePlan(plan), null, 2)}\n`
}

export function releasePlanDigest(plan: ReleasePlan): string {
  return createHash("sha256")
    .update(`${JSON.stringify(releasePlanIdentity(plan), null, 2)}\n`)
    .digest("hex")
}

export async function hashAdvancedMathInputs(rootDirectory = ROOT_DIRECTORY): Promise<string> {
  const hash = createHash("sha256")
  for (const relativePath of ADVANCED_MATH_INPUT_PATHS) {
    const filePath = path.join(rootDirectory, relativePath)
    hash.update(relativePath)
    hash.update("\0")
    hash.update(await sha256File(filePath))
    hash.update("\0")
  }
  return hash.digest("hex")
}

async function sourceReleaseDate(sourceSha: string): Promise<string> {
  const value = await $`git show -s --format=%cI ${sourceSha}`
    .cwd(ROOT_DIRECTORY)
    .text()
    .then((output) => output.trim())
  const parsed = z.string().datetime({ offset: true }).parse(value)
  return new Date(parsed).toISOString()
}

async function expectedPlanIdentity(environment: NodeJS.ProcessEnv): Promise<ReleasePlanIdentity> {
  const version = requiredEnvironmentValue(environment, "BUDDY_VERSION")
  const sourceSha = normalizeReleaseSourceSha(
    requiredEnvironmentValue(environment, "BUDDY_RELEASE_SOURCE_SHA"),
  )
  const identity = {
    advancedMathInputSha256: await hashAdvancedMathInputs(),
    advancedMathVersion: resolveAdvancedMathRuntimeVersion(),
    releaseDate: await sourceReleaseDate(sourceSha),
    schemaVersion: RELEASE_PLAN_SCHEMA_VERSION,
    sourceRepository: requiredEnvironmentValue(environment, "BUDDY_RELEASE_SOURCE_REPOSITORY"),
    sourceSha,
    tag: requiredEnvironmentValue(environment, "BUDDY_RELEASE_TAG"),
    targets: {
      macosArm64: requiredBooleanEnvironmentValue(environment, "BUDDY_RELEASE_TARGET_MACOS_ARM64"),
      macosX64: requiredBooleanEnvironmentValue(environment, "BUDDY_RELEASE_TARGET_MACOS_X64"),
      windowsX64: requiredBooleanEnvironmentValue(environment, "BUDDY_RELEASE_TARGET_WINDOWS_X64"),
    },
    toolchain: {
      bun: requiredEnvironmentValue(environment, "BUDDY_RELEASE_BUN_VERSION"),
      python: requiredEnvironmentValue(environment, "BUDDY_RELEASE_PYTHON_VERSION"),
    },
    version,
  }
  return releasePlanIdentitySchema.parse(identity)
}

function planForCurrentRun(
  identity: ReleasePlanIdentity,
  environment: NodeJS.ProcessEnv,
): ReleasePlan {
  return parseReleasePlan({
    ...identity,
    createdBy: {
      repository: requiredEnvironmentValue(environment, "GITHUB_REPOSITORY"),
      runAttempt: requiredEnvironmentValue(environment, "GITHUB_RUN_ATTEMPT"),
      runId: requiredEnvironmentValue(environment, "GITHUB_RUN_ID"),
      workflow: requiredEnvironmentValue(environment, "GITHUB_WORKFLOW"),
    },
    toolchain: {
      ...identity.toolchain,
      runners: {
        macosArm64: requiredEnvironmentValue(environment, "BUDDY_RELEASE_RUNNER_MACOS_ARM64"),
        macosX64: requiredEnvironmentValue(environment, "BUDDY_RELEASE_RUNNER_MACOS_X64"),
        windowsX64: requiredEnvironmentValue(environment, "BUDDY_RELEASE_RUNNER_WINDOWS_X64"),
      },
    },
  })
}

async function writeOutputs(plan: ReleasePlan, environment: NodeJS.ProcessEnv): Promise<void> {
  await appendGithubOutputs(environment, [
    `plan_digest=${releasePlanDigest(plan)}`,
    `release_date=${plan.releaseDate}`,
  ])
}

async function main(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const identity = await expectedPlanIdentity(environment)
  const dryRun = environment.BUDDY_RELEASE_DRY_RUN?.trim() === TRUE_ENV_VALUE
  if (dryRun) {
    const plan = planForCurrentRun(identity, environment)
    await writeOutputs(plan, environment)
    console.log(`Dry run: validated release plan for ${plan.tag}@${plan.sourceSha}`)
    return
  }

  const repository = requiredEnvironmentValue(environment, "BUDDY_RELEASE_REPO")
  const assets = await readGithubReleaseAssets(repository, identity.tag)
  const existingPlanAsset = assets.find((asset) => asset.name === RELEASE_PLAN_FILENAME)
  let plan: ReleasePlan

  if (existingPlanAsset) {
    const temporaryDirectory = requiredEnvironmentValue(environment, "RUNNER_TEMP")
    const planPath = await downloadReleaseAsset({
      directory: temporaryDirectory,
      name: RELEASE_PLAN_FILENAME,
      repository,
      tag: identity.tag,
    })
    plan = parseReleasePlan(JSON.parse(await Bun.file(planPath).text()))
    assertMatchingReleasePlanIdentity(plan, identity)
  } else {
    if (assets.length > 0) {
      throw new Error(
        `Release ${identity.tag} has assets but no ${RELEASE_PLAN_FILENAME}; refusing to adopt an unplanned draft`,
      )
    }
    plan = planForCurrentRun(identity, environment)
    const outputPath = path.join(
      requiredEnvironmentValue(environment, "RUNNER_TEMP"),
      RELEASE_PLAN_FILENAME,
    )
    await Bun.write(outputPath, renderReleasePlan(plan))
    await uploadReleaseAssetSafely({ filePath: outputPath, repository, tag: identity.tag })
  }

  await writeOutputs(plan, environment)
  console.log(`Verified immutable release plan ${releasePlanDigest(plan)} for ${plan.tag}`)
}

if (import.meta.main) {
  await main()
}
