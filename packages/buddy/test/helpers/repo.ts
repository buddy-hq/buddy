import path from "node:path"
import { writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { temporaryDirectory, type TemporaryDirectory } from "./temporary-directory"

type CreateGitRepoOptions = {
  readme?: string
}

export function runGit(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git command failed")
  }
}

export async function createGitRepo(
  prefix: string,
  options?: CreateGitRepoOptions,
): Promise<TemporaryDirectory> {
  const directory = await temporaryDirectory({ prefix: `${prefix}-` })

  try {
    runGit(directory.path, ["init", "-q"])
    writeFileSync(path.join(directory.path, "README.md"), options?.readme ?? "# test\n")
    runGit(directory.path, ["add", "README.md"])
    runGit(directory.path, [
      "-c",
      "user.email=buddy@test.local",
      "-c",
      "user.name=Buddy Test",
      "commit",
      "-qm",
      "init",
    ])
    return directory
  } catch (error) {
    await directory[Symbol.asyncDispose]()
    throw error
  }
}
