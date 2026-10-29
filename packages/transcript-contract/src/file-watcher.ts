import { isJsonObject, parseStringValue } from "./parse-external"

const WORKSPACE_FILE_WATCHER_UPDATED_EVENT_TYPE = "file.watcher.updated"

export type WorkspaceFileWatcherEventKind = "add" | "change" | "unlink"

export type WorkspaceFileWatcherUpdate = {
  event: WorkspaceFileWatcherEventKind
  absolutePath: string
  relativePath?: string
}

function parseWorkspaceFileWatcherEventKind<TValue>(
  value: TValue,
): WorkspaceFileWatcherEventKind | undefined {
  if (value === "add") return "add"
  if (value === "change") return "change"
  if (value === "unlink") return "unlink"
  return undefined
}

export function readWorkspaceFileWatcherUpdatePayload<TPayload>(
  payload: TPayload,
): WorkspaceFileWatcherUpdate | undefined {
  if (!isJsonObject(payload)) return undefined
  if (payload.type !== WORKSPACE_FILE_WATCHER_UPDATED_EVENT_TYPE) return undefined
  if (!isJsonObject(payload.properties)) return undefined

  const absolutePath = parseStringValue(payload.properties.file)
  const event = parseWorkspaceFileWatcherEventKind(payload.properties.event)
  const relativePath = parseStringValue(payload.properties.relativePath)

  if (absolutePath === undefined || event === undefined) {
    return undefined
  }

  return Object.assign(
    {
      event,
      absolutePath,
    } as const,
    relativePath !== undefined ? { relativePath } : undefined,
  )
}

export { WORKSPACE_FILE_WATCHER_UPDATED_EVENT_TYPE }
