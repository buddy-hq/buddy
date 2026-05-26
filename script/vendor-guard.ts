#!/usr/bin/env bun

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const VENDOR_PREFIX = "vendor/opencode/"
const VENDOR_DIFF_FILTER = "ACMRD"

type Mode =
  | { kind: "staged" }
  | { kind: "worktree" }
  | { kind: "range"; range: string }
  | { kind: "stdin" }

type RefUpdate = {
  oldSha: string
  newSha: string
  refName: string
}

function parseMode(argv: string[]): Mode {
  if (argv.length === 0) return { kind: "staged" }

  if (argv[0] === "--staged") return { kind: "staged" }

  if (argv[0] === "--worktree") return { kind: "worktree" }

  if (argv[0] === "--range") {
    const range = argv[1]
    if (!range) {
      throw new Error("Missing range after --range. Example: --range origin/main..HEAD")
    }
    return { kind: "range", range }
  }

  if (argv[0] === "--stdin") return { kind: "stdin" }

  throw new Error(
    `Unknown arguments: ${argv.join(" ")}\nUsage: bun run script/vendor-guard.ts [--staged | --worktree | --range <a..b> | --stdin]`,
  )
}

function gitOutput(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim()
}

function gitChangedFilesForRange(range: string): string[] {
  const output = execFileSync("git", ["diff", "--name-only", `--diff-filter=${VENDOR_DIFF_FILTER}`, range], {
    encoding: "utf8",
  })
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function gitUntrackedVendorFiles(): string[] {
  const output = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", VENDOR_PREFIX],
    {
      encoding: "utf8",
    },
  )

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function gitChangedFilesForWorktree(): string[] {
  const tracked = execFileSync(
    "git",
    ["diff", "--name-only", `--diff-filter=${VENDOR_DIFF_FILTER}`, "HEAD", "--", VENDOR_PREFIX],
    {
      encoding: "utf8",
    },
  )

  return [
    ...tracked
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    ...gitUntrackedVendorFiles(),
  ]
}

function isGitSha(value: string): boolean {
  return /^[0-9a-f]{40,64}$/i.test(value)
}

function isNullSha(value: string): boolean {
  return /^0{40,64}$/.test(value)
}

function getDefaultBranchRef(): string | null {
  const candidates = [
    ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
    ["rev-parse", "--verify", "--symbolic-full-name", "refs/heads/main"],
    ["rev-parse", "--verify", "--symbolic-full-name", "refs/remotes/origin/main"],
  ] as const

  for (const args of candidates) {
    try {
      const output = gitOutput([...args])
      if (output.length > 0) return output
    } catch {
      continue
    }
  }

  return null
}

function getEmptyTreeSha(): string {
  return gitOutput(["hash-object", "-t", "tree", "/dev/null"])
}

function getChangedFilesForNewRef(newSha: string): string[] {
  const defaultBranchRef = getDefaultBranchRef()
  if (!defaultBranchRef) {
    return gitChangedFilesForRange(`${getEmptyTreeSha()}..${newSha}`)
  }

  try {
    const mergeBase = gitOutput(["merge-base", defaultBranchRef, newSha])
    return gitChangedFilesForRange(`${mergeBase}..${newSha}`)
  } catch {
    return gitChangedFilesForRange(`${defaultBranchRef}..${newSha}`)
  }
}

function parseRefUpdate(line: string): RefUpdate | null {
  const parts = line.trim().split(/\s+/)
  if (parts.length !== 3) return null

  const [oldSha, newSha, refName] = parts
  if (!isGitSha(oldSha) || !isGitSha(newSha) || refName.length === 0) return null

  return { oldSha, newSha, refName }
}

function gitChangedFilesForRefUpdates(updates: RefUpdate[]): string[] {
  const changedPaths = new Set<string>()

  for (const update of updates) {
    if (isNullSha(update.newSha)) continue

    const paths = isNullSha(update.oldSha)
      ? getChangedFilesForNewRef(update.newSha)
      : gitChangedFilesForRange(`${update.oldSha}..${update.newSha}`)

    for (const path of paths) {
      changedPaths.add(path)
    }
  }

  return [...changedPaths]
}

function gitChangedFilesForMode(mode: Mode): string[] {
  if (mode.kind === "staged") {
    const output = execFileSync(
      "git",
      ["diff", "--cached", "--name-only", `--diff-filter=${VENDOR_DIFF_FILTER}`],
      {
        encoding: "utf8",
      },
    )
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }

  if (mode.kind === "worktree") {
    return gitChangedFilesForWorktree()
  }

  if (mode.kind === "range") {
    return gitChangedFilesForRange(mode.range)
  }

  const input = readFileSync(0, "utf8")
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const updates = lines.map(parseRefUpdate)
  if (updates.every((update) => update !== null)) {
    return gitChangedFilesForRefUpdates(updates)
  }

  return lines
}

function printFailure(vendorPaths: string[], mode: Mode): void {
  const scope =
    mode.kind === "staged"
      ? "staged changes"
      : mode.kind === "worktree"
        ? "the current worktree"
      : mode.kind === "range"
        ? `range ${mode.range}`
        : "incoming push diff"
  const list = vendorPaths.map((path) => `  - ${path}`).join("\n")
  const message = `ERROR: Protected vendored source was modified.

What failed:
- The guard detected changes under "${VENDOR_PREFIX}" in ${scope}.
- This repository treats vendor/opencode as a mirror of upstream OpenCode.
- Direct edits there are blocked to prevent merge drift and painful future subtree syncs.

Detected vendor paths:
${list}

Inform the user about the details and stop any further work for this turn.
`

  console.error(message)
}

function main(): void {
  const mode = parseMode(process.argv.slice(2))
  const changedPaths = gitChangedFilesForMode(mode)
  const vendorPaths = changedPaths.filter((path) => path.startsWith(VENDOR_PREFIX))

  if (vendorPaths.length === 0) process.exit(0)

  if (process.env.ALLOW_VENDOR_SYNC === "1") {
    console.log(
      `vendor-guard: allowing ${vendorPaths.length} vendor path change(s) because ALLOW_VENDOR_SYNC=1`,
    )
    process.exit(0)
  }

  printFailure(vendorPaths, mode)
  process.exit(1)
}

main()
