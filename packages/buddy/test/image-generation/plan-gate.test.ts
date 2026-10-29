import { describe, expect, test } from "bun:test"
import type { ChatGPTUsage } from "@buddy/agent-runtime/chatgpt"
import { createImagePlanGate } from "../../src/learning/features/image-generation/service/plan-gate"

function usage(plan: string | null): ChatGPTUsage {
  return {
    status: "ready",
    plan,
    rateLimit: { primary: null, secondary: null },
    additionalRateLimits: [],
    credits: null,
    fetchedAt: "2026-10-24T00:00:00Z",
  }
}

describe("image plan gate", () => {
  test.each([
    { plan: "free", unavailable: true },
    { plan: "FrEe", unavailable: true },
    { plan: "plus", unavailable: false },
    { plan: null, unavailable: false },
  ])("plan $plan returns $unavailable", async ({ plan, unavailable }) => {
    const gate = createImagePlanGate(
      async () => usage(plan),
      () => 0,
    )
    expect(await gate.unavailable()).toBe(unavailable)
  })

  test.each(["not_connected", "error", "reconnect_required"] as const)(
    "keeps the tool for %s",
    async (status) => {
      const gate = createImagePlanGate(
        async () => ({ status }),
        () => 0,
      )
      expect(await gate.unavailable()).toBe(false)
    },
  )

  test("keeps the tool when the usage reader throws", async () => {
    const gate = createImagePlanGate(
      async () => {
        throw new Error("Usage unavailable")
      },
      () => 0,
    )
    expect(await gate.unavailable()).toBe(false)
  })

  test("bounds the initial lookup to 1.5 seconds and caches its eventual result", async () => {
    const pending = Promise.withResolvers<ChatGPTUsage>()
    const gate = createImagePlanGate(
      () => pending.promise,
      () => 0,
    )
    const started = performance.now()
    expect(await gate.unavailable()).toBe(false)
    const elapsed = performance.now() - started
    expect(elapsed).toBeGreaterThanOrEqual(1400)
    expect(elapsed).toBeLessThan(2500)
    pending.resolve(usage("free"))
    expect(await gate.unavailable()).toBe(true)
  })

  test("answers stale results immediately while sharing one background refresh", async () => {
    let now = 0
    let reads = 0
    const refresh = Promise.withResolvers<ChatGPTUsage>()
    const gate = createImagePlanGate(
      () => {
        reads += 1
        return reads === 1 ? Promise.resolve(usage("free")) : refresh.promise
      },
      () => now,
    )

    expect(await gate.unavailable()).toBe(true)
    now = 60_000
    expect(await gate.unavailable()).toBe(true)
    expect(reads).toBe(1)
    now = 60_001
    expect(await Promise.all([gate.unavailable(), gate.unavailable()])).toEqual([true, true])
    expect(reads).toBe(2)
    refresh.resolve(usage("plus"))
    await refresh.promise
    expect(await gate.unavailable()).toBe(false)
    expect(reads).toBe(2)
  })
})
