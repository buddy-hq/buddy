import path from "node:path"
import { promises as fs } from "node:fs"
import type {
  Citation,
  CitationLineRange,
  CitationProviderLocation,
  CitationTextSelector,
} from "@buddy/citation-contract"
import { findCitationText } from "@buddy/citation-contract"

const MAX_LINE_LOOKUP_BYTES = 4 * 1024 * 1024

export type CitationLocationContext = {
  directory: string
  sessionID?: string
}

function lineAt(text: string, offset: number): number {
  let line = 1
  for (
    let index = text.indexOf("\n");
    index !== -1 && index < offset;
    index = text.indexOf("\n", index + 1)
  ) {
    line += 1
  }
  return line
}

function projectMarkdownLine(line: string): string {
  if (/^\s*(?:`{3,}|~{3,})/u.test(line)) return ""
  if (/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/u.test(line)) return ""

  return line
    .replace(/^\s*\[[^\]]+\]:\s+\S+.*$/u, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/gu, "$1")
    .replace(/!?\[\[([^\]|]+)\|([^\]]+)\]\]/gu, "$2")
    .replace(/!?\[\[([^\]]+)\]\]/gu, "$1")
    .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/gu, "$1")
    .replace(/<[^>]+>/gu, "")
    .replace(/^\s*(?:(?:#{1,6}|>|[-+*]|\d+[.)])\s+)+/u, "")
    .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/gu, "$1")
    .replace(/[`*_~]/gu, "")
}

function projectMarkdown(text: string): string {
  return text.split("\n").map(projectMarkdownLine).join("\n")
}

function rawTextOffset(text: string, normalizedOffset: number): number {
  let offset = 0
  for (const match of text.matchAll(/\s+|\S+/gu)) {
    const whitespace = /\s/u.test(match[0][0] ?? "")
    const length = whitespace ? 1 : match[0].length
    if (normalizedOffset <= offset + length) {
      return (
        match.index +
        (whitespace && normalizedOffset > offset ? match[0].length : normalizedOffset - offset)
      )
    }
    offset += length
  }
  return text.length
}

export function findCitationLineRange(
  text: string,
  excerpt: string,
  selector: CitationTextSelector,
): CitationLineRange | undefined {
  const projectedSource = projectMarkdown(text)
  const projectedExcerpt = projectMarkdown(excerpt)
  const match = findCitationText(projectedSource, projectedExcerpt, {
    ...selector,
    prefix: projectMarkdown(selector.prefix),
    suffix: projectMarkdown(selector.suffix),
  })
  if (!match) return undefined

  const startOffset = rawTextOffset(projectedSource, match.start)
  const endOffset = rawTextOffset(projectedSource, match.end)
  const startLine = lineAt(projectedSource, startOffset)
  const endLine = lineAt(projectedSource, Math.max(startOffset, endOffset - 1))
  return { start: startLine, end: Math.max(startLine, endLine) }
}

async function readSmallTextFile(filePath: string): Promise<string | undefined> {
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile() || stat.size > MAX_LINE_LOOKUP_BYTES) return undefined
    return await fs.readFile(filePath, "utf8")
  } catch {
    return undefined
  }
}

function isPathInsideWorkspace(workspaceRoot: string, candidatePath: string): boolean {
  const relativePath = path.relative(workspaceRoot, candidatePath)
  return (
    relativePath.length === 0 ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  )
}

async function resolvedFilesystemPath(candidatePath: string): Promise<string | undefined> {
  let existingPath = path.resolve(candidatePath)
  const missingSegments: string[] = []
  while (true) {
    try {
      return path.resolve(await fs.realpath(existingPath), ...missingSegments)
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        return undefined
      }
      const parent = path.dirname(existingPath)
      if (parent === existingPath) return undefined
      missingSegments.unshift(path.basename(existingPath))
      existingPath = parent
    }
  }
}

async function workspaceSourcePath(
  source: { directory?: string; path?: string },
  directory: string,
): Promise<string | undefined> {
  if (!source.path || path.isAbsolute(source.path) || source.path.startsWith("~/")) {
    return undefined
  }

  const workspaceRoot = path.resolve(directory)
  const sourceDirectory =
    source.directory === undefined
      ? workspaceRoot
      : path.isAbsolute(source.directory)
        ? path.resolve(source.directory)
        : path.resolve(workspaceRoot, source.directory)
  if (!isPathInsideWorkspace(workspaceRoot, sourceDirectory)) return undefined

  const sourcePath = path.resolve(sourceDirectory, source.path)
  if (!isPathInsideWorkspace(workspaceRoot, sourcePath)) return undefined
  const [resolvedWorkspaceRoot, resolvedSourcePath] = await Promise.all([
    resolvedFilesystemPath(workspaceRoot),
    resolvedFilesystemPath(sourcePath),
  ])
  if (
    !resolvedWorkspaceRoot ||
    !resolvedSourcePath ||
    !isPathInsideWorkspace(resolvedWorkspaceRoot, resolvedSourcePath)
  ) {
    return undefined
  }
  return sourcePath
}

export async function resolveCitationProviderLocation(
  citation: Citation,
  context: CitationLocationContext,
): Promise<CitationProviderLocation> {
  const session =
    context.sessionID === undefined ? undefined : { currentSessionID: context.sessionID }
  const { source } = citation
  if (source.kind === "chat" || source.kind === "web") return Object.assign({}, session)
  const absolutePath = await workspaceSourcePath(source, context.directory)
  if (!absolutePath) return Object.assign({}, session)
  if (source.kind === "reading") return Object.assign({ absolutePath }, session)
  const text = await readSmallTextFile(absolutePath)
  const lines = text ? findCitationLineRange(text, citation.excerpt, source.selector) : undefined
  return Object.assign({ absolutePath }, lines ? { lines } : undefined, session)
}
