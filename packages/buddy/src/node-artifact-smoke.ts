import { existsSync } from "node:fs"
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  RESOURCE_PACK_CHUNKS_DIR_NAME,
  RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
  RESOURCE_PACK_FULL_TEXT_FILE_NAME,
  RESOURCE_PACK_NON_CHAPTER_MAX_CHARS,
  RESOURCE_PACK_PAGES_DIR_NAME,
  RESOURCE_PACK_ROOT_DIR,
  RESOURCE_PACK_STATUS_READY,
  RESOURCE_PACK_TOC_FILE_NAME,
  classifyResourcePath,
  createResourcePackKey,
  ensureResourcePackWithBuildInput,
} from "./resource-packs"

const SMOKE_SOURCE_FILENAME = "resource-pack-smoke.md" as const
const SMOKE_RESOURCE_ALIAS = "artifact-resource-pack-smoke" as const
const SMOKE_TEXT_UNIT = "Buddy resource-pack artifact smoke verifies packaged chunking paths.\n\n"

export async function runNodeArtifactResourcePackSmoke(): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-resource-pack-smoke-"))

  try {
    const sourcePath = path.join(directory, SMOKE_SOURCE_FILENAME)
    await writeFile(sourcePath, buildSmokeMarkdown(), "utf8")
    const sourceStat = await stat(sourcePath)
    const sourceRelpath = path.basename(sourcePath)
    const key = createResourcePackKey(directory, sourcePath)
    const rootPath = path.join(directory, RESOURCE_PACK_ROOT_DIR, key)

    const result = await ensureResourcePackWithBuildInput(
      {
        directory,
        sourcePath,
        sourceRelpath,
        sourceStat,
        classification: classifyResourcePath(sourcePath, Number(sourceStat.size)),
        packPaths: {
          rootPath,
          metadataPath: path.join(rootPath, RESOURCE_PACK_ENTRYPOINT_FILE_NAME),
          entrypointPath: path.join(rootPath, RESOURCE_PACK_ENTRYPOINT_FILE_NAME),
          fullPath: path.join(rootPath, RESOURCE_PACK_FULL_TEXT_FILE_NAME),
          tocPath: path.join(rootPath, RESOURCE_PACK_TOC_FILE_NAME),
          chunksDirPath: path.join(rootPath, RESOURCE_PACK_CHUNKS_DIR_NAME),
          pagesDirPath: path.join(rootPath, RESOURCE_PACK_PAGES_DIR_NAME),
        },
        resourceAlias: SMOKE_RESOURCE_ALIAS,
      },
      { waitForCompletion: true },
    )

    if (result.status !== RESOURCE_PACK_STATUS_READY) {
      throw new Error(`Resource-pack smoke finished with status ${result.status}`)
    }
    if (!existsSync(result.entrypointPath)) {
      throw new Error(`Resource-pack smoke entrypoint missing: ${result.entrypointPath}`)
    }
    if (!existsSync(result.fullPath)) {
      throw new Error(`Resource-pack smoke full text missing: ${result.fullPath}`)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function buildSmokeMarkdown(): string {
  const targetLength = RESOURCE_PACK_NON_CHAPTER_MAX_CHARS + SMOKE_TEXT_UNIT.length
  const repetitions = Math.ceil(targetLength / SMOKE_TEXT_UNIT.length)
  return `# Artifact Resource Pack Smoke\n\n${SMOKE_TEXT_UNIT.repeat(repetitions)}`
}
