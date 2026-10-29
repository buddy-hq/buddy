import { createOpenCodeRuntime, openCodeHostForRuntime } from "@buddy/opencode-adapter/runtime"
import path from "node:path"
import fsp from "node:fs/promises"
import { createOpenCodeHost, type OpenCodeHost } from "@buddy/opencode-adapter/host"
import { Plugin } from "@buddy/opencode-adapter/plugin"
import { temporaryDirectory } from "./temporary-directory"
import type { AgentRuntime } from "@buddy/agent-runtime/runtime"
import { registerNotebookConfig } from "@buddy/opencode-adapter/extension/notebook"
import { createBuddyRuntimeExtension } from "../../src/runtime/buddy-extension"
import { readOpenCodeHostConfig } from "../../src/config/runtime/notebook-runtime-plan"
import { syncNotebookRuntimeConfig } from "../../src/config/runtime/opencode-sync"

export async function createNotebookTestHost(options?: {
  plugins?: readonly Plugin.Plugin[]
  project?: boolean
}) {
  const root = await temporaryDirectory({ prefix: "buddy-notebook-host-" })
  const paths = {
    data: path.join(root.path, "data"),
    cache: path.join(root.path, "cache"),
    config: path.join(root.path, "config"),
    state: path.join(root.path, "state"),
    tmp: path.join(root.path, "tmp"),
  }
  try {
    await Promise.all(
      Object.values(paths).map((directory) => fsp.mkdir(directory, { recursive: true })),
    )
    const host = await createOpenCodeHost({
      clientName: "buddy-notebook-test",
      paths,
      databasePath: path.join(paths.data, "opencode.db"),
      fetchModels: false,
      fs: { filewatcher: false, fff: false },
      config: { ...(await readOpenCodeHostConfig()), project: options?.project },
      plugins: [
        Plugin.define({
          id: "buddy.notebook-test",
          setup: (ctx) => registerNotebookConfig(ctx, createBuddyRuntimeExtension().notebookPlan),
        }),
        ...(options?.plugins ?? []),
      ],
    })
    return {
      host,
      agentRuntime: createOpenCodeRuntime(host),
      root: root.path,
      [Symbol.asyncDispose]: async () => {
        await host.close()
        await root[Symbol.asyncDispose]()
      },
    }
  } catch (cause) {
    await root[Symbol.asyncDispose]()
    throw cause
  }
}

export async function withSyncedOpenCodeConfig<T>(
  directory: string,
  fn: (host: OpenCodeHost) => Promise<T> | T,
) {
  await using runtime = await createNotebookTestHost()
  await syncNotebookRuntimeConfig(directory, { runtime: createOpenCodeRuntime(runtime.host) })
  return await fn(runtime.host)
}

export type NotebookTestHost = OpenCodeHost

export function runtimeHost(runtime: AgentRuntime): OpenCodeHost {
  return openCodeHostForRuntime(runtime)
}
