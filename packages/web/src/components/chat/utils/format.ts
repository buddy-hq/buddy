export function formatDuration(ms?: number): string {
  if (ms === undefined || ms < 0) return ""
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
}

export function formatThoughtDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
}

export function formatThoughtForLabel(ms: number): string {
  return `Thought for ${formatThoughtDuration(ms)}`
}

export function formatTime(ms?: number): string {
  if (ms === undefined) return ""
  const date = new Date(ms)
  const hours = date.getHours()
  const hour12 = hours % 12 || 12
  const minute = String(date.getMinutes()).padStart(2, "0")
  return `${hour12}:${minute} ${hours < 12 ? "AM" : "PM"}`
}

export function titleCase(value?: string): string {
  if (!value) return ""
  return value[0]?.toUpperCase() + value.slice(1)
}
