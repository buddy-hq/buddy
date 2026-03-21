export const RESOURCE_PACK_ROOT_DIR = "resources" as const
export const RESOURCE_PACK_PROCESSED_DIR_NAME = "processed" as const
export const RESOURCE_PACK_CHUNKS_DIR_NAME = "chunks" as const
export const RESOURCE_PACK_PAGES_DIR_NAME = "pages" as const

export const RESOURCE_PACK_ENTRYPOINT_FILE_NAME = "00-resource.md" as const
export const RESOURCE_PACK_TOC_FILE_NAME = "10-toc.md" as const
export const RESOURCE_PACK_FULL_TEXT_FILE_NAME = "20-full-text.md" as const
export const RESOURCE_PACK_FULL_TEXT_FILE_PREFIX = "20-full-text" as const

export const RESOURCE_PACK_UNIT_FILE_PREFIX = "30-unit" as const
export const RESOURCE_PACK_PAGE_WINDOW_FILE_PREFIX = "40-pages" as const
export const RESOURCE_PACK_GENERIC_FILE_PREFIX = "50-chunk" as const
export const RESOURCE_PACK_PAGE_FILE_PREFIX = "page" as const

export const RESOURCE_PACK_TOKEN_ESTIMATE_CHARS_PER_TOKEN = 4
export const RESOURCE_PACK_CHAPTER_MAX_TOKENS = 20_000
export const RESOURCE_PACK_NON_CHAPTER_MAX_TOKENS = 10_000

export const RESOURCE_PACK_CHAPTER_MAX_CHARS =
  RESOURCE_PACK_CHAPTER_MAX_TOKENS * RESOURCE_PACK_TOKEN_ESTIMATE_CHARS_PER_TOKEN
export const RESOURCE_PACK_NON_CHAPTER_MAX_CHARS =
  RESOURCE_PACK_NON_CHAPTER_MAX_TOKENS * RESOURCE_PACK_TOKEN_ESTIMATE_CHARS_PER_TOKEN

export const RESOURCE_PACK_LARGE_TEXT_THRESHOLD_BYTES = 128 * 1024

export const RESOURCE_PACK_FILENAME_INDEX_PAD = 3
export const RESOURCE_PACK_FILENAME_PAGE_PAD = 4
export const RESOURCE_PACK_FILENAME_TOKEN_PAD = 5
export const RESOURCE_PACK_FILENAME_CHAR_PAD = 6
export const RESOURCE_PACK_TITLE_SLUG_MAX_CHARS = 48
export const RESOURCE_PACK_FILENAME_TOKEN_LABEL = "est-tokens" as const
export const RESOURCE_PACK_FILENAME_CHAR_LABEL = "chars" as const
export const RESOURCE_PACK_FILENAME_PART_LABEL = "part" as const
export const RESOURCE_PACK_FILENAME_OF_LABEL = "of" as const

export const RESOURCE_PACK_FILE_KIND_RESOURCE_INDEX = "resource_index" as const
export const RESOURCE_PACK_FILE_KIND_TOC = "toc" as const
export const RESOURCE_PACK_FILE_KIND_FULL_TEXT = "full_text" as const
export const RESOURCE_PACK_FILE_KIND_UNIT = "unit" as const
export const RESOURCE_PACK_FILE_KIND_PAGE_WINDOW = "page_window" as const
export const RESOURCE_PACK_FILE_KIND_GENERIC_CHUNK = "generic_chunk" as const
export const RESOURCE_PACK_FILE_KIND_PAGE = "page" as const

export const RESOURCE_PACK_UNIT_KIND_CHAPTER = "chapter" as const
export const RESOURCE_PACK_UNIT_KIND_SECTION = "section" as const
export const RESOURCE_PACK_UNIT_KIND_PAGE_WINDOW = "page_window" as const
export const RESOURCE_PACK_UNIT_KIND_GENERIC = "generic" as const

export const RESOURCE_PACK_SPLIT_REASON_INTACT = "intact" as const
export const RESOURCE_PACK_SPLIT_REASON_OVER_THRESHOLD = "over_threshold" as const
export const RESOURCE_PACK_SPLIT_REASON_FALLBACK_STRUCTURE = "fallback_structure" as const

export const RESOURCE_PACK_RECURSIVE_MIN_CHARS_PER_CHUNK = 24
export const RESOURCE_PACK_FALLBACK_MIN_BOUNDARY_RATIO = 0.55

export function estimateTokenCountFromChars(charCount: number) {
  if (charCount <= 0) return 0
  return Math.ceil(charCount / RESOURCE_PACK_TOKEN_ESTIMATE_CHARS_PER_TOKEN)
}

export function estimateTokenCountFromText(text: string) {
  return estimateTokenCountFromChars(text.length)
}
