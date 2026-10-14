import { withSyncedOpenCodeConfig } from "../helpers/opencode"
import type { OpenCodeHost } from "@buddy/opencode-adapter/host"
import { tmpdir } from "../helpers/tmpdir"

export async function withRepo<T>(fn: (directory: string) => Promise<T>) {
  await using tmp = await tmpdir({ git: true })
  return await fn(tmp.path)
}

export function inDirectory<T>(directory: string, fn: (host: OpenCodeHost) => Promise<T> | T) {
  return withSyncedOpenCodeConfig(directory, fn)
}
