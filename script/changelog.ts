#!/usr/bin/env bun

import { $ } from "bun"
import { z } from "zod"
import {
  latestReleaseVersionFromReleases as selectLatestReleaseVersionFromReleases,
  type GithubReleaseVersion,
  type LatestReleaseVersionInput,
} from "@buddy/script/release-version"
import {
  assertReleaseTag,
  formatBetaReleaseBody,
  formatReleaseTag,
  highestStreamReleaseVersion,
  parseReleaseTag,
  readBetaReleaseBody,
} from "@buddy/script/release-stream"
import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import { releaseDistribution, sourceReleaseTag } from "./release/distribution-guard"
import { releaseRepository } from "./release-repositories"
import { MAX_RELEASE_BODY_LENGTH } from "./release/notes"

type Commit = {
  hash: string
  message: string
  areas: Set<string>
}

const GithubReleaseRecordSchema = z.object({
  tag_name: z.string(),
  draft: z.boolean(),
  prerelease: z.boolean(),
})

const SECTION_PRIORITY = [
  "Desktop",
  "Backend",
  "Web",
  "UI",
  "Adapter/SDK",
  "Vendored Core",
] as const

const SECTION_RULES = [
  { prefix: "packages/desktop-electron/", section: "Desktop" },
  { prefix: "packages/buddy/", section: "Backend" },
  { prefix: "packages/web/", section: "Web" },
  { prefix: "packages/ui/", section: "UI" },
  { prefix: "packages/opencode-adapter/", section: "Adapter/SDK" },
  { prefix: "packages/sdk/", section: "Adapter/SDK" },
  { prefix: "vendor/opencode/", section: "Vendored Core" },
] as const

export function latestReleaseVersionFromReleases(
  releases: readonly GithubReleaseVersion[],
  input: LatestReleaseVersionInput = {},
): string | undefined {
  return selectLatestReleaseVersionFromReleases(releases, {
    includePrereleases: false,
    ...input,
  })
}

async function listGithubReleases(environment: NodeJS.ProcessEnv): Promise<GithubReleaseVersion[]> {
  const repo = releaseRepository(environment)
  const pages = await $`gh api --paginate --slurp ${`repos/${repo}/releases?per_page=100`}`.json()
  return z
    .array(z.array(GithubReleaseRecordSchema))
    .parse(pages)
    .flat()
    .map((release) => ({
      tagName: release.tag_name,
      isDraft: release.draft,
      isPrerelease: release.prerelease,
    }))
}

export async function getLatestRelease(
  skip?: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const releases = await listGithubReleases(environment)
  if (releaseDistribution(environment).id === "beta") {
    return highestStreamReleaseVersion(releaseDistribution(environment), releases, {
      skipVersion: skip,
    })
  }
  return latestReleaseVersionFromReleases(releases, { skip })
}

export async function getLatestPublishedRelease(
  skip?: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const releases = await listGithubReleases(environment)
  if (releaseDistribution(environment).id === "beta") {
    return highestStreamReleaseVersion(releaseDistribution(environment), releases, {
      skipVersion: skip,
    })
  }
  return latestReleaseVersionFromReleases(releases, {
    includePrereleases: true,
    skip,
  })
}

export function changelogSourceRef(
  version: string,
  sourceRef?: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (sourceRef !== undefined) return sourceRef
  const distribution = releaseDistribution(environment)
  const numericVersion = /^\d+\.\d+\.\d+$/u.test(version)
    ? version
    : (parseReleaseTag(distribution, version) ?? assertReleaseTag(distribution, version))
  return sourceReleaseTag(numericVersion, environment)
}

async function listCommitHashes(from: string | undefined, to = "HEAD", sourceRef?: string) {
  if (!from && !sourceRef) {
    return $`git rev-list --reverse ${to}`
      .text()
      .then((output) => output.split("\n").filter(Boolean))
  }

  const fromRef = changelogSourceRef(from ?? "", sourceRef)
  return $`git rev-list --reverse ${fromRef}..${to}`
    .text()
    .then((output) => output.split("\n").filter(Boolean))
}

export function isIgnoredCommit(message: string) {
  return /^(ignore:|test:|chore:|ci:|release:)/i.test(message)
}

function classifyAreas(files: string[]) {
  const areas = new Set<string>()

  for (const file of files) {
    for (const rule of SECTION_RULES) {
      if (!file.startsWith(rule.prefix)) continue
      areas.add(rule.section)
    }
  }

  return areas
}

async function getCommits(from: string | undefined, to = "HEAD", sourceRef?: string) {
  const hashes = await listCommitHashes(from, to, sourceRef)
  const commits: Commit[] = []

  for (const hash of hashes) {
    const message = await $`git log -n 1 --format=%s ${hash}`.text().then((output) => output.trim())
    if (!message || isIgnoredCommit(message)) continue

    const files = await $`git diff-tree --no-commit-id --name-only -r ${hash}`
      .text()
      .then((output) => output.split("\n").filter(Boolean))
    const areas = classifyAreas(files)
    if (areas.size === 0) continue

    commits.push({
      hash: hash.slice(0, 7),
      message,
      areas,
    })
  }

  return filterRevertedCommits(commits)
}

function filterRevertedCommits(commits: Commit[]) {
  const revertPattern = /^Revert "(.+)"$/
  const seen = new Map<string, Commit>()

  for (const commit of commits) {
    const match = commit.message.match(revertPattern)
    if (match) {
      const original = match[1]!
      if (seen.has(original)) seen.delete(original)
      else seen.set(commit.message, commit)
      continue
    }

    const revertMessage = `Revert "${commit.message}"`
    if (seen.has(revertMessage)) {
      seen.delete(revertMessage)
      continue
    }

    seen.set(commit.message, commit)
  }

  return [...seen.values()]
}

function sectionForAreas(areas: Set<string>) {
  for (const section of SECTION_PRIORITY) {
    if (areas.has(section)) return section
  }
  return "Backend"
}

export async function buildNotes(from: string | undefined, to = "HEAD", sourceRef?: string) {
  const commits = await getCommits(from, to, sourceRef)
  if (commits.length === 0) {
    return []
  }

  const grouped = new Map<string, string[]>()

  for (const commit of commits) {
    const section = sectionForAreas(commit.areas)
    if (!grouped.has(section)) grouped.set(section, [])
    grouped.get(section)!.push(`- ${commit.message}`)
  }

  const lines: string[] = []

  for (const section of SECTION_PRIORITY) {
    const entries = grouped.get(section)
    if (!entries?.length) continue
    lines.push(`## ${section}`)
    lines.push(...entries)
    lines.push("")
  }

  while (lines.at(-1) === "") {
    lines.pop()
  }

  return lines
}

export async function resolveReleaseNotesRange(
  previous: string | undefined,
  to = "HEAD",
  environment: NodeJS.ProcessEnv = process.env,
): Promise<
  | { readonly kind: "range"; readonly from: string | undefined; readonly to: string }
  | { readonly kind: "first-beta"; readonly notes: string; readonly to: string }
> {
  let sourceRef =
    previous === undefined ? undefined : changelogSourceRef(previous, undefined, environment)
  if (previous === undefined && releaseDistribution(environment).id === "beta") {
    const tags = await $`git tag --merged ${to} --list ${"v*"}`.text()
    const stableVersion = latestReleaseVersionFromReleases(
      tags
        .split("\n")
        .filter((tag) => parseReleaseTag(BUDDY_DISTRIBUTIONS.prod, tag) !== undefined)
        .map((tagName) => ({ tagName, isDraft: false, isPrerelease: false })),
    )
    if (stableVersion === undefined) {
      const shortSha = await $`git rev-parse --short=7 ${to}`.text()
      return {
        kind: "first-beta",
        notes: `This is the first Buddy Beta, built from beta at ${shortSha.trim()}.`,
        to,
      }
    }
    sourceRef = formatReleaseTag(BUDDY_DISTRIBUTIONS.prod, stableVersion)
  }
  return { kind: "range", from: sourceRef, to }
}

export async function buildReleaseNotes(
  previous: string | undefined,
  to = "HEAD",
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const range = await resolveReleaseNotesRange(previous, to, environment)
  if (range.kind === "first-beta") return range.notes
  return (await buildNotes(previous, to, range.from)).join("\n") || "No notable changes"
}

export function limitReleaseBody(body: string): string {
  const maximumLength = MAX_RELEASE_BODY_LENGTH
  if (body.length <= maximumLength) return body

  const betaNotes = readBetaReleaseBody(body)
  const format = betaNotes === undefined ? (notes: string) => notes : formatBetaReleaseBody
  const overhead = format("").length
  const truncated = "Release notes truncated to fit GitHub's size limit."
  const lines: string[] = []
  let length = overhead + truncated.length
  for (const line of (betaNotes ?? body).split("\n")) {
    const addition = format(line).length - overhead + 1
    if (length + addition > maximumLength) break
    lines.push(line)
    length += addition
  }
  return format([...lines, truncated].join("\n"))
}

if (import.meta.main) {
  const previous = await getLatestRelease()
  const notes = await buildNotes(previous, "HEAD")
  console.log(notes.join("\n") || "No notable changes")
}
