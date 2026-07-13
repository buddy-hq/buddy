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
} from "./contracts"
import { extractResourcePack } from "./extractors"
import { assertResourceExtractionBudget, assertResourceSourceSize } from "./budgets"
import {
  createPendingResourcePackSnapshot,
  loadFreshResourcePackSnapshot,
  writeErroredResourcePackMetadata,
  writePreparingResourcePackMetadata,
  writeResourcePackFiles,
} from "./storage"

const inFlightBuilds = new Map<string, Promise<void>>()

type EnsureResourcePackOptions = {
  waitForCompletion?: boolean
}

export async function ensureResourcePackWithBuildInput(
  buildInput: ResourcePackBuildInput,
  options: EnsureResourcePackOptions = {},
): Promise<ResourcePackResolution> {
  const current = await loadFreshResourcePackSnapshot(buildInput)
  if (
    current &&
    current.status !== RESOURCE_PACK_STATUS_PREPARING &&
    current.status !== RESOURCE_PACK_STATUS_ERROR
  )
    return current

  const build = getOrStartBuild(buildInput)
  if (options.waitForCompletion) {
    await build
    const completedSnapshot = await loadFreshResourcePackSnapshot(buildInput)
    if (!completedSnapshot) {
      throw new Error(
        `Resource pack build completed without readable metadata: ${buildInput.packPaths.metadataPath}`,
      )
    }
    return completedSnapshot
  }

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
    assertResourceSourceSize(Number(input.sourceStat.size))
    const extraction = await extractResourcePack(input.sourcePath, input.classification)
    assertResourceExtractionBudget(extraction)
    const resourceAlias =
      input.resourceAlias ?? input.objectID ?? path.basename(input.sourceRelpath)
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
      coverImage: extraction.coverImage,
      title: extraction.title,
      author: extraction.author,
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
