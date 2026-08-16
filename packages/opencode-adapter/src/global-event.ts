import path from "node:path"
import { GlobalBus } from "opencode/bus/global"
import { WORKSPACE_FILE_WATCHER_UPDATED_EVENT_TYPE } from "./file-watcher"

type BuddyGlobalEvent = {
  directory?: string
  project?: string
  workspace?: string
  payload: unknown
}

type BuddyFileSystemChangeEvent = "add" | "change"

const FILE_EDITED_EVENT_TYPE = "file.edited"

function workspaceRelativeFilePath(directory: string, filePath: string): string | undefined {
  const relativePath = path.relative(path.resolve(directory), path.resolve(filePath))
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return undefined
  }
  return relativePath
}

function publishGlobalEvent(event: BuddyGlobalEvent): void {
  GlobalBus.emit("event", event)
}

function subscribeGlobalEvent(listener: (event: BuddyGlobalEvent) => void): () => void {
  GlobalBus.on("event", listener)
  return () => GlobalBus.off("event", listener)
}

function publishFileSystemChange(input: {
  directory: string
  filePath: string
  event: BuddyFileSystemChangeEvent
}): void {
  const relativePath = workspaceRelativeFilePath(input.directory, input.filePath)
  publishGlobalEvent({
    directory: input.directory,
    payload: {
      type: FILE_EDITED_EVENT_TYPE,
      properties: { file: input.filePath },
    },
  })
  publishGlobalEvent({
    directory: input.directory,
    payload: {
      type: WORKSPACE_FILE_WATCHER_UPDATED_EVENT_TYPE,
      properties: Object.assign(
        {
          file: input.filePath,
          event: input.event,
        },
        relativePath ? { relativePath } : undefined,
      ),
    },
  })
}

export {
  publishFileSystemChange,
  publishGlobalEvent,
  subscribeGlobalEvent,
  workspaceRelativeFilePath,
}
export type { BuddyFileSystemChangeEvent, BuddyGlobalEvent }
