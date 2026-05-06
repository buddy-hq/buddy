import { spawnSync } from "node:child_process"
import path from "node:path"

export type WorktreePaths = {
  repoRoot: string
  worktreesDir: string
}

function readGitOutput(args: string[], cwd: string) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  })

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`)
  }

  return result.stdout.trim()
}

export function resolveWorktreePaths(cwd = process.cwd()): WorktreePaths {
  const repoRoot = readGitOutput(["rev-parse", "--show-toplevel"], cwd)
  const parentDir = path.dirname(repoRoot)

  return {
    repoRoot,
    worktreesDir:
      path.basename(parentDir) === "buddies" ? parentDir : path.join(parentDir, "buddies"),
  }
}
