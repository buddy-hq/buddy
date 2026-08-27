import * as fs from "node:fs/promises"
import path from "node:path"
import type { Config } from "@buddy/backend/config"
import { LearnerMemoryPath } from "../../src/learning/features/memory"
import { projectConfigFile } from "./project-config"
import { temporaryDirectory } from "./temporary-directory"

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
  const directory = await temporaryDirectory()

  try {
    if (!options?.preserveLearnerStore) {
      await fs.rm(LearnerMemoryPath.root(directory.path), { recursive: true, force: true })
    }

    if (options?.git) {
      await runGit(["init"], directory.path)
      await runGit(
        [
          "-c",
          "user.email=buddy@test.local",
          "-c",
          "user.name=Buddy Test",
          "commit",
          "--allow-empty",
          "-m",
          `root commit ${directory.path}`,
        ],
        directory.path,
      )
    }

    if (options?.config) {
      const configFile = projectConfigFile(directory.path)
      await fs.mkdir(path.dirname(configFile), { recursive: true })
      await Bun.write(
        configFile,
        JSON.stringify({
          ...options.config,
        }),
      )
    }

    const extra = options?.init !== undefined ? await options.init(directory.path) : undefined

    return {
      [Symbol.asyncDispose]: async () => {
        try {
          await options?.dispose?.(directory.path)
        } finally {
          await directory[Symbol.asyncDispose]()
        }
      },
      path: directory.path,
      extra,
    }
  } catch (error) {
    await directory[Symbol.asyncDispose]()
    throw error
  }
}
