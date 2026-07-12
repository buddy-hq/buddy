import ParcelWatcher from "@parcel/watcher"
import type { WorkspaceFileWatcherUpdate } from "./file-watcher"

type NativeWorkspaceFileWatcherOptions = {
  directory: string
  ignore: readonly string[]
  onError(error: Error): void
  onUpdate(update: WorkspaceFileWatcherUpdate): void
}

function nativeWatcherBackend(): ParcelWatcher.BackendType | undefined {
  if (process.platform === "win32") return "windows"
  if (process.platform === "darwin") return "fs-events"
  if (process.platform === "linux") return "inotify"
  return undefined
}

export async function subscribeNativeWorkspaceFileWatcher(
  options: NativeWorkspaceFileWatcherOptions,
): Promise<ParcelWatcher.AsyncSubscription | undefined> {
  const backend = nativeWatcherBackend()
  if (!backend) return undefined

  return await ParcelWatcher.subscribe(
    options.directory,
    (error, events) => {
      if (error) {
        options.onError(error)
        return
      }
      for (const event of events) {
        options.onUpdate({
          absolutePath: event.path,
          event:
            event.type === "create" ? "add" : event.type === "update" ? "change" : "unlink",
        })
      }
    },
    {
      backend,
      ignore: [...options.ignore],
    },
  )
}
