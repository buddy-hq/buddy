import { withSyncedOpenCodeConfig } from "../helpers/opencode"
import type { NotebookTestHost } from "../helpers/opencode"
import { tmpdir } from "../helpers/tmpdir"

export async function withRepo<T>(fn: (directory: string) => Promise<T>) {
  await using tmp = await tmpdir({ git: true })
  return await fn(tmp.path)
}

export function inDirectory<T>(directory: string, fn: (host: NotebookTestHost) => Promise<T> | T) {
  return withSyncedOpenCodeConfig(directory, fn)
}
