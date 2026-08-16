import { initializeMermaidRuntime, loadMermaidRuntime, type TMermaidRenderOutput } from "./loader"
import {
  readMermaidThemeConfig,
  MERMAID_RENDER_CONFIG_VERSION,
  MERMAID_RENDERER_VERSION,
  type MermaidThemeConfig,
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
  directory?: string
  objectID?: string
  priority?: number
  revisionID?: string | null
  themeConfig?: MermaidThemeConfig
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

function parseMermaidRenderOutput(rendered: string | TMermaidRenderOutput): TMermaidRenderOutput {
  if (rendered instanceof Object) {
    return rendered
  }
  return { svg: rendered }
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
  if (oldest !== undefined) {
    mermaidSvgCache.delete(oldest)
  }
}

function toCacheKey(input: {
  objectID?: string
  revisionID?: string | null
  sourceHash: string
  themeSignature: string
  rendererVersion: string
  renderConfigVersion: number
}): string {
  const base = input.objectID
    ? `object:${input.objectID}:${input.revisionID ?? "current"}`
    : `source:${input.sourceHash}`
  return [
    base,
    `theme:${input.themeSignature}`,
    `renderer:${input.rendererVersion}`,
    `config:${input.renderConfigVersion}`,
  ].join("|")
}

function renderFailureMessage(error: Error): string {
  return error.message.trim() || "Unable to render diagram."
}

function sourceUsesMermaidBindings(source: string): boolean {
  return /^\s*click\b/mu.test(source)
}

function readCachedSvg(input: {
  objectID?: string
  revisionID?: string | null
  source: string
  themeConfig?: MermaidThemeConfig
}): MermaidRenderResult | undefined {
  const normalizedSource = normalizeMermaidSource(input.source)
  if (!normalizedSource) {
    return undefined
  }
  const theme = input.themeConfig ?? readMermaidThemeConfig()
  const cacheKey = toCacheKey({
    objectID: input.objectID,
    revisionID: input.revisionID,
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

async function browserRenderMermaidSvg(input: {
  source: string
  sourceHash: string
  themeConfig: MermaidThemeConfig
}): Promise<{
  svg: string
  contrastAdjustments: MermaidContrastAdjustment[]
  bindFunctions?: (element: Element) => void
}> {
  const theme = input.themeConfig
  const runtime = await loadMermaidRuntime()
  initializeMermaidRuntime(runtime, {
    themeVariables: theme.themeVariables,
  })

  const renderID = `buddy_mermaid_${input.sourceHash}_${renderCounter}`
  renderCounter += 1
  const rendered = parseMermaidRenderOutput(await runtime.render(renderID, input.source))
  const rawSvg = rendered.svg
  const bindFunctions = rendered.bindFunctions

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

  return Object.assign(
    {
      svg: normalized.svg,
      contrastAdjustments: normalized.contrastAdjustments,
    },
    bindFunctions ? { bindFunctions } : undefined,
  )
}

function normalizePersistedRenderRecord(input: {
  objectID?: string
  revisionID?: string | null
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
  const result: MermaidRenderResult = Object.assign(
    {
      svg: input.record.svg,
      sourceHash: input.sourceHash,
      cacheKey: input.cacheKey,
      renderKey: input.record.renderKey,
      contrastAdjustments: input.record.contrastAdjustments,
    },
    input.bindFunctions ? { bindFunctions: input.bindFunctions } : undefined,
  )
  touchSvgCache(input.cacheKey, result)
  return result
}

async function restorePersistedMermaidBindFunctions(input: {
  source: string
  sourceHash: string
  themeConfig: MermaidThemeConfig
}): Promise<((element: Element) => void) | undefined> {
  if (!sourceUsesMermaidBindings(input.source)) {
    return undefined
  }

  const theme = input.themeConfig
  const runtime = await loadMermaidRuntime()
  initializeMermaidRuntime(runtime, {
    themeVariables: theme.themeVariables,
  })

  const renderID = `buddy_mermaid_bind_${input.sourceHash}_${renderCounter}`
  renderCounter += 1
  const rendered = parseMermaidRenderOutput(await runtime.render(renderID, input.source))
  return rendered.bindFunctions
}

async function renderPersistedMermaidSvg(input: {
  directory: string
  objectID: string
  source: string
  priority: number
  revisionID?: string | null
  themeConfig?: MermaidThemeConfig
}): Promise<MermaidRenderResult> {
  const normalizedSource = normalizeMermaidSource(input.source)
  if (!normalizedSource) {
    throw new Error("Diagram source is empty.")
  }
  const sourceHash = hashSource(normalizedSource)
  const theme = input.themeConfig ?? readMermaidThemeConfig()
  const cacheKey = toCacheKey({
    objectID: input.objectID,
    revisionID: input.revisionID,
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
    directory: input.directory,
    objectID: input.objectID,
    renderConfigVersion: MERMAID_RENDER_CONFIG_VERSION,
    rendererVersion: MERMAID_RENDERER_VERSION,
    revisionID: input.revisionID,
    themeSignature: theme.themeSignature,
  }).catch(() => undefined)

  if (resolved?.render) {
    const bindFunctions =
      resolved.render.status === "rendered"
        ? await restorePersistedMermaidBindFunctions({
            source: normalizedSource,
            sourceHash,
            themeConfig: theme,
          }).catch(() => undefined)
        : undefined
    return normalizePersistedRenderRecord(
      Object.assign(
        {
          objectID: input.objectID,
          revisionID: input.revisionID,
          sourceHash,
          cacheKey,
          record: resolved.render,
        },
        bindFunctions ? { bindFunctions } : undefined,
      ),
    )
  }

  return scheduleMermaidRender({
    key: cacheKey,
    priority: input.priority,
    run: async () => {
      try {
        const browserRendered = await browserRenderMermaidSvg({
          source: normalizedSource,
          sourceHash,
          themeConfig: theme,
        })
        const result: MermaidRenderResult = Object.assign(
          {
            svg: browserRendered.svg,
            sourceHash,
            cacheKey,
            contrastAdjustments: browserRendered.contrastAdjustments,
          },
          browserRendered.bindFunctions
            ? { bindFunctions: browserRendered.bindFunctions }
            : undefined,
        )
        const stored = await storePersistedMermaidRender({
          contrastAdjustments: browserRendered.contrastAdjustments,
          directory: input.directory,
          objectID: input.objectID,
          renderConfigVersion: MERMAID_RENDER_CONFIG_VERSION,
          rendererVersion: MERMAID_RENDERER_VERSION,
          revisionID: input.revisionID,
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
        const errorMessage = renderFailureMessage(
          error instanceof Error ? error : new Error("Unable to render diagram."),
        )
        const stored = await storePersistedMermaidRender({
          directory: input.directory,
          errorMessage,
          objectID: input.objectID,
          renderConfigVersion: MERMAID_RENDER_CONFIG_VERSION,
          rendererVersion: MERMAID_RENDERER_VERSION,
          revisionID: input.revisionID,
          status: "failed",
          themeSignature: theme.themeSignature,
        }).catch(() => undefined)
        throw new MermaidRenderFailureError(
          errorMessage,
          Object.assign(
            { persisted: false },
            stored ? { renderKey: stored.renderKey } : undefined,
          ),
        )
      }
    },
  })
}

async function renderEphemeralMermaidSvg(input: {
  objectID?: string
  revisionID?: string | null
  source: string
  priority: number
  themeConfig?: MermaidThemeConfig
}): Promise<MermaidRenderResult> {
  const normalizedSource = normalizeMermaidSource(input.source)
  if (!normalizedSource) {
    throw new Error("Diagram source is empty.")
  }
  const theme = input.themeConfig ?? readMermaidThemeConfig()
  const sourceHash = hashSource(normalizedSource)
  const cacheKey = toCacheKey({
    objectID: input.objectID,
    revisionID: input.revisionID,
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
        themeConfig: theme,
      })
      const result: MermaidRenderResult = Object.assign(
        {
          svg: browserRendered.svg,
          sourceHash,
          cacheKey,
          contrastAdjustments: browserRendered.contrastAdjustments,
        },
        browserRendered.bindFunctions
          ? { bindFunctions: browserRendered.bindFunctions }
          : undefined,
      )
      touchSvgCache(cacheKey, result)
      return result
    },
  })
}

async function renderMermaidSvg(input: MermaidRenderInput): Promise<MermaidRenderResult> {
  const priority = input.priority ?? MERMAID_SCHEDULER_PRIORITY_DEFAULT
  if (input.objectID && input.directory) {
    return renderPersistedMermaidSvg({
      directory: input.directory,
      objectID: input.objectID,
      source: input.source,
      priority,
      revisionID: input.revisionID,
      themeConfig: input.themeConfig,
    })
  }
  return renderEphemeralMermaidSvg({
    objectID: input.objectID,
    source: input.source,
    priority,
    revisionID: input.revisionID,
    themeConfig: input.themeConfig,
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
