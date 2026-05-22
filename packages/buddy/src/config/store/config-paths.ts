import fs from "node:fs"
import path from "node:path"
import { resolveProjectConfigRoot } from "../../project/project-info"
import { Global } from "../../storage"

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
  const scopedDirectory = path.resolve(directory)
  const worktree = path.resolve(await resolveProjectConfigRoot(scopedDirectory))
  const configDirectory = isFilesystemRootDirectory(worktree) ? scopedDirectory : worktree
  return {
    directory: scopedDirectory,
    configDirectory,
  }
}

export function resolveProjectConfigFile(directory: string): string {
  const jsonc = path.join(directory, "buddy.jsonc")
  if (fs.existsSync(jsonc)) return jsonc

  const json = path.join(directory, "buddy.json")
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
