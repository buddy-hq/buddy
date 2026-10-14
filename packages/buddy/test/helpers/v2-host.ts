import fs from "node:fs/promises"
import path from "node:path"
import { createOpenCodeHost } from "@buddy/opencode-adapter/host"
import { temporaryDirectory } from "./temporary-directory"

export async function createV2TestHost() {
  const parentDirectory = process.env.BUDDY_TEST_XDG_ROOT
  if (!parentDirectory) throw new Error("The Buddy test preload must configure isolated roots")
  const root = await temporaryDirectory({ parentDirectory, prefix: "v2-host-" })
  const paths = {
    data: path.join(root.path, "data"),
    cache: path.join(root.path, "cache"),
    config: path.join(root.path, "config"),
    state: path.join(root.path, "state"),
    tmp: path.join(root.path, "tmp"),
  }
  try {
    await Promise.all(Object.values(paths).map((directory) => fs.mkdir(directory, { recursive: true })))
    const host = await createOpenCodeHost({ clientName: "buddy-test", paths, databasePath: path.join(paths.data, "opencode.db"), fetchModels: false })
    return {
      host,
      path: root.path,
      async [Symbol.asyncDispose]() {
        try { await host.close() } finally { await root[Symbol.asyncDispose]() }
      },
    }
  } catch (error) {
    await root[Symbol.asyncDispose]()
    throw error
  }
}
