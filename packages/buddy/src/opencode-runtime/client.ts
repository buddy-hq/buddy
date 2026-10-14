import type { OpenCodeHost } from "@buddy/opencode-adapter/host"

export async function getOpenCodeClient(): Promise<OpenCodeHost> {
  const { getOpenCodeHost } = await import("./runtime")
  return getOpenCodeHost()
}

export type { OpenCodeHost }
