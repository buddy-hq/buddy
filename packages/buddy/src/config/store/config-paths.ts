import fs from "node:fs"
import path from "node:path"
import { canonicalizeRuntimeConfigDirectory, resolveNotebookWorktree } from "./directories"
import { BUDDY_HOME_DIRECTORY_NAME, Global } from "../../storage"

type PathApi = Pick<typeof path, "parse" | "resolve">

export type ProjectConfigContext = {
  directory: string
  configDirectory: string
}

export function isFilesystemRootDirectory(directory: string, pathApi: PathApi = path): boolean {
  const resolved = pathApi.resolve(directory)
  return pathApi.parse(resolved).root === resolved
}

export async function resolveProjectConfigContext(
  directory: string,
): Promise<ProjectConfigContext> {
  const scopedDirectory = canonicalizeRuntimeConfigDirectory(directory)
  const worktree = await resolveNotebookWorktree(scopedDirectory)
  return {
    directory: scopedDirectory,
    configDirectory: isFilesystemRootDirectory(worktree) ? scopedDirectory : worktree,
  }
}

export function resolveProjectConfigFile(directory: string): string {
  const buddyDirectory = path.join(directory, BUDDY_HOME_DIRECTORY_NAME)
  const jsonc = path.join(buddyDirectory, "buddy.jsonc")
  if (fs.existsSync(jsonc)) return jsonc

  const json = path.join(buddyDirectory, "buddy.json")
  if (fs.existsSync(json)) return json

  return jsonc
}

export function resolveGlobalConfigFile(): string {
  const candidates = ["buddy.jsonc", "buddy.json"].map((file) =>
    path.join(Global.Path.config, file),
  )
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return candidates[0]
}
