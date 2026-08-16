#!/usr/bin/env bun

import { $ } from "bun"
import { appendFile } from "node:fs/promises"
import { z } from "zod"
import { isJsonObject, parseTString } from "./parse-values"

const RUN_ID_ENV_KEY = "GITHUB_RUN_ID"
const REPOSITORY_ENV_KEY = "GITHUB_REPOSITORY"
const STEP_SUMMARY_ENV_KEY = "GITHUB_STEP_SUMMARY"
const TRANSPORT_ENV_KEY = "BUDDY_RELEASE_TRANSPORT"
const VERSION_ENV_KEY = "BUDDY_VERSION"
const MACOS_ARM64_TARGET_ENV_KEY = "BUDDY_RELEASE_TARGET_MACOS_ARM64"
const MACOS_X64_TARGET_ENV_KEY = "BUDDY_RELEASE_TARGET_MACOS_X64"
const WINDOWS_X64_TARGET_ENV_KEY = "BUDDY_RELEASE_TARGET_WINDOWS_X64"

const BASELINE_WEIGHTED_MINUTES = 265
const LINUX_RUNNER_WEIGHT = 1
const WINDOWS_RUNNER_WEIGHT = 2
const MACOS_RUNNER_WEIGHT = 10
const SECONDS_PER_MINUTE = 60
const MILLISECONDS_PER_SECOND = 1_000
const RUNNER_WEIGHT_DECIMAL_PLACES = 1
const DURATION_DECIMAL_PLACES = 1

type GithubRunView = {
  jobs: GithubRunJob[]
}

type GithubRunJob = {
  completedAt: string | undefined
  conclusion: string | undefined
  name: string
  startedAt: string | undefined
  status: string | undefined
}

type JobTiming = {
  conclusion: string | undefined
  durationSeconds: number | undefined
  name: string
  status: string | undefined
  weightedMinutes: number | undefined
  weight: number
}

const optionalStringSchema = z.string().optional().nullable()
const githubRunJobSchema = z.object({
  completedAt: optionalStringSchema,
  conclusion: optionalStringSchema,
  name: z.string(),
  startedAt: optionalStringSchema,
  status: optionalStringSchema,
})
const githubRunViewSchema = z.object({
  jobs: z.array(z.unknown()),
})

const runId = readRequiredEnvironmentVariable(RUN_ID_ENV_KEY)
const repository = readRequiredEnvironmentVariable(REPOSITORY_ENV_KEY)
const transport = readOptionalEnvironmentVariable(TRANSPORT_ENV_KEY) || "unknown"
const version = readOptionalEnvironmentVariable(VERSION_ENV_KEY) || "unknown"

const runViewJson = await $`gh run view ${runId} --repo ${repository} --json jobs`.text()
const runView = parseGithubRunView(JSON.parse(runViewJson))
const timings = runView.jobs.map(toJobTiming)
const completedWeightedMinutes = timings.reduce((total, timing) => {
  return total + (timing.weightedMinutes ?? 0)
}, 0)
const delta = BASELINE_WEIGHTED_MINUTES - completedWeightedMinutes
const reductionPercent = (delta / BASELINE_WEIGHTED_MINUTES) * 100

const report = [
  "## Release dry-run cost report",
  "",
  `- Version: ${version}`,
  `- Transport: ${transport}`,
  `- macOS ARM64: ${readOptionalEnvironmentVariable(MACOS_ARM64_TARGET_ENV_KEY) || "unknown"}`,
  `- macOS x64: ${readOptionalEnvironmentVariable(MACOS_X64_TARGET_ENV_KEY) || "unknown"}`,
  `- Windows x64: ${readOptionalEnvironmentVariable(WINDOWS_X64_TARGET_ENV_KEY) || "unknown"}`,
  `- Baseline full publish-cheap estimate: ${formatNumber(BASELINE_WEIGHTED_MINUTES)} weighted minutes`,
  `- Current completed-job estimate: ${formatNumber(completedWeightedMinutes)} weighted minutes`,
  `- Estimated reduction vs baseline: ${formatSignedNumber(delta)} weighted minutes (${formatSignedNumber(
    reductionPercent,
  )}%)`,
  "",
  "| Job | Status | Unweighted runtime | Runner weight | Weighted minutes |",
  "| --- | --- | ---: | ---: | ---: |",
  ...timings.map(formatTimingRow),
  "",
  "Dry-run safety notes:",
  "",
  "- No GitHub Release was created, edited, published, tagged, or synced.",
  "- Release asset uploads, Actions artifact uploads, and release asset redownload verification are skipped in dry-run mode.",
  "- Use the completed GitHub run timings for the final exact comparison because this report can run before the finalizer job itself has completed.",
  "",
].join("\n")

const summaryPath = readOptionalEnvironmentVariable(STEP_SUMMARY_ENV_KEY)
if (summaryPath) {
  await appendFile(summaryPath, report)
}

console.log(report)

function toJobTiming(job: GithubRunJob): JobTiming {
  const normalizedName = normalizeJobName(job.name)
  const durationSeconds = resolveDurationSeconds(job.startedAt, job.completedAt)
  const weight = inferRunnerWeight(normalizedName)
  const weightedMinutes =
    durationSeconds === undefined ? undefined : (durationSeconds / SECONDS_PER_MINUTE) * weight

  return {
    conclusion: job.conclusion,
    durationSeconds,
    name: normalizedName,
    status: job.status,
    weightedMinutes,
    weight,
  }
}

function normalizeJobName(name: string): string {
  const separator = " / "
  if (!name.includes(separator)) {
    return name
  }

  return name.split(separator).at(-1) || name
}

function inferRunnerWeight(jobName: string): number {
  const lowerName = jobName.toLowerCase()
  if (lowerName.includes("macos")) {
    return MACOS_RUNNER_WEIGHT
  }

  if (lowerName.includes("windows")) {
    return WINDOWS_RUNNER_WEIGHT
  }

  return LINUX_RUNNER_WEIGHT
}

function resolveDurationSeconds(
  startedAt: string | undefined,
  completedAt: string | undefined,
): number | undefined {
  if (!startedAt || !completedAt) {
    return undefined
  }

  const startedAtTime = Date.parse(startedAt)
  const completedAtTime = Date.parse(completedAt)
  if (Number.isNaN(startedAtTime) || Number.isNaN(completedAtTime)) {
    return undefined
  }

  return Math.max(0, (completedAtTime - startedAtTime) / MILLISECONDS_PER_SECOND)
}

function formatTimingRow(timing: JobTiming): string {
  return [
    escapeTableCell(timing.name),
    escapeTableCell(formatStatus(timing)),
    timing.durationSeconds === undefined ? "pending" : `${formatNumber(timing.durationSeconds)}s`,
    String(timing.weight),
    timing.weightedMinutes === undefined
      ? "pending"
      : formatNumber(timing.weightedMinutes, RUNNER_WEIGHT_DECIMAL_PLACES),
  ].join(" | ")
}

function formatStatus(timing: JobTiming): string {
  if (timing.conclusion) {
    return timing.conclusion
  }

  return timing.status || "unknown"
}

function formatNumber(value: number, decimalPlaces = DURATION_DECIMAL_PLACES): string {
  return value.toFixed(decimalPlaces)
}

function formatSignedNumber(value: number): string {
  const formatted = formatNumber(value)
  return value > 0 ? `+${formatted}` : formatted
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|")
}

function parseGithubRunView<TValue>(value: TValue): GithubRunView {
  const parsed = githubRunViewSchema.safeParse(value)
  if (!parsed.success) {
    if (!isJsonObject(value)) {
      throw new Error("GitHub run view response was not an object")
    }
    throw new Error("GitHub run view response was missing jobs")
  }

  return {
    jobs: parsed.data.jobs.map(parseGithubRunJob),
  }
}

function parseOptionalJobString<TValue>(value: TValue): string | undefined {
  if (value === undefined || value === null) return undefined
  return parseTString(value)
}

function parseGithubRunJob<TValue>(value: TValue): GithubRunJob {
  const parsed = githubRunJobSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(
      isJsonObject(value)
        ? "GitHub run job entry was missing timing fields"
        : "GitHub run job entry was not an object",
    )
  }

  return {
    completedAt: parseOptionalJobString(parsed.data.completedAt),
    conclusion: parseOptionalJobString(parsed.data.conclusion),
    name: parsed.data.name,
    startedAt: parseOptionalJobString(parsed.data.startedAt),
    status: parseOptionalJobString(parsed.data.status),
  }
}

function readRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

function readOptionalEnvironmentVariable(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value || undefined
}
