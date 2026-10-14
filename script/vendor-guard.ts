#!/usr/bin/env bun

import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"

const VENDOR_PREFIX = "vendor/opencode/"
const VENDOR_DIFF_FILTER = "ACMRD"
const UPSTREAM_SOURCE = "script/opencode-upstream.json"
const UpstreamSourceSchema = z.strictObject({
  tag: z.string().regex(/^v\d+\.\d+\.\d+$/),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  tree: z.string().regex(/^[0-9a-f]{40}$/),
})

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

function worktreeVendorTree(): string {
  const directory = mkdtempSync(join(tmpdir(), "buddy-vendor-guard-"))
  const env = { ...process.env, GIT_INDEX_FILE: join(directory, "index") }
  try {
    execFileSync("git", ["read-tree", "HEAD"], { env })
    execFileSync("git", ["add", "-A", "--", VENDOR_PREFIX], { env })
    const root = execFileSync("git", ["write-tree"], { env, encoding: "utf8" }).trim()
    return gitOutput(["rev-parse", `${root}:vendor/opencode`])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function mirrorRevision(mode: Mode): string | undefined {
  if (mode.kind === "worktree") return
  if (mode.kind === "staged") return gitOutput(["write-tree"])
  if (mode.kind === "stdin") throw new Error("Push revisions must come from ref updates")
  return mode.range.split("..").at(-1)
}

function allowsUpstreamSnapshot(mode: Mode, pushRevisions: string[]): boolean {
  try {
    const revisions = mode.kind === "stdin" ? pushRevisions : [mirrorRevision(mode)]
    if (revisions.length === 0) return false
    return revisions.every((revision) => {
      const source =
        revision === undefined
          ? readFileSync(UPSTREAM_SOURCE, "utf8")
          : gitOutput(["show", `${revision}:${UPSTREAM_SOURCE}`])
      const record = UpstreamSourceSchema.parse(JSON.parse(source))
      const actual =
        revision === undefined
          ? worktreeVendorTree()
          : gitOutput(["rev-parse", `${revision}:vendor/opencode`])
      return actual === record.tree
    })
  } catch {
    return false
  }
}

function gitChangedFilesForRange(range: string): string[] {
  const output = execFileSync(
    "git",
    ["diff", "--name-only", `--diff-filter=${VENDOR_DIFF_FILTER}`, range],
    {
      encoding: "utf8",
    },
  )
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

function gitChangedFilesForRefUpdates(updates: RefUpdate[]) {
  const changedPaths = new Set<string>()
  const revisions: string[] = []

  for (const update of updates) {
    if (isNullSha(update.newSha)) continue

    const paths = isNullSha(update.oldSha)
      ? getChangedFilesForNewRef(update.newSha)
      : gitChangedFilesForRange(`${update.oldSha}..${update.newSha}`)

    if (paths.some((path) => path.startsWith(VENDOR_PREFIX))) revisions.push(update.newSha)

    for (const path of paths) {
      changedPaths.add(path)
    }
  }

  return { paths: [...changedPaths], revisions }
}

function gitChangedFilesForMode(mode: Mode) {
  if (mode.kind === "staged") {
    const output = execFileSync(
      "git",
      ["diff", "--cached", "--name-only", `--diff-filter=${VENDOR_DIFF_FILTER}`],
      {
        encoding: "utf8",
      },
    )
    const paths = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    return { paths, revisions: [] }
  }

  if (mode.kind === "worktree") {
    return { paths: gitChangedFilesForWorktree(), revisions: [] }
  }

  if (mode.kind === "range") {
    return { paths: gitChangedFilesForRange(mode.range), revisions: [] }
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

  return { paths: lines, revisions: [] }
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

For an intentional upstream sync, verify the tag and record its commit and tree in ${UPSTREAM_SOURCE}.
For a Buddy-specific change, move it into Buddy-owned code.
`

  console.error(message)
}

function main(): void {
  const mode = parseMode(process.argv.slice(2))
  const changed = gitChangedFilesForMode(mode)
  const vendorPaths = changed.paths.filter((path) => path.startsWith(VENDOR_PREFIX))

  if (vendorPaths.length === 0) process.exit(0)
  if (allowsUpstreamSnapshot(mode, changed.revisions)) process.exit(0)

  printFailure(vendorPaths, mode)
  process.exit(1)
}

main()
