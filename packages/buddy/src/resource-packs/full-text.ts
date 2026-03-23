import { promises as fs } from "node:fs"
import path from "node:path"
import {
  RESOURCE_PACK_FULL_TEXT_FILE_PREFIX,
  RESOURCE_PACK_PROCESSED_DIR_NAME,
  RESOURCE_PACK_ROOT_DIR,
} from "./contracts"

const RESOURCE_FULL_TEXT_FILENAME_REGEX = /^20-full-text-est-tokens-(\d+)-chars-(\d+)\.md$/i

export type ResourcePackFullTextMetadata = {
  fullTextPath: string
  fullTextAbsolutePath: string
  fullTextEstTokens?: number
  fullTextChars?: number
}

export async function resolveResourcePackFullTextMetadata(input: {
  directory: string
  packKey?: string
}): Promise<ResourcePackFullTextMetadata | undefined> {
  if (!input.packKey) {
    return undefined
  }

  const processedPath = path.join(
    input.directory,
    RESOURCE_PACK_ROOT_DIR,
    input.packKey,
    RESOURCE_PACK_PROCESSED_DIR_NAME,
  )
  const entries = await fs.readdir(processedPath, { withFileTypes: true }).catch(() => [])
  const fullTextFile = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .find(
      (name) => name.startsWith(`${RESOURCE_PACK_FULL_TEXT_FILE_PREFIX}-`) && name.endsWith(".md"),
    )

  if (!fullTextFile) {
    return undefined
  }

  const match = RESOURCE_FULL_TEXT_FILENAME_REGEX.exec(fullTextFile)
  const fullTextPath = path.join(
    RESOURCE_PACK_ROOT_DIR,
    input.packKey,
    RESOURCE_PACK_PROCESSED_DIR_NAME,
    fullTextFile,
  )

  return {
    fullTextPath,
    fullTextAbsolutePath: path.join(input.directory, fullTextPath),
    ...(match?.[1] ? { fullTextEstTokens: Number(match[1]) } : {}),
    ...(match?.[2] ? { fullTextChars: Number(match[2]) } : {}),
  }
}
