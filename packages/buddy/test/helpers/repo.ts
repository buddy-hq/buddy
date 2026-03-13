import os from "node:os"
import path from "node:path"
import { mkdtempSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"

type CreateGitRepoOptions = {
  readme?: string
}

export function runGit(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git command failed")
  }
}

export function createGitRepo(prefix: string, options?: CreateGitRepoOptions) {
  const root = mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  runGit(root, ["init", "-q"])
  writeFileSync(path.join(root, "README.md"), options?.readme ?? "# test\n")
  runGit(root, ["add", "README.md"])
  runGit(root, ["-c", "user.email=buddy@test.local", "-c", "user.name=Buddy Test", "commit", "-qm", "init"])
  return root
}
