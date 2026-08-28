export function getFilename(input: string) {
  const cleaned = input.replace(/[\\/]+$/, "")
  const parts = cleaned.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? input
}

export function projectInitials(directory: string) {
  const label = getFilename(directory)
  const parts = label
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)

  const initials = parts.map((part) => part[0]?.toUpperCase() ?? "").join("")
  return initials || label.slice(0, 2).toUpperCase()
}

export function relativeTime(timestamp: number) {
  const delta = timestamp - Date.now()
  const abs = Math.abs(delta)
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

  if (abs < 60_000) return "just now"
  if (abs < 3_600_000) return formatter.format(Math.round(delta / 60_000), "minute")
  if (abs < 86_400_000) return formatter.format(Math.round(delta / 3_600_000), "hour")
  if (abs < 2_592_000_000) return formatter.format(Math.round(delta / 86_400_000), "day")
  return formatter.format(Math.round(delta / 2_592_000_000), "month")
}
