const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24

/**
 * Formatting helpers for ChatGPT usage snapshots, shared between the provider
 * settings card and the composer token counter so their labels never drift.
 */

export function formatChatGptPlan(plan: string | null | undefined) {
  if (!plan) return ""

  return plan
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase()
      if (lower === "k12") return "K12"
      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`
    })
    .join(" ")
}

export function formatUsageWindowLabel(windowSeconds: number) {
  const totalMinutes = Math.max(1, Math.round(windowSeconds / SECONDS_PER_MINUTE))
  const totalHours = totalMinutes / MINUTES_PER_HOUR
  const totalDays = totalHours / HOURS_PER_DAY

  if (Number.isInteger(totalDays)) {
    return `${totalDays}-day limit`
  }
  if (Number.isInteger(totalHours)) {
    return `${totalHours}-hour limit`
  }
  return `${totalMinutes}-minute limit`
}

export function formatRelativeTime(timestamp: string, now = Date.now()) {
  const target = Date.parse(timestamp)
  if (!Number.isFinite(target)) return timestamp

  const differenceMinutes = Math.round((target - now) / (SECONDS_PER_MINUTE * 1_000))
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  const absoluteMinutes = Math.abs(differenceMinutes)
  if (absoluteMinutes < MINUTES_PER_HOUR) {
    return formatter.format(differenceMinutes, "minute")
  }

  const differenceHours = Math.round(differenceMinutes / MINUTES_PER_HOUR)
  if (Math.abs(differenceHours) < HOURS_PER_DAY) {
    return formatter.format(differenceHours, "hour")
  }

  return formatter.format(Math.round(differenceHours / HOURS_PER_DAY), "day")
}

export function resolveUsageRemainingPercent(usedPercent: number) {
  return 100 - Math.max(0, Math.min(usedPercent, 100))
}

export function formatCompactTokens(count: number): string {
  if (count < 1_000) return `${count}`
  if (count < 1_000_000) {
    const k = count / 1_000
    const formatted = Number.isInteger(k) ? `${k}` : k.toFixed(1)
    return `${formatted}k`
  }
  const m = count / 1_000_000
  const formatted = Number.isInteger(m) ? `${m.toFixed(1)}` : m.toFixed(1)
  return `${formatted}M`
}
