#!/usr/bin/env bun
import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { resolveWorktreePaths } from "./worktree-paths"

const { worktreesDir } = resolveWorktreePaths()

function isWorktreeDir(name: string): boolean {
  const dirPath = path.join(worktreesDir, name)
  if (!statSync(dirPath).isDirectory()) return false
  return existsSync(path.join(dirPath, ".git"))
}

function hasRunningDevServer(name: string): boolean {
  try {
    const { execFileSync } = require("node:child_process")
    const output = execFileSync("ps", ["-ax", "-o", "pid=,command="], {
      encoding: "utf8",
    })

    const worktreePath = path.join(worktreesDir, name)
    for (const line of output.split("\n")) {
      if (line.includes(worktreePath) && line.includes("electron-vite")) {
        return true
      }
    }
  } catch {
    // noop
  }
  return false
}

function main() {
  if (!existsSync(worktreesDir)) {
    console.log("No worktrees directory found")
    console.log(`Expected: ${worktreesDir}`)
    return
  }

  const entries = readdirSync(worktreesDir)
    .filter((name) => {
      try {
        return isWorktreeDir(name)
      } catch {
        return false
      }
    })
    .toSorted()

  if (entries.length === 0) {
    console.log("No worktrees found")
    console.log(`Create one with: bun run worktree:create <branch-name>`)
    return
  }

  console.log("")
  console.log("Worktrees:")
  console.log("")

  for (const name of entries) {
    const isRunning = hasRunningDevServer(name)
    const indicator = isRunning ? "●" : "○"
    const status = isRunning ? "running" : "stopped"
    console.log(`  ${indicator} ${name} (${status})`)
    console.log(`    cd ${path.join(worktreesDir, name)}`)
    console.log("")
  }
}

main()
