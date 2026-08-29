#!/usr/bin/env bun

import { $ } from "bun"
import { z } from "zod"

const RELEASE_BRANCH = "main"
export const REQUIRED_RELEASE_CHECKS = ["Check", "vendor-guard"] as const

const checkRunSchema = z.object({
  conclusion: z.string().nullable(),
  name: z.string(),
  status: z.string(),
})

const checkRunsResponseSchema = z.object({
  check_runs: z.array(checkRunSchema),
})

const githubComparisonSchema = z.object({
  status: z.enum(["ahead", "behind", "diverged", "identical"]),
})

export type GithubCheckRun = z.infer<typeof checkRunSchema>

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim()
  if (!value) throw new Error(`${key} is required`)
  return value
}

export function normalizeReleaseSourceSha(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!/^[0-9a-f]{40}$/u.test(normalized)) {
    throw new Error("Release source SHA must be a full 40-character Git commit SHA")
  }
  return normalized
}

export function assertRequiredReleaseChecks(checkRuns: readonly GithubCheckRun[]): void {
  const failures: string[] = []
  for (const requiredName of REQUIRED_RELEASE_CHECKS) {
    const matches = checkRuns.filter((checkRun) => checkRun.name === requiredName)
    if (
      matches.length === 0 ||
      !matches.every(
        (checkRun) => checkRun.status === "completed" && checkRun.conclusion === "success",
      )
    ) {
      const states = matches.map(
        (checkRun) => `${checkRun.status}/${checkRun.conclusion ?? "pending"}`,
      )
      failures.push(`${requiredName}=${states.join(",") || "missing"}`)
    }
  }

  if (failures.length > 0) {
    throw new Error(`Release source has not passed required checks: ${failures.join("; ")}`)
  }
}

export async function readCommitCheckRuns(
  repository: string,
  sourceSha: string,
): Promise<GithubCheckRun[]> {
  const response =
    await $`gh api --paginate --slurp --method GET ${`repos/${repository}/commits/${sourceSha}/check-runs`} -f per_page=100 -f filter=latest`
      .quiet()
      .json()
  return z
    .array(checkRunsResponseSchema)
    .parse(response)
    .flatMap((page) => page.check_runs)
}

export function assertReleaseSourceIsOnMain(
  status: "ahead" | "behind" | "diverged" | "identical",
): void {
  if (status !== "ahead" && status !== "identical") {
    throw new Error(`Release source is not an ancestor of ${RELEASE_BRANCH}: ${status}`)
  }
}

export async function assertReleaseSourceRemainsOnMain(
  repository: string,
  sourceSha: string,
): Promise<void> {
  const comparison =
    await $`gh api ${`repos/${repository}/compare/${sourceSha}...${RELEASE_BRANCH}`}`.quiet().json()
  assertReleaseSourceIsOnMain(githubComparisonSchema.parse(comparison).status)
}

export async function assertGreenMainReleaseSource(input: {
  repository: string
  sourceSha: string
}): Promise<void> {
  const sourceSha = normalizeReleaseSourceSha(input.sourceSha)
  await Promise.all([
    assertReleaseSourceRemainsOnMain(input.repository, sourceSha),
    readCommitCheckRuns(input.repository, sourceSha).then(assertRequiredReleaseChecks),
  ])
}

async function main(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const sourceSha = normalizeReleaseSourceSha(
    requiredEnvironmentValue(environment, "BUDDY_RELEASE_SOURCE_SHA"),
  )
  const refName = requiredEnvironmentValue(environment, "GITHUB_REF_NAME")
  if (refName !== RELEASE_BRANCH) {
    throw new Error(
      `Release workflow must be dispatched from ${RELEASE_BRANCH}, received ${refName}`,
    )
  }

  const repository = requiredEnvironmentValue(environment, "BUDDY_RELEASE_SOURCE_REPOSITORY")
  await assertGreenMainReleaseSource({ repository, sourceSha })
  console.log(
    `Verified ${repository}@${sourceSha} is a green ${RELEASE_BRANCH} commit (${REQUIRED_RELEASE_CHECKS.join(", ")})`,
  )
}

if (import.meta.main) {
  await main()
}
