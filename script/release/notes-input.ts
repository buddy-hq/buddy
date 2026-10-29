#!/usr/bin/env bun

import { $ } from "bun"
import { getLatestPublishedRelease, isIgnoredCommit, resolveReleaseNotesRange } from "../changelog"
import { RAW_RELEASE_NOTES_HEADER } from "./notes"
import type { BuddyDistributionId } from "@buddy/script/distribution"

export async function buildReleaseNotesInput(
  previous: string | undefined,
  to = "HEAD",
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const range = await resolveReleaseNotesRange(previous, to, environment)
  const lines = [
    RAW_RELEASE_NOTES_HEADER,
    "",
    "Read the real diffs with git show <hash>, then replace this input with notes for people using Buddy. See docs/ops/releases/notes.md.",
    "",
  ]
  if (range.kind === "first-beta") {
    return [
      ...lines,
      `Range: none (no ancestor Stable release at ${to}).`,
      "",
      range.notes,
      "",
      "0 commits left out.",
    ].join("\n")
  }
  const revision = range.from === undefined ? range.to : `${range.from}..${range.to}`
  const output = await $`git log --reverse --format=${"%h%x09%s"} ${revision}`.text()
  const commits = output.split("\n").flatMap((line) => {
    const separator = line.indexOf("\t")
    if (separator < 0) return []
    const subject = line.slice(separator + 1)
    return !subject || isIgnoredCommit(subject) ? [] : [`- ${line.slice(0, separator)} ${subject}`]
  })
  lines.push(
    `Range: \`${revision}\``,
    "",
    ...commits.slice(0, 400),
    "",
    `${Math.max(0, commits.length - 400)} commits left out.`,
  )
  return lines.join("\n")
}

function parseChannel(args: readonly string[]): BuddyDistributionId {
  let channel: BuddyDistributionId = "prod"
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument !== "--channel" && !argument?.startsWith("--channel=")) {
      throw new Error("Usage: bun run release:notes:input --channel prod|beta")
    }
    const value = argument === "--channel" ? args[++index] : argument.slice("--channel=".length)
    if (value !== "prod" && value !== "beta") throw new Error("--channel must be prod or beta")
    channel = value
  }
  return channel
}

if (import.meta.main) {
  const environment = { ...process.env, BUDDY_CHANNEL: parseChannel(process.argv.slice(2)) }
  const previous = await getLatestPublishedRelease(undefined, environment)
  console.log(await buildReleaseNotesInput(previous, "HEAD", environment))
}
