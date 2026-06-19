import { promises as fs } from "node:fs"
import path from "node:path"
import { RESOURCE_PACK_FULL_TEXT_FILE_PREFIX } from "./contracts"

const RESOURCE_FULL_TEXT_FILENAME_REGEX = /^20-full-text-est-tokens-(\d+)-chars-(\d+)\.md$/i

export type ResourcePackFullTextMetadata = {
  fullTextPath: string
  fullTextAbsolutePath: string
  fullTextEstimatedTokens?: number
  fullTextChars?: number
}

export async function resolveResourcePackFullTextMetadataFromRoot(input: {
  directory: string
  packRootPath: string
  displayRootPath: string
}): Promise<ResourcePackFullTextMetadata | undefined> {
  const entries = await fs.readdir(input.packRootPath, { withFileTypes: true }).catch(() => [])
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
  const fullTextPath = path.join(input.displayRootPath, fullTextFile)

  return {
    fullTextPath,
    fullTextAbsolutePath: path.join(input.directory, fullTextPath),
    ...(match?.[1] ? { fullTextEstimatedTokens: Number(match[1]) } : {}),
    ...(match?.[2] ? { fullTextChars: Number(match[2]) } : {}),
  }
}
