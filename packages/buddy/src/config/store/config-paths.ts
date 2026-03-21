import fs from 'node:fs'
import path from 'node:path'
import { Instance as OpenCodeInstance } from '@buddy/opencode-adapter/instance'
import { Global } from '../../storage'

export interface ProjectConfigContext {
  directory: string
  configDirectory: string
}

export async function resolveProjectConfigContext(
  directory: string,
): Promise<ProjectConfigContext> {
  const normalized = path.resolve(directory)
  return OpenCodeInstance.provide({
    directory: normalized,
    fn: () => {
      const scopedDirectory = path.resolve(OpenCodeInstance.directory)
      const worktree = path.resolve(OpenCodeInstance.worktree)
      const configDirectory = worktree !== '/' ? worktree : scopedDirectory
      return {
        directory: scopedDirectory,
        configDirectory,
      }
    },
  })
}

export function resolveProjectConfigFile(directory: string): string {
  const jsonc = path.join(directory, 'buddy.jsonc')
  if (fs.existsSync(jsonc)) return jsonc

  const json = path.join(directory, 'buddy.json')
  if (fs.existsSync(json)) return json

  return jsonc
}

export function resolveGlobalConfigFile(): string {
  const candidates = ['buddy.jsonc', 'buddy.json'].map((file) =>
    path.join(Global.Path.config, file),
  )
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return candidates[0]
}
