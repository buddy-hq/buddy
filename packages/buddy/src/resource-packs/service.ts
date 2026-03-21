import { promises as fs } from "node:fs"
import path from "node:path"
import { buildResourceChunkFiles } from "./chunking"
import {
  RESOURCE_PACK_SPLIT_REASON_FALLBACK_STRUCTURE,
  RESOURCE_PACK_UNIT_KIND_GENERIC,
  RESOURCE_PACK_STATUS_ERROR,
  RESOURCE_PACK_PREPARING_WARNING,
  RESOURCE_PACK_STATUS_PREPARING,
  RESOURCE_PACK_SYNC_BUDGET_MS,
  type ResourcePackBuildInput,
  type ResourcePackResolution,
  type ResourcePackService,
} from "./contracts"
import { classifyResourcePath } from "./classification"
import { extractResourcePack } from "./extractors"
import { createResourcePackPaths } from "./paths"
import {
  createPendingResourcePackSnapshot,
  loadFreshResourcePackSnapshot,
  writeErroredResourcePackMetadata,
  writePreparingResourcePackMetadata,
  writeResourcePackFiles,
} from "./storage"

const inFlightBuilds = new Map<string, Promise<void>>()

export class ResourcePackSourceNotFoundError extends Error {
  constructor(public readonly sourcePath: string) {
    super(`Resource source not found: ${sourcePath}`)
    this.name = "ResourcePackSourceNotFoundError"
  }
}

export const resourcePackService: ResourcePackService = {
  ensureResourcePack: async (input) => ensureResourcePack(input),
}

export async function ensureResourcePack(input: {
  directory: string
  sourcePath: string
}): Promise<ResourcePackResolution> {
  const sourceStat = await fs.stat(input.sourcePath).catch(() => undefined)
  if (!sourceStat?.isFile()) {
    throw new ResourcePackSourceNotFoundError(input.sourcePath)
  }

  const buildInput: ResourcePackBuildInput = {
    directory: input.directory,
    sourcePath: input.sourcePath,
    sourceRelpath:
      path.relative(input.directory, input.sourcePath) || path.basename(input.sourcePath),
    sourceStat,
    packPaths: createResourcePackPaths(input.directory, input.sourcePath),
    classification: classifyResourcePath(input.sourcePath, Number(sourceStat.size)),
  }

  const current = await loadFreshResourcePackSnapshot(buildInput)
  if (
    current &&
    current.status !== RESOURCE_PACK_STATUS_PREPARING &&
    current.status !== RESOURCE_PACK_STATUS_ERROR
  )
    return current

  const build = getOrStartBuild(buildInput)
  const readySnapshot = await Promise.race([
    build.then(async () => loadFreshResourcePackSnapshot(buildInput)),
    sleep(RESOURCE_PACK_SYNC_BUDGET_MS).then(() => undefined),
  ])

  if (readySnapshot) return readySnapshot
  if (current?.status === RESOURCE_PACK_STATUS_PREPARING) return current
  return createPendingResourcePackSnapshot(buildInput)
}

function getOrStartBuild(input: ResourcePackBuildInput): Promise<void> {
  const buildKey = input.packPaths.rootPath
  const existing = inFlightBuilds.get(buildKey)
  if (existing) return existing

  const build = buildResourcePack(input).finally(() => {
    inFlightBuilds.delete(buildKey)
  })
  inFlightBuilds.set(buildKey, build)
  return build
}

async function buildResourcePack(input: ResourcePackBuildInput): Promise<void> {
  await fs.mkdir(input.packPaths.rootPath, { recursive: true })
  await writePreparingResourcePackMetadata({
    build: input,
    warnings: [RESOURCE_PACK_PREPARING_WARNING],
  })

  try {
    const extraction = await extractResourcePack(input.sourcePath, input.classification)
    const resourceAlias = path.basename(path.dirname(input.packPaths.rootPath))
    const chunkUnits =
      extraction.chunkUnits ??
      extraction.chunkMarkdowns?.map((chunk, index) => ({
        unitKind: RESOURCE_PACK_UNIT_KIND_GENERIC,
        unitTitle: `Chunk ${index + 1}`,
        unitIndex: index + 1,
        text: chunk,
        splitReason: RESOURCE_PACK_SPLIT_REASON_FALLBACK_STRUCTURE,
      }))
    const chunkFiles = await buildResourceChunkFiles({
      resourceAlias,
      sourceRelpath: input.sourceRelpath,
      format: input.classification.format,
      fullText: extraction.fullText,
      chunkUnits,
    })

    await writeResourcePackFiles({
      build: input,
      status: extraction.status,
      warnings: extraction.warnings,
      extractor: extraction.extractor,
      fullText: extraction.fullText,
      tocMarkdown: extraction.tocMarkdown,
      pageMarkdowns: extraction.pageMarkdowns,
      chunkFiles,
    })
  } catch (error) {
    await writeErroredResourcePackMetadata({
      build: input,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}
