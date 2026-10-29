import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { parseNodeErrorCode } from "../parse-values"

export function canonicalizeRuntimeConfigDirectory(directory: string): string {
  const resolved = path.resolve(directory)
  const canonical = fs.realpathSync.native(resolved)
  return process.platform === "win32" ? canonical.toLowerCase() : canonical
}

export function canonicalizeExistingRuntimeConfigDirectory(directory: string): string | undefined {
  try {
    return canonicalizeRuntimeConfigDirectory(directory)
  } catch (error) {
    const code = parseNodeErrorCode(error)
    if (code === "ENOENT" || code === "ENOTDIR") return undefined
    throw error
  }
}

export function isWithinDirectory(
  root: string,
  target: string,
  pathApi: Pick<typeof path, "relative" | "isAbsolute" | "sep"> = path,
): boolean {
  const relative = pathApi.relative(root, target)
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relative))
  )
}

export async function resolveNotebookWorktree(directory: string): Promise<string> {
  let current = canonicalizeRuntimeConfigDirectory(directory)
  const scoped = current
  while (true) {
    const git = await fsp.stat(path.join(current, ".git")).catch(() => undefined)
    if (git?.isDirectory() || git?.isFile()) return current
    const parent = path.dirname(current)
    if (parent === current) return scoped
    current = parent
  }
}
