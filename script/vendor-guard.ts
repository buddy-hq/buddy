#!/usr/bin/env bun

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const VENDOR_PREFIX = "vendor/opencode/"

type Mode =
  | { kind: "staged" }
  | { kind: "range"; range: string }
  | { kind: "stdin" }

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
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  }

  if (mode.kind === "range") {
    const output = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", mode.range], {
      encoding: "utf8",
    })
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  }

  const input = readFileSync(0, "utf8")
  return input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function printFailure(vendorPaths: string[], mode: Mode): void {
  const scope = mode.kind === "staged" ? "staged changes" : mode.kind === "range" ? `range ${mode.range}` : "incoming push diff"
  const list = vendorPaths.map((path) => `  - ${path}`).join("\n")

  console.error("ERROR: Protected vendored source was modified.")
  console.error("")
  console.error(`What failed:`)
  console.error(`- The guard detected changes under "${VENDOR_PREFIX}" in ${scope}.`)
  console.error("- This repository treats vendor/opencode as a mirror of upstream OpenCode.")
  console.error("- Direct edits there are blocked to prevent merge drift and painful future subtree syncs.")
  console.error("")
  console.error("Detected vendor paths:")
  console.error(list)
  console.error("")
  console.error("How to solve this in a compatible way:")
  console.error("1) If this was accidental:")
  console.error(`   - Unstage/revert vendor paths and re-implement behavior in Buddy-owned layers (`)
  console.error("     packages/buddy, packages/opencode-adapter, packages/desktop).")
  console.error("   - Preferred pattern: adapter/build/runtime integration, not vendor patching.")
  console.error("2) If this is an intentional upstream sync:")
  console.error("   - Use the documented vendor sync flow from docs/upstream-fetch.algo.md.")
  console.error("   - Commit vendor sync explicitly with an allow flag:")
  console.error('     ALLOW_VENDOR_SYNC=1 git commit -m "chore(vendor): sync opencode upstream to latest local dev"')
  console.error("3) If you are blocked by this in CI:")
  console.error("   - Ensure the vendor sync commit message follows the expected vendor-sync convention above.")
  console.error("")
  console.error("Guard override (use only for intentional vendor sync):")
  console.error("  ALLOW_VENDOR_SYNC=1")
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
