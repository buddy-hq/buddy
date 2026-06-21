const WORKSPACE_FILE_WATCHER_UPDATED_EVENT_TYPE = "file.watcher.updated"

export type WorkspaceFileWatcherEventKind = "add" | "change" | "unlink"

export type WorkspaceFileWatcherUpdate = {
  event: WorkspaceFileWatcherEventKind
  absolutePath: string
  relativePath?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isWorkspaceFileWatcherEventKind(value: unknown): value is WorkspaceFileWatcherEventKind {
  return value === "add" || value === "change" || value === "unlink"
}

export function readWorkspaceFileWatcherUpdatePayload(
  payload: unknown,
): WorkspaceFileWatcherUpdate | undefined {
  if (!isRecord(payload)) return undefined
  if (payload.type !== WORKSPACE_FILE_WATCHER_UPDATED_EVENT_TYPE) return undefined
  if (!isRecord(payload.properties)) return undefined

  const absolutePath = payload.properties.file
  const event = payload.properties.event
  const relativePath = payload.properties.relativePath

  if (typeof absolutePath !== "string" || !isWorkspaceFileWatcherEventKind(event)) {
    return undefined
  }

  return {
    event,
    absolutePath,
    ...(typeof relativePath === "string" ? { relativePath } : {}),
  }
}

export { WORKSPACE_FILE_WATCHER_UPDATED_EVENT_TYPE }
