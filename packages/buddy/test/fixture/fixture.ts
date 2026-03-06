import { $ } from "bun"
import * as fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { Config } from "../../src/config/config.js"
import { LearnerPath } from "../../src/learning/learner/path.js"

type TmpDirOptions<T> = {
  git?: boolean
  config?: Partial<Config.Info>
  init?: (dir: string) => Promise<T>
  dispose?: (dir: string) => Promise<void>
  preserveLearnerStore?: boolean
}

export async function tmpdir<T>(options?: TmpDirOptions<T>) {
  const dirpath = path.join(os.tmpdir(), "buddy-test-" + Math.random().toString(36).slice(2))
  if (!options?.preserveLearnerStore) {
    await fs.rm(path.join(LearnerPath.root()), { recursive: true, force: true })
  }
  await fs.mkdir(dirpath, { recursive: true })

  if (options?.git) {
    await $`git init`.cwd(dirpath).quiet()
    await $`git -c user.email=buddy@test.local -c user.name=Buddy\ Test commit --allow-empty -m "root commit ${dirpath}"`
      .cwd(dirpath)
      .quiet()
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
