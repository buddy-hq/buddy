import { RESOURCE_PACK_CHUNK_TARGET_BYTES } from "./contracts"

export function buildChunkMarkdowns(fullText: string): string[] {
  const blocks = splitMarkdownIntoBlocks(fullText)
  const chunks: string[] = []
  let currentBlocks: string[] = []
  let currentBytes = 0

  const flushCurrent = () => {
    if (currentBlocks.length === 0) return
    const chunk = currentBlocks.join("\n\n").trim()
    if (chunk) chunks.push(chunk)
    currentBlocks = []
    currentBytes = 0
  }

  for (const block of blocks) {
    const blockBytes = Buffer.byteLength(block, "utf8")
    if (blockBytes > RESOURCE_PACK_CHUNK_TARGET_BYTES) {
      flushCurrent()
      chunks.push(...splitLargeBlock(block))
      continue
    }

    if (currentBytes > 0 && currentBytes + blockBytes > RESOURCE_PACK_CHUNK_TARGET_BYTES) {
      flushCurrent()
    }

    currentBlocks.push(block)
    currentBytes += blockBytes
  }

  flushCurrent()
  return chunks
}

function splitMarkdownIntoBlocks(markdown: string): string[] {
  const normalized = markdown.replace(/\r\n/g, "\n").trim()
  if (!normalized) return []

  const lines = normalized.split("\n")
  const blocks: string[] = []
  let current: string[] = []

  const flush = () => {
    const block = current.join("\n").trim()
    if (block) blocks.push(block)
    current = []
  }

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line) && current.length > 0) {
      flush()
    }
    if (line.trim().length === 0 && current.length > 0 && current[current.length - 1]?.trim().length === 0) {
      continue
    }
    current.push(line)
  }

  flush()
  return blocks
}

function splitLargeBlock(block: string): string[] {
  const paragraphs = block.split(/\n{2,}/)
  if (paragraphs.length === 1) {
    return splitByByteSize(block, RESOURCE_PACK_CHUNK_TARGET_BYTES)
  }

  const chunks: string[] = []
  let current: string[] = []
  let currentBytes = 0

  const flushCurrent = () => {
    if (current.length === 0) return
    const chunk = current.join("\n\n").trim()
    if (chunk) chunks.push(chunk)
    current = []
    currentBytes = 0
  }

  for (const paragraph of paragraphs) {
    const paragraphBytes = Buffer.byteLength(paragraph, "utf8")
    if (currentBytes > 0 && currentBytes + paragraphBytes > RESOURCE_PACK_CHUNK_TARGET_BYTES) {
      flushCurrent()
    }

    if (paragraphBytes > RESOURCE_PACK_CHUNK_TARGET_BYTES) {
      flushCurrent()
      chunks.push(...splitByByteSize(paragraph, RESOURCE_PACK_CHUNK_TARGET_BYTES))
      continue
    }

    current.push(paragraph)
    currentBytes += paragraphBytes
  }

  flushCurrent()
  return chunks
}

function splitByByteSize(text: string, maxBytes: number): string[] {
  const lines = text.split("\n")
  const chunks: string[] = []
  let current: string[] = []
  let currentBytes = 0

  const flush = () => {
    const chunk = current.join("\n").trim()
    if (chunk) chunks.push(chunk)
    current = []
    currentBytes = 0
  }

  for (const line of lines) {
    const lineBytes = Buffer.byteLength(line, "utf8")
    if (currentBytes > 0 && currentBytes + lineBytes > maxBytes) {
      flush()
    }
    current.push(line)
    currentBytes += lineBytes
  }

  flush()
  return chunks
}
