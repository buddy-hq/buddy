import type { ChatGPTUsage } from "@buddy/agent-runtime/chatgpt"

export function createImagePlanGate(
  readUsage: () => Promise<ChatGPTUsage>,
  now: () => number = Date.now,
) {
  let cached: { readonly unavailable: boolean; readonly readAt: number } | undefined
  let pending: Promise<void> | undefined

  function refresh(): Promise<void> {
    if (pending) return pending
    pending = (async () => {
      try {
        const usage = await readUsage()
        cached = {
          unavailable: usage.status === "ready" && usage.plan?.toLowerCase() === "free",
          readAt: now(),
        }
      } catch {
        cached = { unavailable: false, readAt: now() }
      }
    })().finally(() => {
      pending = undefined
    })
    return pending
  }

  return {
    async unavailable(): Promise<boolean> {
      const previous = cached
      if (previous) {
        if (now() - previous.readAt > 60_000) void refresh()
        return previous.unavailable
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          refresh(),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 1500)
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
      return cached?.unavailable ?? false
    },
  }
}

export const imagePlanGate = createImagePlanGate(async () => {
  const { getAgentRuntime } = await import("../../../../runtime/agent-runtime")
  const { ensureGlobalBootstrapWorkspaceDirectory } = await import("../../../../project/directory")
  const runtime = await getAgentRuntime()
  return runtime.chatgpt.usage(ensureGlobalBootstrapWorkspaceDirectory(), { refresh: false })
})
