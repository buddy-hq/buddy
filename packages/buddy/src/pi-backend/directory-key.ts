import path from "node:path"
import { realpathSync } from "node:fs"

export function directoryKey(directory: string) {
  const resolved = path.resolve(directory)
  try {
    return realpathSync.native(resolved)
  } catch {
    return resolved
  }
}
