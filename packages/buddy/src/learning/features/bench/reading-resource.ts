import fs from "node:fs/promises"
import path from "node:path"

const BENCH_READING_RESOURCE_EXTENSION_PDF = ".pdf" as const
const BENCH_READING_RESOURCE_EXTENSION_EPUB = ".epub" as const
const BENCH_READING_RESOURCE_EXTENSIONS = new Set<string>([
  BENCH_READING_RESOURCE_EXTENSION_PDF,
  BENCH_READING_RESOURCE_EXTENSION_EPUB,
])

function normalizeWorkspaceRelativePath(filepath: string): string | undefined {
  const normalized = filepath.replaceAll("\\", "/").replace(/^\.\//u, "").trim()
  if (!normalized || path.isAbsolute(normalized) || normalized.startsWith("../")) {
    return undefined
  }
  return normalized
}

function absoluteWorkspacePath(input: { directory: string; relativePath: string }): string {
  return path.resolve(input.directory, input.relativePath)
}

export function isBenchReadingResourcePath(filepath: string): boolean {
  return BENCH_READING_RESOURCE_EXTENSIONS.has(path.extname(filepath).toLowerCase())
}

export async function resolveBenchReadingResourceRelpath(input: {
  directory: string
  sourceRelpath: string
  sourceOriginRelpath?: string
}): Promise<string | undefined> {
  const candidates = [input.sourceOriginRelpath, input.sourceRelpath].filter(
    (candidate): candidate is string => Boolean(candidate),
  )
  const workspaceRoot = path.resolve(input.directory)

  for (const candidate of candidates) {
    const relativePath = normalizeWorkspaceRelativePath(candidate)
    if (!relativePath || !isBenchReadingResourcePath(relativePath)) {
      continue
    }

    const absolutePath = absoluteWorkspacePath({
      directory: input.directory,
      relativePath,
    })
    const relativeFromRoot = path.relative(workspaceRoot, absolutePath)
    if (relativeFromRoot.startsWith("..") || path.isAbsolute(relativeFromRoot)) {
      continue
    }

    const stats = await fs.stat(absolutePath).catch(() => undefined)
    if (stats?.isFile()) return relativePath
  }

  return undefined
}
