import * as fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { Config } from "@buddy/backend/config"
import { LearnerArtifactPath } from "../../src/learning/learner-model"

type TmpDirOptions<T> = {
  git?: boolean
  config?: Partial<Config.Info>
  init?: (dir: string) => Promise<T>
  dispose?: (dir: string) => Promise<void>
  preserveLearnerStore?: boolean
}

async function runGit(args: string[], cwd: string) {
  const process = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "ignore",
    stderr: "ignore",
  })
  const exitCode = await process.exited
  if (exitCode === 0) return

  throw new Error(`git ${args.join(" ")} failed with exit code ${exitCode}`)
}

export async function tmpdir<T>(options?: TmpDirOptions<T>) {
  const dirpath = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-test-"))
  if (!options?.preserveLearnerStore) {
    await fs.rm(LearnerArtifactPath.profileRoot(), { recursive: true, force: true })
  }

  if (options?.git) {
    await runGit(["init"], dirpath)
    await runGit(
      [
        "-c",
        "user.email=buddy@test.local",
        "-c",
        "user.name=Buddy Test",
        "commit",
        "--allow-empty",
        "-m",
        `root commit ${dirpath}`,
      ],
      dirpath,
    )
  }

  if (options?.config) {
    await Bun.write(
      path.join(dirpath, "buddy.jsonc"),
      JSON.stringify({
        ...options.config,
      }),
    )
  }

  const extra = await options?.init?.(dirpath)

  return {
    [Symbol.asyncDispose]: async () => {
      await options?.dispose?.(dirpath)
      await fs.rm(dirpath, { recursive: true, force: true })
    },
    path: dirpath,
    extra: extra as T,
  }
}
