import { open, readFile, readdir, readlink, stat } from "node:fs/promises"

export type ProtectedFileRead =
  | { readonly _tag: "read"; readonly bytes: Uint8Array }
  | { readonly _tag: "accessDenied" }
  | { readonly _tag: "failed"; readonly cause: unknown }

export type FileOpenProbe = "opened" | "accessDenied" | "busy" | "failed"

export type SymlinkRead =
  | { readonly _tag: "target"; readonly target: string }
  | { readonly _tag: "missing" }
  | { readonly _tag: "unreadable" }

export type BrowserImportFiles = {
  isFile(path: string): Promise<boolean>
  readText(path: string): Promise<string | undefined>
  readBytes(path: string): Promise<ProtectedFileRead>
  listDirectory(path: string): Promise<readonly string[]>
  readSymlink(path: string): Promise<SymlinkRead>
  probeOpen(path: string, access: "read" | "readWrite"): Promise<FileOpenProbe>
}

export function hasSystemErrorCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && "code" in cause && cause.code === code
}

export const nodeBrowserImportFiles: BrowserImportFiles = {
  async isFile(path) {
    try {
      return (await stat(path)).isFile()
    } catch {
      return false
    }
  },
  async readText(path) {
    try {
      return await readFile(path, "utf8")
    } catch {
      return undefined
    }
  },
  async readBytes(path) {
    try {
      return { _tag: "read", bytes: await readFile(path) }
    } catch (cause) {
      // macOS privacy protection (TCC) refuses with EPERM; Full Disk Access cannot fix EACCES.
      return hasSystemErrorCode(cause, "EPERM")
        ? { _tag: "accessDenied" }
        : { _tag: "failed", cause }
    }
  },
  async listDirectory(path) {
    try {
      return await readdir(path)
    } catch {
      return []
    }
  },
  async readSymlink(path) {
    try {
      return { _tag: "target", target: await readlink(path) }
    } catch (cause) {
      return hasSystemErrorCode(cause, "ENOENT") ? { _tag: "missing" } : { _tag: "unreadable" }
    }
  },
  async probeOpen(path, access) {
    try {
      const handle = await open(path, access === "read" ? "r" : "r+")
      await handle.close()
      return "opened"
    } catch (cause) {
      if (hasSystemErrorCode(cause, "EPERM")) return "accessDenied"
      // libuv reports Windows sharing violations as EBUSY.
      if (hasSystemErrorCode(cause, "EBUSY")) return "busy"
      return "failed"
    }
  },
}
