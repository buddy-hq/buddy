import matter from 'gray-matter'
import {
  RESOURCE_PACK_CHUNKS_DIR_NAME,
  RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
  RESOURCE_PACK_ENTRYPOINT_TITLE,
  RESOURCE_PACK_FILE_KIND_RESOURCE_INDEX,
  RESOURCE_PACK_FULL_TEXT_FILE_PREFIX,
  RESOURCE_PACK_FULL_TEXT_FILE_NAME,
  RESOURCE_PACK_NO_TEXT_MARKER,
  RESOURCE_PACK_PAGES_DIR_NAME,
  RESOURCE_PACK_TOC_FILE_NAME,
  RESOURCE_PACK_TOC_TITLE,
  type ResourcePackMetadata,
} from './contracts'

export function renderPageMarkdown(pageNumber: number, text: string) {
  const body = text.trim().length > 0 ? text.trim() : RESOURCE_PACK_NO_TEXT_MARKER
  return `# Page ${pageNumber}\n\n${body}`
}

export function renderNoTextMarkdown(label: string) {
  return `# ${label}\n\n${RESOURCE_PACK_NO_TEXT_MARKER}`
}

export function renderTocMarkdown(lines: string[]) {
  return [`# ${RESOURCE_PACK_TOC_TITLE}`, '', ...lines].join('\n').trim()
}

export function buildHeadingTocMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const tocLines: string[] = []

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.*)$/)
    if (!match) continue
    const depth = match[1].length - 1
    tocLines.push(`${'  '.repeat(depth)}- ${match[2]?.trim() ?? ''}`)
  }

  if (tocLines.length === 0) return undefined
  return renderTocMarkdown(tocLines)
}

export function buildResourcePackEntryMarkdown(metadata: ResourcePackMetadata) {
  return matter.stringify(
    [
      `# ${RESOURCE_PACK_ENTRYPOINT_TITLE}`,
      '',
      `Source: \`${metadata.source_relpath}\``,
      '',
      '## How to use this pack',
      '',
      `- Start with \`${RESOURCE_PACK_TOC_FILE_NAME}\` if it exists.`,
      '- Search this directory with `grep`.',
      `- Read matching files in \`${RESOURCE_PACK_CHUNKS_DIR_NAME}/\`.`,
      `- Fall back to \`${RESOURCE_PACK_PAGES_DIR_NAME}/\` when the structure is weak.`,
      `- Use \`${RESOURCE_PACK_FULL_TEXT_FILE_PREFIX}-*.md\` if you want the entire extracted text.`,
      '- Use the original source path if you want to run your own conversion flow.',
      '',
      '## Pack Files',
      '',
      `- Entry point: \`${RESOURCE_PACK_ENTRYPOINT_FILE_NAME}\``,
      `- Full text: \`${RESOURCE_PACK_FULL_TEXT_FILE_PREFIX}-*.md\``,
      `- TOC: \`${RESOURCE_PACK_TOC_FILE_NAME}\``,
      `- Chunks: \`${RESOURCE_PACK_CHUNKS_DIR_NAME}/\``,
      `- Pages: \`${RESOURCE_PACK_PAGES_DIR_NAME}/\``,
    ].join('\n'),
    {
      file_kind: RESOURCE_PACK_FILE_KIND_RESOURCE_INDEX,
      resource_alias: metadata.resource_alias,
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
      ...(metadata.page_count !== undefined ? { page_count: metadata.page_count } : {}),
    },
  )
}
