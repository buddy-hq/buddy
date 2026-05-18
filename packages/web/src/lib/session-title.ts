const DEFAULT_TITLE_PATTERN =
  /^(New session|Child session) - (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/

export function formatSessionTitle(title: string): string {
  const match = title.match(DEFAULT_TITLE_PATTERN)
  if (!match) return title

  const prefix = match[1] === "New session" ? "New Chat" : "Child Chat"
  const time = new Date(match[2]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  return `${prefix} - ${time}`
}
