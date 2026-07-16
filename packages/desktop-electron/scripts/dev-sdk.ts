import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

export type GeneratedSdkFreshnessInput = {
  generatedOutputs: readonly string[]
  successMarker: string
  sourcePaths: readonly string[]
}

export type GeneratedSdkSourcePathsInput = {
  repositoryRoot: string
  backendDir: string
  adapterDir: string
  sdkDir: string
}

export function generatedSdkSourcePaths(input: GeneratedSdkSourcePathsInput): string[] {
  const vendoredOpenCodePackagesDir = path.resolve(
    input.repositoryRoot,
    "vendor/opencode/packages",
  )

  return [
    path.resolve(input.backendDir, "src"),
    path.resolve(input.adapterDir, "src"),
    path.resolve(vendoredOpenCodePackagesDir, "core/src"),
    path.resolve(vendoredOpenCodePackagesDir, "opencode/src"),
    path.resolve(vendoredOpenCodePackagesDir, "schema/src"),
    path.resolve(input.sdkDir, "scripts/generate.ts"),
    path.resolve(input.sdkDir, "package.json"),
    path.resolve(input.repositoryRoot, "bun.lock"),
  ]
}

function newestModificationTimeMs(sourcePath: string): number {
  const stats = statSync(sourcePath)
  if (!stats.isDirectory()) return stats.mtimeMs

  let newest = stats.mtimeMs
  for (const entry of readdirSync(sourcePath, { withFileTypes: true })) {
    const entryPath = path.join(sourcePath, entry.name)
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestModificationTimeMs(entryPath))
      continue
    }
    if (entry.isFile()) {
      newest = Math.max(newest, statSync(entryPath).mtimeMs)
    }
  }
  return newest
}

export function generatedSdkNeedsRefresh(input: GeneratedSdkFreshnessInput): boolean {
  if (!existsSync(input.successMarker)) return true
  if (input.generatedOutputs.some((outputPath) => !existsSync(outputPath))) return true

  const generatedAt = statSync(input.successMarker).mtimeMs
  return input.sourcePaths.some(
    (sourcePath) =>
      !existsSync(sourcePath) || newestModificationTimeMs(sourcePath) > generatedAt,
  )
}
