#!/usr/bin/env bun
import { existsSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

const WORKTREES_DIR = path.join(homedir(), "code", "buddies")

function isWorktreeDir(name: string): boolean {
  const dirPath = path.join(WORKTREES_DIR, name)
  if (!statSync(dirPath).isDirectory()) return false
  return existsSync(path.join(dirPath, ".git"))
}

function hasRunningDevServer(name: string): boolean {
  try {
    const { execFileSync } = require("node:child_process")
    const output = execFileSync("ps", ["-ax", "-o", "pid=,command="], {
      encoding: "utf8",
    })

    const worktreePath = path.join(WORKTREES_DIR, name)
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
  if (!existsSync(WORKTREES_DIR)) {
    console.log("No worktrees directory found")
    console.log(`Expected: ${WORKTREES_DIR}`)
    return
  }

  const entries = readdirSync(WORKTREES_DIR)
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
    console.log(`    cd ~/code/buddies/${name}`)
    console.log("")
  }
}

main()
