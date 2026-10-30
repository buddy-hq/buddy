import { OPENAI_PROVIDER_ID } from "@/lib/provider-ids"
import type { OpenAIUsageSnapshot } from "@/state/openai-usage-query"

const NEAR_LIMIT_USED_PERCENT = 85
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const FIVE_HOUR_WINDOW_HOURS = 5
const WEEKLY_WINDOW_DAYS = 7

type TReadyPlanUsage = Extract<OpenAIUsageSnapshot, { status: "ready" }>
type TPlanUsageWindowSnapshot = TReadyPlanUsage["rateLimit"]["primary"]

export type TPlanUsageWindow = "five-hour" | "weekly"

export type TNearLimitPlanUsage = {
  readonly window: TPlanUsageWindow
  readonly usedPercent: number
  readonly resetsAt: string
}

export type TNearLimitPlanUsageInput = {
  readonly usage: OpenAIUsageSnapshot | undefined
  readonly activeProviderID: string | undefined
}

function planUsageWindow(windowSeconds: number): TPlanUsageWindow | undefined {
  const totalMinutes = Math.max(1, Math.round(windowSeconds / SECONDS_PER_MINUTE))
  const totalHours = totalMinutes / MINUTES_PER_HOUR
  const totalDays = totalHours / HOURS_PER_DAY
  if (totalDays === WEEKLY_WINDOW_DAYS) return "weekly"
  if (totalHours === FIVE_HOUR_WINDOW_HOURS) return "five-hour"
  return undefined
}

function nearLimitWindow(usageWindow: TPlanUsageWindowSnapshot): TNearLimitPlanUsage | undefined {
  if (usageWindow === null || usageWindow.usedPercent < NEAR_LIMIT_USED_PERCENT) return undefined
  const kind = planUsageWindow(usageWindow.windowSeconds)
  if (kind === undefined) return undefined
  return {
    window: kind,
    usedPercent: usageWindow.usedPercent,
    resetsAt: usageWindow.resetsAt,
  }
}

export function selectNearLimitPlanUsage(
  input: TNearLimitPlanUsageInput,
): readonly TNearLimitPlanUsage[] {
  if (input.activeProviderID !== OPENAI_PROVIDER_ID) return []
  const usage = input.usage
  if (!usage || usage.status !== "ready") return []
  return [usage.rateLimit.primary, usage.rateLimit.secondary].flatMap((usageWindow) => {
    const selected = nearLimitWindow(usageWindow)
    return selected === undefined ? [] : [selected]
  })
}
