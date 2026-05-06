#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import readline from "node:readline"

const MAIN_REPO = path.join(homedir(), "code", "buddy")
const WORKTREES_DIR = path.join(homedir(), "code", "buddies")

const args = process.argv.slice(2)
const branchName = args[0]

async function promptBranchName(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question("Branch name for new worktree: ", (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function runGit(args: string[], options?: { cwd?: string; throwOnError?: boolean }) {
  const cwd = options?.cwd ?? MAIN_REPO
  const throwOnError = options?.throwOnError ?? true

  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  })

  if (throwOnError && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`)
  }

  return result
}

async function main() {
  const name = branchName || (await promptBranchName())

  if (!name || name.length === 0) {
    console.error("Branch name is required")
    process.exit(1)
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    console.error("Branch name must contain only letters, numbers, hyphens, and underscores")
    process.exit(1)
  }

  const worktreePath = path.join(WORKTREES_DIR, name)

  if (existsSync(worktreePath)) {
    console.error(`Worktree directory already exists: ${worktreePath}`)
    process.exit(1)
  }

  const existingBranches = runGit(["branch", "--list", name], { throwOnError: false })
  if (existingBranches.stdout.trim().length > 0) {
    console.error(`Branch '${name}' already exists locally`)
    process.exit(1)
  }

  mkdirSync(WORKTREES_DIR, { recursive: true })

  console.log(`Creating worktree for branch '${name}'...`)
  runGit(["worktree", "add", worktreePath, "-b", name, "main"])

  console.log("Installing dependencies...")
  const installResult = spawnSync("bun", ["install"], {
    cwd: worktreePath,
    encoding: "utf8",
    stdio: "inherit",
  })

  if (installResult.status !== 0) {
    console.error("Dependency installation failed")
    process.exit(1)
  }

  console.log("")
  console.log("Worktree ready.")
  console.log("")
  console.log(`  cd ${worktreePath}`)
  console.log("  bun run dev:desktop")
  console.log("")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
