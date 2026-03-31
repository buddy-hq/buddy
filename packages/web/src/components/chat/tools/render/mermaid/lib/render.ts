import { initializeMermaidRuntime, loadMermaidRuntime } from "./loader"

type MermaidRenderResult = {
  svg: string
  sourceHash: string
  cacheKey: string
  bindFunctions?: (element: Element) => void
}

type MermaidRenderInput = {
  source: string
  artifactID?: string
}

const MERMAID_CACHE_LIMIT = 400
type MermaidSvgCacheValue = {
  svg: string
  bindFunctions?: (element: Element) => void
}

const mermaidSvgCache = new Map<string, MermaidSvgCacheValue>()

let renderCounter = 0

function isBindFunctions(value: unknown): value is (element: Element) => void {
  return typeof value === "function"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function normalizeMermaidSource(source: string): string {
  return source.replace(/\r\n?/gu, "\n").trim().replace(/"/gu, "'")
}

function hashSource(source: string): string {
  let hash = 0xcbf29ce484222325n
  for (const character of source) {
    hash ^= BigInt(character.codePointAt(0) ?? 0)
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return hash.toString(16).padStart(16, "0")
}

function readTokenValue(name: string, fallback: string): string {
  if (typeof window === "undefined") {
    return fallback
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value.length > 0 ? value : fallback
}

function readThemeTokens() {
  return {
    backgroundBase: readTokenValue("--background-base", "#ffffff"),
    surfaceRaisedBase: readTokenValue("--surface-raised-base", "#f5f5f5"),
    surfaceWeak: readTokenValue("--surface-weak", "#efefef"),
    borderBase: readTokenValue("--border-base", "#d6d6d6"),
    textBase: readTokenValue("--text-base", "#1f2937"),
    textWeak: readTokenValue("--text-weak", "#6b7280"),
    textInteractiveBase: readTokenValue("--text-interactive-base", "#2563eb"),
  }
}

function buildThemeVariables(tokens: ReturnType<typeof readThemeTokens>): Record<string, string> {
  return {
    background: tokens.backgroundBase,
    mainBkg: tokens.backgroundBase,
    secondBkg: tokens.surfaceWeak,
    tertiaryColor: tokens.surfaceWeak,
    primaryColor: tokens.surfaceRaisedBase,
    primaryBorderColor: tokens.borderBase,
    primaryTextColor: tokens.textBase,
    secondaryColor: tokens.surfaceWeak,
    secondaryBorderColor: tokens.borderBase,
    tertiaryBorderColor: tokens.borderBase,
    textColor: tokens.textBase,
    lineColor: tokens.textWeak,
    border1: tokens.borderBase,
    border2: tokens.borderBase,
    nodeBorder: tokens.borderBase,
    clusterBkg: tokens.backgroundBase,
    clusterBorder: tokens.borderBase,
    edgeLabelBackground: tokens.backgroundBase,
    actorBkg: tokens.surfaceRaisedBase,
    actorBorder: tokens.borderBase,
    actorTextColor: tokens.textBase,
    activationBkgColor: tokens.surfaceWeak,
    activationBorderColor: tokens.borderBase,
    sequenceNumberColor: tokens.textInteractiveBase,
    titleColor: tokens.textBase,
    noteBkgColor: tokens.surfaceWeak,
    noteBorderColor: tokens.borderBase,
    noteTextColor: tokens.textBase,
    labelTextColor: tokens.textBase,
    labelBackground: tokens.backgroundBase,
  }
}

function themeSignature(tokens: ReturnType<typeof readThemeTokens>): string {
  return [
    tokens.backgroundBase,
    tokens.surfaceRaisedBase,
    tokens.surfaceWeak,
    tokens.borderBase,
    tokens.textBase,
    tokens.textWeak,
    tokens.textInteractiveBase,
  ].join("|")
}

function cacheKey(input: { sourceHash: string; themeSignature: string }): string {
  return `source:${input.sourceHash}|theme:${input.themeSignature}`
}

function touchSvgCache(key: string, value: MermaidSvgCacheValue): void {
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

export async function renderMermaidSvg(input: MermaidRenderInput): Promise<MermaidRenderResult> {
  const source = normalizeMermaidSource(input.source)
  if (!source) {
    throw new Error("Mermaid source is empty.")
  }

  const sourceHash = hashSource(source)
  const tokens = readThemeTokens()
  const nextCacheKey = cacheKey({
    sourceHash,
    themeSignature: themeSignature(tokens),
  })
  const cached = mermaidSvgCache.get(nextCacheKey)
  if (cached) {
    touchSvgCache(nextCacheKey, cached)
    return {
      svg: cached.svg,
      sourceHash,
      cacheKey: nextCacheKey,
      ...(cached.bindFunctions ? { bindFunctions: cached.bindFunctions } : {}),
    }
  }

  const runtime = await loadMermaidRuntime()
  initializeMermaidRuntime(runtime, {
    themeVariables: buildThemeVariables(tokens),
  })

  const renderID = `buddy_mermaid_${sourceHash}_${renderCounter}`
  renderCounter += 1
  const rendered = await runtime.render(renderID, source)

  let svg: string | undefined
  let bindFunctions: ((element: Element) => void) | undefined
  if (typeof rendered === "string") {
    svg = rendered
  } else if (isRecord(rendered) && typeof rendered.svg === "string") {
    svg = rendered.svg
    const maybeBind = rendered.bindFunctions
    if (isBindFunctions(maybeBind)) {
      bindFunctions = maybeBind
    }
  }

  if (!svg) {
    throw new Error("Mermaid renderer did not return SVG output.")
  }

  touchSvgCache(nextCacheKey, {
    svg,
    ...(bindFunctions ? { bindFunctions } : {}),
  })
  return {
    svg,
    sourceHash,
    cacheKey: nextCacheKey,
    ...(bindFunctions ? { bindFunctions } : {}),
  }
}

export { hashSource as hashMermaidSource }

export type { MermaidRenderInput, MermaidRenderResult }
