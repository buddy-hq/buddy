#!/usr/bin/env bun

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const VENDOR_PREFIX = "vendor/opencode/"

type Mode = { kind: "staged" } | { kind: "range"; range: string } | { kind: "stdin" }

function parseMode(argv: string[]): Mode {
  if (argv.length === 0) return { kind: "staged" }

  if (argv[0] === "--staged") return { kind: "staged" }

  if (argv[0] === "--range") {
    const range = argv[1]
    if (!range) {
      throw new Error("Missing range after --range. Example: --range origin/main..HEAD")
    }
    return { kind: "range", range }
  }

  if (argv[0] === "--stdin") return { kind: "stdin" }

  throw new Error(
    `Unknown arguments: ${argv.join(" ")}\nUsage: bun run script/vendor-guard.ts [--staged | --range <a..b> | --stdin]`,
  )
}

function gitChangedFilesForMode(mode: Mode): string[] {
  if (mode.kind === "staged") {
    const output = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
      encoding: "utf8",
    })
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }

  if (mode.kind === "range") {
    const output = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", mode.range], {
      encoding: "utf8",
    })
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }

  const input = readFileSync(0, "utf8")
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function printFailure(vendorPaths: string[], mode: Mode): void {
  const scope =
    mode.kind === "staged" ? "staged changes" : mode.kind === "range" ? `range ${mode.range}` : "incoming push diff"
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
    console.log(`vendor-guard: allowing ${vendorPaths.length} vendor path change(s) because ALLOW_VENDOR_SYNC=1`)
    process.exit(0)
  }

  printFailure(vendorPaths, mode)
  process.exit(1)
}

main()
