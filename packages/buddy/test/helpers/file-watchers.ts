import { temporaryEnvironment, type TemporaryEnvironment } from "./temporary-environment"

export const fileWatchersSupported = process.platform !== "linux"

export function enableFileWatchers(): TemporaryEnvironment {
  return temporaryEnvironment({ OPENCODE_FILEWATCHER_DISABLE: "0" })
}
