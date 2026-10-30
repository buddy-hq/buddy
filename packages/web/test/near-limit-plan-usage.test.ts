import { describe, expect, test } from "bun:test"
import { selectNearLimitPlanUsage } from "../src/state/near-limit-plan-usage"
import type { OpenAIUsageSnapshot } from "../src/state/openai-usage-query"

const FIVE_HOUR_SECONDS = 18_000
const WEEK_SECONDS = 604_800
const FIVE_HOUR_RESET = "2026-10-02T18:00:00.000Z"
const WEEKLY_RESET = "2026-10-09T12:00:00.000Z"

type TReadyUsage = Extract<OpenAIUsageSnapshot, { status: "ready" }>
type TUsageWindow = TReadyUsage["rateLimit"]["primary"]

function readyUsage(primary: TUsageWindow, secondary: TUsageWindow): TReadyUsage {
  return {
    status: "ready",
    plan: "plus",
    rateLimit: { primary, secondary },
    additionalRateLimits: [
      {
        name: "code",
        meteredFeature: "codex",
        rateLimit: {
          primary: {
            usedPercent: 99,
            resetsAt: "2026-10-02T19:00:00.000Z",
            windowSeconds: FIVE_HOUR_SECONDS,
          },
          secondary: null,
        },
      },
    ],
    credits: null,
    fetchedAt: "2026-10-02T12:00:00.000Z",
  }
}

describe("selectNearLimitPlanUsage", () => {
  test("returns nothing when the 5-hour and weekly windows are 84% used", () => {
    expect(
      selectNearLimitPlanUsage({
        usage: readyUsage(
          { usedPercent: 84, resetsAt: FIVE_HOUR_RESET, windowSeconds: FIVE_HOUR_SECONDS },
          { usedPercent: 84, resetsAt: WEEKLY_RESET, windowSeconds: WEEK_SECONDS },
        ),
        activeProviderID: "openai",
      }),
    ).toEqual([])
  })

  test("returns the window at 85% used with its percent and reset time", () => {
    expect(
      selectNearLimitPlanUsage({
        usage: readyUsage(
          { usedPercent: 85, resetsAt: FIVE_HOUR_RESET, windowSeconds: FIVE_HOUR_SECONDS },
          { usedPercent: 84, resetsAt: WEEKLY_RESET, windowSeconds: WEEK_SECONDS },
        ),
        activeProviderID: "openai",
      }),
    ).toEqual([{ window: "five-hour", usedPercent: 85, resetsAt: FIVE_HOUR_RESET }])

    expect(
      selectNearLimitPlanUsage({
        usage: readyUsage(
          { usedPercent: 10, resetsAt: FIVE_HOUR_RESET, windowSeconds: FIVE_HOUR_SECONDS },
          { usedPercent: 85, resetsAt: WEEKLY_RESET, windowSeconds: WEEK_SECONDS },
        ),
        activeProviderID: "openai",
      }),
    ).toEqual([{ window: "weekly", usedPercent: 85, resetsAt: WEEKLY_RESET }])

    expect(
      selectNearLimitPlanUsage({
        usage: readyUsage(
          { usedPercent: 91, resetsAt: FIVE_HOUR_RESET, windowSeconds: FIVE_HOUR_SECONDS },
          { usedPercent: 85, resetsAt: WEEKLY_RESET, windowSeconds: WEEK_SECONDS },
        ),
        activeProviderID: "openai",
      }),
    ).toEqual([
      { window: "five-hour", usedPercent: 91, resetsAt: FIVE_HOUR_RESET },
      { window: "weekly", usedPercent: 85, resetsAt: WEEKLY_RESET },
    ])
  })

  test("returns nothing when plan usage is unknown", () => {
    expect(selectNearLimitPlanUsage({ usage: undefined, activeProviderID: "openai" })).toEqual([])
    expect(
      selectNearLimitPlanUsage({ usage: { status: "not_connected" }, activeProviderID: "openai" }),
    ).toEqual([])
    expect(
      selectNearLimitPlanUsage({ usage: { status: "error" }, activeProviderID: "openai" }),
    ).toEqual([])
    expect(
      selectNearLimitPlanUsage({
        usage: { status: "reconnect_required" },
        activeProviderID: "openai",
      }),
    ).toEqual([])
    expect(
      selectNearLimitPlanUsage({
        usage: readyUsage(null, null),
        activeProviderID: "openai",
      }),
    ).toEqual([])
  })

  test("returns nothing unless the active model is the ChatGPT plan", () => {
    const usage = readyUsage(
      { usedPercent: 90, resetsAt: FIVE_HOUR_RESET, windowSeconds: FIVE_HOUR_SECONDS },
      { usedPercent: 90, resetsAt: WEEKLY_RESET, windowSeconds: WEEK_SECONDS },
    )
    expect(selectNearLimitPlanUsage({ usage, activeProviderID: "anthropic" })).toEqual([])
    expect(selectNearLimitPlanUsage({ usage, activeProviderID: undefined })).toEqual([])
  })

  test("ignores a spent window that is neither 5-hour nor weekly", () => {
    expect(
      selectNearLimitPlanUsage({
        usage: readyUsage(
          { usedPercent: 99, resetsAt: FIVE_HOUR_RESET, windowSeconds: 60 * 60 },
          { usedPercent: 99, resetsAt: WEEKLY_RESET, windowSeconds: 60 },
        ),
        activeProviderID: "openai",
      }),
    ).toEqual([])
  })
})
