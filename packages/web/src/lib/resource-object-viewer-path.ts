import { isMarkdownBenchPath } from "@buddy/workspace-file-policy"
import { fileExtensionFromPath, normalizeRelativePath } from "./workspace-file-paths"

const READING_FILE_EXTENSIONS = new Set(["epub", "pdf"])

export type ResourceObjectViewerPath =
  | {
      path: string
      viewer: "reading"
    }
  | {
      path: string
      viewer: "markdown"
    }

export type ResourceObjectPathRecord = {
  readerPath?: string | null
  sourceOriginRelpath?: string | null
  sourceRelpath?: string | null
}

function normalizeCandidate(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  const normalized = normalizeRelativePath(path)
  return normalized.length > 0 ? normalized : undefined
}

function firstMatchingPath(
  paths: Array<string | null | undefined>,
  predicate: (path: string) => boolean,
): string | undefined {
  for (const path of paths) {
    const normalized = normalizeCandidate(path)
    if (normalized && predicate(normalized)) return normalized
  }
  return undefined
}

function isReadingPath(path: string): boolean {
  return READING_FILE_EXTENSIONS.has(fileExtensionFromPath(path))
}

export function resolveResourceObjectViewerPath(
  record: ResourceObjectPathRecord | undefined,
): ResourceObjectViewerPath | undefined {
  if (!record) return undefined

  const readingPath = firstMatchingPath(
    [record.readerPath, record.sourceOriginRelpath, record.sourceRelpath],
    isReadingPath,
  )
  if (readingPath) {
    return {
      path: readingPath,
      viewer: "reading",
    }
  }

  const markdownPath = firstMatchingPath(
    [record.sourceOriginRelpath, record.sourceRelpath, record.readerPath],
    isMarkdownBenchPath,
  )
  if (markdownPath) {
    return {
      path: markdownPath,
      viewer: "markdown",
    }
  }

  return undefined
}

export function resolveResourceObjectViewerPathWithFallback(input: {
  record: ResourceObjectPathRecord | undefined
  authoritativeReaderPath: string | null
}): ResourceObjectViewerPath | undefined {
  return resolveResourceObjectViewerPath(
    input.record ?? { readerPath: input.authoritativeReaderPath },
  )
}
