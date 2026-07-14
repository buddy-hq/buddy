import { renderChemfigWithBuddy } from "./chemfig-adapter"
import { isBackendChemistryFormat, type ChemistryFormat } from "./formats"
import { IndigoWorkerClient } from "./indigo-worker-client"
import { prepareChemistrySvg } from "./svg"
import { indigoFormatForChemistry, validateChemistrySource } from "./validation"

const CHEMISTRY_RENDER_CONFIG_VERSION = 1
const CHEMISTRY_RENDER_CACHE_LIMIT = 256
const CHEMISTRY_RENDER_CACHE_MAX_BYTES = 32 * 1024 * 1024
const INDIGO_RENDERER_NAME = "indigo-ketcher"
const INDIGO_RENDERER_VERSION = "1.43.0"
const TEST_RENDERER_NAME = "test-renderer"
const TEST_RENDERER_VERSION = "test"
const TEST_RENDER_CONFIG_VERSION = 0
const TEST_BACKEND_CACHE_PREFIX = "test-backend"

export type ChemistryRenderResult = {
  svg: string
  cacheKey: string
  sourceHash: string
  rendererName: string
  rendererVersion: string
  renderConfigVersion: number
  warnings: string[]
}

type ChemistryTestRendererResult = {
  svg: string
  rendererName?: string
  rendererVersion?: string
  renderConfigVersion?: number
  warnings?: string[]
}

type ChemistryTestRenderer = (input: {
  source: string
  format: ChemistryFormat
  directory?: string
}) => Promise<ChemistryTestRendererResult>

declare global {
  var __BUDDY_TEST_CHEMISTRY_RENDERER__: ChemistryTestRenderer | undefined
}

type ChemistryCacheEntry = {
  format: ChemistryFormat
  source: string
  result: ChemistryRenderResult
  weightBytes: number
}

type ChemistryInFlightEntry = {
  format: ChemistryFormat
  source: string
  promise: Promise<ChemistryRenderResult>
  abortController: AbortController
  subscriberCount: number
}

const svgCache = new Map<string, ChemistryCacheEntry[]>()
const inFlightRenders = new Map<string, ChemistryInFlightEntry[]>()
const indigoWorkerClient = new IndigoWorkerClient()
let svgCacheBytes = 0

function hashSource(source: string): string {
  let hash = 0xcbf29ce484222325n
  for (const character of source) {
    hash ^= BigInt(character.codePointAt(0) ?? 0)
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return hash.toString(16).padStart(16, "0")
}

function chemistryCacheKey(input: {
  format: Exclude<ChemistryFormat, "chemfig">
  sourceHash: string
}): string {
  return [
    `format:${input.format}`,
    `source:${input.sourceHash}`,
    `renderer:${INDIGO_RENDERER_NAME}@${INDIGO_RENDERER_VERSION}`,
    `config:${CHEMISTRY_RENDER_CONFIG_VERSION}`,
  ].join("|")
}

function isExactSourceEntry(
  entry: Pick<ChemistryCacheEntry | ChemistryInFlightEntry, "format" | "source">,
  input: { format: ChemistryFormat; source: string },
): boolean {
  return entry.format === input.format && entry.source === input.source
}

function touchCache(key: string, entry: ChemistryCacheEntry): void {
  const currentBucket = svgCache.get(key) ?? []
  const retainedEntries = currentBucket.filter((candidate) => !isExactSourceEntry(candidate, entry))
  for (const replaced of currentBucket) {
    if (!retainedEntries.includes(replaced)) {
      svgCacheBytes -= replaced.weightBytes
    }
  }
  svgCache.delete(key)
  svgCache.set(key, [...retainedEntries, entry])
  svgCacheBytes += entry.weightBytes

  while (
    svgCache.size > CHEMISTRY_RENDER_CACHE_LIMIT ||
    svgCacheBytes > CHEMISTRY_RENDER_CACHE_MAX_BYTES
  ) {
    const oldestKey = svgCache.keys().next().value
    if (typeof oldestKey !== "string") return
    const evicted = svgCache.get(oldestKey) ?? []
    svgCache.delete(oldestKey)
    for (const candidate of evicted) {
      svgCacheBytes -= candidate.weightBytes
    }
  }
}

function getCachedResult(input: {
  key: string
  format: ChemistryFormat
  source: string
}): ChemistryRenderResult | undefined {
  const cached = svgCache.get(input.key)?.find((candidate) => isExactSourceEntry(candidate, input))
  if (cached) {
    touchCache(input.key, cached)
    return cached.result
  }
  return undefined
}

function removeInFlightEntry(key: string, entry: ChemistryInFlightEntry): void {
  const retained = (inFlightRenders.get(key) ?? []).filter((candidate) => candidate !== entry)
  if (retained.length === 0) {
    inFlightRenders.delete(key)
    return
  }
  inFlightRenders.set(key, retained)
}

function subscribeToInFlightRender(
  entry: ChemistryInFlightEntry,
  signal?: AbortSignal,
): Promise<ChemistryRenderResult> {
  entry.subscriberCount += 1
  return new Promise((resolve, reject) => {
    let subscriptionSettled = false
    const release = (abortIfUnused: boolean): boolean => {
      if (subscriptionSettled) return false
      subscriptionSettled = true
      if (signal) {
        signal.removeEventListener("abort", handleAbort)
      }
      entry.subscriberCount -= 1
      if (abortIfUnused && entry.subscriberCount === 0) {
        entry.abortController.abort()
      }
      return true
    }
    const handleAbort = (): void => {
      if (release(true)) {
        reject(new Error("Chemistry rendering was cancelled."))
      }
    }

    if (signal?.aborted) {
      handleAbort()
      return
    }
    signal?.addEventListener("abort", handleAbort, { once: true })
    void entry.promise.then(
      (value) => {
        if (release(false)) resolve(value)
      },
      (error: unknown) => {
        if (release(false)) reject(error)
      },
    )
  })
}

async function renderBrowserChemistryUncached(input: {
  source: string
  format: Exclude<ChemistryFormat, "chemfig">
  directory?: string
  sourceHash: string
  cacheKey: string
  signal: AbortSignal
}): Promise<ChemistryRenderResult> {
  const testRenderer = globalThis.__BUDDY_TEST_CHEMISTRY_RENDERER__
  if (testRenderer) {
    const rendered = await testRenderer({
      source: input.source,
      format: input.format,
      directory: input.directory,
    })
    return {
      svg: prepareChemistrySvg(rendered.svg),
      cacheKey: input.cacheKey,
      sourceHash: input.sourceHash,
      rendererName: rendered.rendererName ?? INDIGO_RENDERER_NAME,
      rendererVersion: rendered.rendererVersion ?? INDIGO_RENDERER_VERSION,
      renderConfigVersion: rendered.renderConfigVersion ?? CHEMISTRY_RENDER_CONFIG_VERSION,
      warnings: rendered.warnings ?? [],
    }
  }

  const rendered = await indigoWorkerClient.render({
    source: input.source,
    format: indigoFormatForChemistry(input.format),
    signal: input.signal,
  })
  return {
    svg: prepareChemistrySvg(rendered.svg),
    cacheKey: input.cacheKey,
    sourceHash: input.sourceHash,
    rendererName: INDIGO_RENDERER_NAME,
    rendererVersion: rendered.rendererVersion,
    renderConfigVersion: CHEMISTRY_RENDER_CONFIG_VERSION,
    warnings: rendered.warnings,
  }
}

async function renderBackendChemistry(input: {
  source: string
  format: Extract<ChemistryFormat, "chemfig">
  directory?: string
  signal?: AbortSignal
}): Promise<ChemistryRenderResult> {
  const testRenderer = globalThis.__BUDDY_TEST_CHEMISTRY_RENDERER__
  if (testRenderer) {
    const rendered = await testRenderer(input)
    const sourceHash = hashSource(input.source)
    return {
      svg: prepareChemistrySvg(rendered.svg),
      cacheKey: `${TEST_BACKEND_CACHE_PREFIX}:${input.format}:${sourceHash}`,
      sourceHash,
      rendererName: rendered.rendererName ?? TEST_RENDERER_NAME,
      rendererVersion: rendered.rendererVersion ?? TEST_RENDERER_VERSION,
      renderConfigVersion: rendered.renderConfigVersion ?? TEST_RENDER_CONFIG_VERSION,
      warnings: rendered.warnings ?? [],
    }
  }

  const rendered = await renderChemfigWithBuddy(input)
  return {
    svg: prepareChemistrySvg(rendered.svg),
    cacheKey: rendered.renderKey,
    sourceHash: rendered.sourceHash,
    rendererName: rendered.rendererName,
    rendererVersion: rendered.rendererVersion,
    renderConfigVersion: rendered.renderConfigVersion,
    warnings: [],
  }
}

export function readCachedChemistrySvg(input: {
  source: string
  format: ChemistryFormat
}): ChemistryRenderResult | undefined {
  const format = input.format
  if (isBackendChemistryFormat(format)) return undefined
  try {
    const validated = validateChemistrySource({ format, source: input.source })
    const sourceHash = hashSource(validated.source)
    const key = chemistryCacheKey({ format, sourceHash })
    return getCachedResult({
      key,
      format,
      source: validated.source,
    })
  } catch {
    return undefined
  }
}

export async function renderChemistrySvg(input: {
  source: string
  format: ChemistryFormat
  directory?: string
  signal?: AbortSignal
}): Promise<ChemistryRenderResult> {
  const format = input.format
  if (isBackendChemistryFormat(format)) {
    return renderBackendChemistry({
      source: input.source,
      format,
      directory: input.directory,
      signal: input.signal,
    })
  }
  const validated = validateChemistrySource({ format, source: input.source })
  const sourceHash = hashSource(validated.source)
  const cacheKey = chemistryCacheKey({ format, sourceHash })
  const cached = getCachedResult({
    key: cacheKey,
    format,
    source: validated.source,
  })
  if (cached) {
    return cached
  }
  const inFlight = inFlightRenders
    .get(cacheKey)
    ?.find(
      (candidate) =>
        !candidate.abortController.signal.aborted && isExactSourceEntry(candidate, validated),
    )
  if (inFlight) {
    return subscribeToInFlightRender(inFlight, input.signal)
  }

  const abortController = new AbortController()
  const renderPromise = renderBrowserChemistryUncached({
    source: validated.source,
    format,
    directory: input.directory,
    sourceHash,
    cacheKey,
    signal: abortController.signal,
  }).then((result) => {
    const weightBytes = validated.sourceBytes + result.svg.length * 2
    touchCache(cacheKey, {
      format,
      source: validated.source,
      result,
      weightBytes,
    })
    return result
  })
  const inFlightEntry: ChemistryInFlightEntry = {
    format,
    source: validated.source,
    promise: renderPromise,
    abortController,
    subscriberCount: 0,
  }
  inFlightRenders.set(cacheKey, [...(inFlightRenders.get(cacheKey) ?? []), inFlightEntry])
  void renderPromise.then(
    () => removeInFlightEntry(cacheKey, inFlightEntry),
    () => removeInFlightEntry(cacheKey, inFlightEntry),
  )
  return subscribeToInFlightRender(inFlightEntry, input.signal)
}

export function clearChemistryRenderCacheForTests(): void {
  indigoWorkerClient.destroy()
  svgCache.clear()
  inFlightRenders.clear()
  svgCacheBytes = 0
}
