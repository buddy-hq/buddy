import path from "node:path"
import {
  RESOURCE_PACK_CHUNKS_DIR_NAME,
  RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
  RESOURCE_PACK_FULL_TEXT_FILE_NAME,
  RESOURCE_PACK_PAGES_DIR_NAME,
  RESOURCE_PACK_PROCESSED_DIR_NAME,
  RESOURCE_PACK_ROOT_DIR,
  RESOURCE_PACK_TOC_FILE_NAME,
  type PackPaths,
} from "./contracts"
import { createResourcePackKey } from "./classification"

export function createResourcePackPaths(directory: string, sourcePath: string): PackPaths {
  const rootPath = path.join(
    directory,
    RESOURCE_PACK_ROOT_DIR,
    createResourcePackKey(directory, sourcePath),
    RESOURCE_PACK_PROCESSED_DIR_NAME,
  )
  return {
    rootPath,
    metadataPath: path.join(rootPath, RESOURCE_PACK_ENTRYPOINT_FILE_NAME),
    entrypointPath: path.join(rootPath, RESOURCE_PACK_ENTRYPOINT_FILE_NAME),
    fullPath: path.join(rootPath, RESOURCE_PACK_FULL_TEXT_FILE_NAME),
    tocPath: path.join(rootPath, RESOURCE_PACK_TOC_FILE_NAME),
    chunksDirPath: path.join(rootPath, RESOURCE_PACK_CHUNKS_DIR_NAME),
    pagesDirPath: path.join(rootPath, RESOURCE_PACK_PAGES_DIR_NAME),
  }
}
