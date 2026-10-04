import { formatRelativeTime } from "@/state/openai-usage-format"

/** Format message age, using a quiet label for the first minute. */
export function formatMessageElapsedTime(timestamp: string, now = Date.now()) {
  const elapsed = Math.max(0, now - Date.parse(timestamp))
  return elapsed < 60_000 ? "just now" : formatRelativeTime(timestamp, now)
}
