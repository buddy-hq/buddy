import { existsSync, readdirSync, statSync } from "node:fs"
import { rm, writeFile } from "node:fs/promises"
import path from "node:path"

export type GeneratedSdkFreshnessInput = {
  generatedOutputs: readonly string[]
  successMarker: string
  sourcePaths: readonly string[]
}

export type GeneratedSdkSourcePathsInput = {
  backendSourcePaths: readonly string[]
  repositoryRoot: string
  sdkDir: string
}

const GENERATED_SDK_OUTPUT_PATHS = [
  "src/gen/sdk.gen.ts",
  "src/gen/types.gen.ts",
  "src/gen/client/index.ts",
] as const
const GENERATED_SDK_SUCCESS_MARKER_PATH = "src/gen/.generation-complete"

export function generatedSdkSourcePaths(input: GeneratedSdkSourcePathsInput): string[] {
  return [
    ...input.backendSourcePaths,
    path.resolve(input.sdkDir, "scripts/generate.ts"),
    path.resolve(input.sdkDir, "package.json"),
    path.resolve(input.repositoryRoot, "bun.lock"),
  ]
}

export function generatedSdkFreshnessInput(
  input: GeneratedSdkSourcePathsInput,
): GeneratedSdkFreshnessInput {
  return {
    generatedOutputs: GENERATED_SDK_OUTPUT_PATHS.map((outputPath) =>
      path.resolve(input.sdkDir, outputPath),
    ),
    successMarker: path.resolve(input.sdkDir, GENERATED_SDK_SUCCESS_MARKER_PATH),
    sourcePaths: generatedSdkSourcePaths(input),
  }
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
    (sourcePath) => !existsSync(sourcePath) || newestModificationTimeMs(sourcePath) > generatedAt,
  )
}

export async function ensureGeneratedSdk(
  input: GeneratedSdkFreshnessInput,
  generate: () => Promise<void>,
): Promise<boolean> {
  if (!generatedSdkNeedsRefresh(input)) return false

  await rm(input.successMarker, { force: true })
  await generate()
  await writeFile(input.successMarker, "")
  return true
}
