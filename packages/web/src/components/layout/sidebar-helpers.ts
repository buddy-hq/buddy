import { parseTString } from "@/components/chat/tools/types"

export function getFilename(input: string) {
  const cleaned = input.replace(/[\\/]+$/, "")
  const parts = cleaned.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? input
}

export const workspaceKey = (directory: string) => {
  const drive = directory.match(/^([A-Za-z]:)[\\/]+$/)
  if (drive) return `${drive[1]}${directory.includes("\\") ? "\\" : "/"}`
  if (/^[\\/]+$/.test(directory)) return directory.includes("\\") ? "\\" : "/"
  return directory.replace(/[\\/]+$/, "")
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

export function getDraggableId<TEvent>(event: TEvent): string | undefined {
  if (!(event instanceof Object) || Array.isArray(event)) return undefined
  if (!("draggable" in event)) return undefined
  const draggable = event.draggable
  if (!(draggable instanceof Object) || Array.isArray(draggable)) return undefined
  if (!("id" in draggable)) return undefined
  return parseTString(draggable.id)
}

export const displayName = (project: { name?: string; worktree: string }) =>
  project.name || getFilename(project.worktree)

export function errorMessage<TError>(err: TError, fallback: string) {
  if (err instanceof Object && !Array.isArray(err) && "data" in err) {
    const data = err.data
    if (data instanceof Object && !Array.isArray(data) && "message" in data) {
      const message = parseTString(data.message)
      if (message) return message
    }
  }
  if (err instanceof Error) return err.message
  return fallback
}

export const syncWorkspaceOrder = (local: string, directories: string[], existing?: string[]) => {
  if (!existing) return directories
  const keep = existing.filter((entry) => entry !== local && directories.includes(entry))
  const missing = directories.filter((entry) => entry !== local && !existing.includes(entry))
  return [local, ...missing, ...keep]
}
