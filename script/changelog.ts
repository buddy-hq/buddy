#!/usr/bin/env bun

import { $ } from "bun"
import {
  latestReleaseVersionFromReleases as selectLatestReleaseVersionFromReleases,
  type GithubReleaseVersion,
  type LatestReleaseVersionInput,
} from "@buddy/script/release-version"
import { releaseRepository } from "./release-repositories"

type Commit = {
  hash: string
  message: string
  areas: Set<string>
}

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
  { prefix: "vendor/opencode/packages/opencode/", section: "Vendored Core" },
  { prefix: "vendor/opencode/packages/util/", section: "Vendored Core" },
  { prefix: "vendor/opencode/packages/plugin/", section: "Vendored Core" },
  { prefix: "vendor/opencode/packages/sdk/js/", section: "Vendored Core" },
  { prefix: "vendor/opencode/packages/script/", section: "Vendored Core" },
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

async function listGithubReleases(): Promise<GithubReleaseVersion[]> {
  const repo = releaseRepository()
  const releases =
    (await $`gh release list --repo ${repo} --json tagName,isDraft,isPrerelease --limit 100`.json()) as GithubReleaseVersion[]
  return releases
}

export async function getLatestRelease(skip?: string) {
  const releases = await listGithubReleases()
  return latestReleaseVersionFromReleases(releases, { skip })
}

export async function getLatestPublishedRelease(skip?: string) {
  const releases = await listGithubReleases()
  return latestReleaseVersionFromReleases(releases, {
    includePrereleases: true,
    skip,
  })
}

async function listCommitHashes(from: string | undefined, to = "HEAD") {
  if (!from) {
    return $`git rev-list --reverse ${to}`
      .text()
      .then((output) => output.split("\n").filter(Boolean))
  }

  const fromRef = from.startsWith("v") ? from : `v${from}`
  return $`git rev-list --reverse ${fromRef}..${to}`
    .text()
    .then((output) => output.split("\n").filter(Boolean))
}

function isIgnoredCommit(message: string) {
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

async function getCommits(from: string | undefined, to = "HEAD") {
  const hashes = await listCommitHashes(from, to)
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

export async function buildNotes(from: string | undefined, to = "HEAD") {
  const commits = await getCommits(from, to)
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

if (import.meta.main) {
  const previous = await getLatestRelease()
  const notes = await buildNotes(previous, "HEAD")
  console.log(notes.join("\n") || "No notable changes")
}
