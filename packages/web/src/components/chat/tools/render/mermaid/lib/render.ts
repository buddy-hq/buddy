import { initializeMermaidRuntime, loadMermaidRuntime } from "./loader"
import {
  readMermaidThemeConfig,
  MERMAID_RENDER_CONFIG_VERSION,
  MERMAID_RENDERER_VERSION,
} from "./theme"
import {
  resolvePersistedMermaidRender,
  storePersistedMermaidRender,
  type MermaidStoredRenderRecord,
} from "./persisted-renders"
import { sanitizeMermaidSvg } from "./svg-sanitize"
import { normalizeMermaidSvgContrast, type MermaidContrastAdjustment } from "./svg-contrast"
import { scheduleMermaidRender } from "./scheduler"

type MermaidRenderResult = {
  svg: string
  sourceHash: string
  cacheKey: string
  renderKey?: string
  contrastAdjustments: MermaidContrastAdjustment[]
  bindFunctions?: (element: Element) => void
}

type MermaidRenderInput = {
  source: string
  artifactID?: string
  directory?: string
  priority?: number
}

class MermaidRenderFailureError extends Error {
  readonly persisted: boolean
  readonly renderKey?: string

  constructor(message: string, input?: { persisted?: boolean; renderKey?: string }) {
    super(message)
    this.name = "MermaidRenderFailureError"
    this.persisted = input?.persisted ?? false
    this.renderKey = input?.renderKey
  }
}

const MERMAID_CACHE_LIMIT = 400
const MERMAID_SCHEDULER_PRIORITY_DEFAULT = 0
const BYTE_ORDER_MARK = "\uFEFF"
const TAB_REPLACEMENT = "  "
const TRAILING_LINE_WHITESPACE_PATTERN = /[ \f\v]+$/gu
const mermaidSvgCache = new Map<string, MermaidRenderResult>()

let renderCounter = 0

function isBindFunctions(value: unknown): value is (element: Element) => void {
  return typeof value === "function"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function normalizeMermaidSource(source: string): string {
  const withoutBom = source.replaceAll(BYTE_ORDER_MARK, "")
  const normalizedNewlines = withoutBom.replace(/\r\n?/gu, "\n")
  const normalizedTabs = normalizedNewlines.replace(/\t/gu, TAB_REPLACEMENT)

  return normalizedTabs
    .split("\n")
    .map((line) => line.replace(TRAILING_LINE_WHITESPACE_PATTERN, ""))
    .join("\n")
    .trim()
}

function hashSource(source: string): string {
  let hash = 0xcbf29ce484222325n
  for (const character of source) {
    hash ^= BigInt(character.codePointAt(0) ?? 0)
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return hash.toString(16).padStart(16, "0")
}

function touchSvgCache(key: string, value: MermaidRenderResult): void {
  mermaidSvgCache.delete(key)
  mermaidSvgCache.set(key, value)

  if (mermaidSvgCache.size <= MERMAID_CACHE_LIMIT) {
    return
  }

  const oldest = mermaidSvgCache.keys().next().value
  if (typeof oldest === "string") {
    mermaidSvgCache.delete(oldest)
  }
}

function toCacheKey(input: {
  artifactID?: string
  sourceHash: string
  themeSignature: string
  rendererVersion: string
  renderConfigVersion: number
}): string {
  const base = input.artifactID ? `artifact:${input.artifactID}` : `source:${input.sourceHash}`
  return [
    base,
    `theme:${input.themeSignature}`,
    `renderer:${input.rendererVersion}`,
    `config:${input.renderConfigVersion}`,
  ].join("|")
}

function renderFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim()
  }
  return "Unable to render diagram."
}

function sourceUsesMermaidBindings(source: string): boolean {
  return /^\s*click\b/mu.test(source)
}

function readCachedSvg(input: {
  artifactID?: string
  source: string
}): MermaidRenderResult | undefined {
  const normalizedSource = normalizeMermaidSource(input.source)
  if (!normalizedSource) {
    return undefined
  }
  const theme = readMermaidThemeConfig()
  const cacheKey = toCacheKey({
    artifactID: input.artifactID,
    sourceHash: hashSource(normalizedSource),
    themeSignature: theme.themeSignature,
    rendererVersion: MERMAID_RENDERER_VERSION,
    renderConfigVersion: MERMAID_RENDER_CONFIG_VERSION,
  })
  const cached = mermaidSvgCache.get(cacheKey)
  if (!cached) {
    return undefined
  }
  touchSvgCache(cacheKey, cached)
  return cached
}

async function browserRenderMermaidSvg(input: { source: string; sourceHash: string }): Promise<{
  svg: string
  contrastAdjustments: MermaidContrastAdjustment[]
  bindFunctions?: (element: Element) => void
}> {
  const theme = readMermaidThemeConfig()
  const runtime = await loadMermaidRuntime()
  initializeMermaidRuntime(runtime, {
    themeVariables: theme.themeVariables,
  })

  const renderID = `buddy_mermaid_${input.sourceHash}_${renderCounter}`
  renderCounter += 1
  const rendered = await runtime.render(renderID, input.source)

  let rawSvg: string | undefined
  let bindFunctions: ((element: Element) => void) | undefined
  if (typeof rendered === "string") {
    rawSvg = rendered
  } else if (isRecord(rendered) && typeof rendered.svg === "string") {
    rawSvg = rendered.svg
    const maybeBind = rendered.bindFunctions
    if (isBindFunctions(maybeBind)) {
      bindFunctions = maybeBind
    }
  }

  if (!rawSvg) {
    throw new Error("Renderer did not return SVG output.")
  }

  const sanitizedSvg = sanitizeMermaidSvg(rawSvg)
  const normalized = normalizeMermaidSvgContrast({
    backgroundColor: theme.backgroundColor,
    candidateTextColors: theme.candidateTextColors,
    svg: sanitizedSvg,
    textFallbackColor: theme.tokens.textBase,
  })

  return {
    svg: normalized.svg,
    contrastAdjustments: normalized.contrastAdjustments,
    ...(bindFunctions ? { bindFunctions } : {}),
  }
}

function normalizePersistedRenderRecord(input: {
  artifactID?: string
  sourceHash: string
  cacheKey: string
  record: MermaidStoredRenderRecord | (MermaidStoredRenderRecord & { status: "rendered" })
  bindFunctions?: (element: Element) => void
}): MermaidRenderResult | never {
  if (input.record.status !== "rendered") {
    throw new MermaidRenderFailureError(input.record.errorMessage, {
      persisted: true,
      renderKey: input.record.renderKey,
    })
  }
  const result: MermaidRenderResult = {
    svg: input.record.svg,
    sourceHash: input.sourceHash,
    cacheKey: input.cacheKey,
    renderKey: input.record.renderKey,
    contrastAdjustments: input.record.contrastAdjustments,
    ...(input.bindFunctions ? { bindFunctions: input.bindFunctions } : {}),
  }
  touchSvgCache(input.cacheKey, result)
  return result
}

async function restorePersistedMermaidBindFunctions(input: {
  source: string
  sourceHash: string
}): Promise<((element: Element) => void) | undefined> {
  if (!sourceUsesMermaidBindings(input.source)) {
    return undefined
  }

  const theme = readMermaidThemeConfig()
  const runtime = await loadMermaidRuntime()
  initializeMermaidRuntime(runtime, {
    themeVariables: theme.themeVariables,
  })

  const renderID = `buddy_mermaid_bind_${input.sourceHash}_${renderCounter}`
  renderCounter += 1
  const rendered = await runtime.render(renderID, input.source)
  if (isRecord(rendered) && isBindFunctions(rendered.bindFunctions)) {
    return rendered.bindFunctions
  }
  return undefined
}

async function renderPersistedMermaidSvg(input: {
  artifactID: string
  directory: string
  source: string
  priority: number
}): Promise<MermaidRenderResult> {
  const normalizedSource = normalizeMermaidSource(input.source)
  if (!normalizedSource) {
    throw new Error("Diagram source is empty.")
  }
  const sourceHash = hashSource(normalizedSource)
  const theme = readMermaidThemeConfig()
  const cacheKey = toCacheKey({
    artifactID: input.artifactID,
    sourceHash,
    themeSignature: theme.themeSignature,
    rendererVersion: MERMAID_RENDERER_VERSION,
    renderConfigVersion: MERMAID_RENDER_CONFIG_VERSION,
  })
  const cached = mermaidSvgCache.get(cacheKey)
  if (cached) {
    touchSvgCache(cacheKey, cached)
    return cached
  }

  const resolved = await resolvePersistedMermaidRender({
    artifactID: input.artifactID,
    directory: input.directory,
    renderConfigVersion: MERMAID_RENDER_CONFIG_VERSION,
    rendererVersion: MERMAID_RENDERER_VERSION,
    themeSignature: theme.themeSignature,
  }).catch(() => undefined)

  if (resolved?.render) {
    const bindFunctions =
      resolved.render.status === "rendered"
        ? await restorePersistedMermaidBindFunctions({
            source: normalizedSource,
            sourceHash,
          }).catch(() => undefined)
        : undefined
    return normalizePersistedRenderRecord({
      artifactID: input.artifactID,
      sourceHash,
      cacheKey,
      record: resolved.render,
      ...(bindFunctions ? { bindFunctions } : {}),
    })
  }

  return scheduleMermaidRender({
    key: cacheKey,
    priority: input.priority,
    run: async () => {
      try {
        const browserRendered = await browserRenderMermaidSvg({
          source: normalizedSource,
          sourceHash,
        })
        const result: MermaidRenderResult = {
          svg: browserRendered.svg,
          sourceHash,
          cacheKey,
          contrastAdjustments: browserRendered.contrastAdjustments,
          ...(browserRendered.bindFunctions
            ? { bindFunctions: browserRendered.bindFunctions }
            : {}),
        }
        const stored = await storePersistedMermaidRender({
          artifactID: input.artifactID,
          contrastAdjustments: browserRendered.contrastAdjustments,
          directory: input.directory,
          renderConfigVersion: MERMAID_RENDER_CONFIG_VERSION,
          rendererVersion: MERMAID_RENDERER_VERSION,
          status: "rendered",
          svg: browserRendered.svg,
          themeSignature: theme.themeSignature,
        }).catch(() => undefined)
        if (stored) {
          result.renderKey = stored.renderKey
        }
        touchSvgCache(cacheKey, result)
        return result
      } catch (error) {
        const errorMessage = renderFailureMessage(error)
        const stored = await storePersistedMermaidRender({
          artifactID: input.artifactID,
          directory: input.directory,
          errorMessage,
          renderConfigVersion: MERMAID_RENDER_CONFIG_VERSION,
          rendererVersion: MERMAID_RENDERER_VERSION,
          status: "failed",
          themeSignature: theme.themeSignature,
        }).catch(() => undefined)
        throw new MermaidRenderFailureError(errorMessage, {
          persisted: false,
          ...(stored ? { renderKey: stored.renderKey } : {}),
        })
      }
    },
  })
}

async function renderEphemeralMermaidSvg(input: {
  artifactID?: string
  source: string
  priority: number
}): Promise<MermaidRenderResult> {
  const normalizedSource = normalizeMermaidSource(input.source)
  if (!normalizedSource) {
    throw new Error("Diagram source is empty.")
  }
  const theme = readMermaidThemeConfig()
  const sourceHash = hashSource(normalizedSource)
  const cacheKey = toCacheKey({
    artifactID: input.artifactID,
    sourceHash,
    themeSignature: theme.themeSignature,
    rendererVersion: MERMAID_RENDERER_VERSION,
    renderConfigVersion: MERMAID_RENDER_CONFIG_VERSION,
  })
  const cached = mermaidSvgCache.get(cacheKey)
  if (cached) {
    touchSvgCache(cacheKey, cached)
    return cached
  }

  return scheduleMermaidRender({
    key: cacheKey,
    priority: input.priority,
    run: async () => {
      const browserRendered = await browserRenderMermaidSvg({
        source: normalizedSource,
        sourceHash,
      })
      const result: MermaidRenderResult = {
        svg: browserRendered.svg,
        sourceHash,
        cacheKey,
        contrastAdjustments: browserRendered.contrastAdjustments,
        ...(browserRendered.bindFunctions ? { bindFunctions: browserRendered.bindFunctions } : {}),
      }
      touchSvgCache(cacheKey, result)
      return result
    },
  })
}

async function renderMermaidSvg(input: MermaidRenderInput): Promise<MermaidRenderResult> {
  const priority = input.priority ?? MERMAID_SCHEDULER_PRIORITY_DEFAULT
  if (input.artifactID && input.directory) {
    return renderPersistedMermaidSvg({
      artifactID: input.artifactID,
      directory: input.directory,
      source: input.source,
      priority,
    })
  }
  return renderEphemeralMermaidSvg({
    artifactID: input.artifactID,
    source: input.source,
    priority,
  })
}

export {
  MermaidRenderFailureError,
  MERMAID_RENDER_CONFIG_VERSION,
  MERMAID_RENDERER_VERSION,
  hashSource as hashMermaidSource,
  readCachedSvg as readCachedMermaidSvg,
  renderMermaidSvg,
}

export type { MermaidContrastAdjustment, MermaidRenderInput, MermaidRenderResult }
