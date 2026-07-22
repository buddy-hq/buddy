import matter from "gray-matter"
import {
  RESOURCE_PACK_CHUNKS_DIR_NAME,
  RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
  RESOURCE_PACK_ENTRYPOINT_TITLE,
  RESOURCE_PACK_FILE_KIND_RESOURCE_INDEX,
  RESOURCE_PACK_FULL_TEXT_FILE_PREFIX,
  RESOURCE_PACK_NO_TEXT_MARKER,
  RESOURCE_PACK_PAGES_DIR_NAME,
  RESOURCE_PACK_TOC_FILE_NAME,
  RESOURCE_PACK_TOC_TITLE,
  type ResourcePackMetadata,
} from "./contracts"

export function renderPageMarkdown(pageNumber: number, text: string) {
  const body = text.trim().length > 0 ? text.trim() : RESOURCE_PACK_NO_TEXT_MARKER
  return `# Page ${pageNumber}\n\n${body}`
}

export function renderNoTextMarkdown(label: string) {
  return `# ${label}\n\n${RESOURCE_PACK_NO_TEXT_MARKER}`
}

export function renderTocMarkdown(lines: string[]) {
  return [`# ${RESOURCE_PACK_TOC_TITLE}`, "", ...lines].join("\n").trim()
}

export function buildHeadingTocMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const tocLines: string[] = []

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.*)$/)
    if (!match) continue
    const depth = match[1].length - 1
    tocLines.push(`${"  ".repeat(depth)}- ${match[2]?.trim() ?? ""}`)
  }

  if (tocLines.length === 0) return undefined
  return renderTocMarkdown(tocLines)
}

export function buildResourcePackEntryMarkdown(metadata: ResourcePackMetadata) {
  const artifactLines = (metadata.text_artifacts ?? []).map(
    (artifactPath) => `- Text artifact: \`${artifactPath}\``,
  )
  return matter.stringify(
    [
      `# ${RESOURCE_PACK_ENTRYPOINT_TITLE}`,
      "",
      `Source: \`${metadata.source_relpath}\``,
      "",
      "## How to use this pack",
      "",
      `- Start with \`${RESOURCE_PACK_TOC_FILE_NAME}\` if it exists.`,
      "- Search this directory with `grep`.",
      `- Read matching files in \`${RESOURCE_PACK_CHUNKS_DIR_NAME}/\`.`,
      `- Fall back to \`${RESOURCE_PACK_PAGES_DIR_NAME}/\` when the structure is weak.`,
      `- Use \`${RESOURCE_PACK_FULL_TEXT_FILE_PREFIX}-*.md\` if you want the entire extracted text.`,
      "- Use the original source path if you want to run your own conversion flow.",
      ...(artifactLines.length > 0
        ? ["- Read linked text artifacts directly when a chunk points to one."]
        : []),
      "",
      "## Pack Files",
      "",
      `- Entry point: \`${RESOURCE_PACK_ENTRYPOINT_FILE_NAME}\``,
      `- Full text: \`${RESOURCE_PACK_FULL_TEXT_FILE_PREFIX}-*.md\``,
      `- TOC: \`${RESOURCE_PACK_TOC_FILE_NAME}\``,
      `- Chunks: \`${RESOURCE_PACK_CHUNKS_DIR_NAME}/\``,
      `- Pages: \`${RESOURCE_PACK_PAGES_DIR_NAME}/\``,
      ...artifactLines,
    ].join("\n"),
    {
      file_kind: RESOURCE_PACK_FILE_KIND_RESOURCE_INDEX,
      ...(metadata.object_id ? { object_id: metadata.object_id } : {}),
      resource_alias: metadata.resource_alias,
      ...(metadata.alias_at_build ? { alias_at_build: metadata.alias_at_build } : {}),
      source_path: metadata.source_path,
      source_relpath: metadata.source_relpath,
      format: metadata.format,
      status: metadata.status,
      extractor: metadata.extractor,
      prepared_at: metadata.prepared_at,
      source_mtime_ms: metadata.source_mtime_ms,
      source_size_bytes: metadata.source_size_bytes,
      chunk_count: metadata.chunk_count,
      warnings: metadata.warnings,
      ...(metadata.full_text_file ? { full_text_file: metadata.full_text_file } : {}),
      ...(metadata.text_artifacts && metadata.text_artifacts.length > 0
        ? { text_artifacts: metadata.text_artifacts }
        : {}),
      ...(metadata.page_count !== undefined ? { page_count: metadata.page_count } : {}),
      ...(metadata.cover_relpath ? { cover_relpath: metadata.cover_relpath } : {}),
      ...(metadata.title ? { title: metadata.title } : {}),
      ...(metadata.author ? { author: metadata.author } : {}),
    },
  )
}
