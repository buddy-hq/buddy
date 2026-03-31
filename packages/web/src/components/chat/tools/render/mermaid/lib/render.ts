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

const MERMAID_PLACEHOLDER_ATTRIBUTE = "data-buddy-mermaid-placeholder"
const MERMAID_SOURCE_ATTRIBUTE = "data-buddy-mermaid-source"
const MERMAID_ENHANCED_ATTRIBUTE = "data-buddy-mermaid-enhanced"

const MERMAID_PLACEHOLDER_SELECTOR = `[${MERMAID_PLACEHOLDER_ATTRIBUTE}="true"]`

const MARKDOWN_MERMAID_WRAPPER_CLASS =
  "my-5 rounded-lg border border-border-base bg-background-base p-3"
const MARKDOWN_MERMAID_ERROR_CLASS =
  "rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base"
const MARKDOWN_MERMAID_META_CLASS = "mt-2 text-sm text-text-weak"

const MERMAID_CACHE_LIMIT = 400
type MermaidSvgCacheValue = {
  svg: string
  bindFunctions?: (element: Element) => void
}

const mermaidSvgCache = new Map<string, MermaidSvgCacheValue>()

let renderCounter = 0

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isBindFunctions(value: unknown): value is (element: Element) => void {
  return typeof value === "function"
}

function normalizeMermaidSource(source: string): string {
  return source.replace(/\r\n?/gu, "\n").trim()
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

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim()
  }
  return "Mermaid rendering failed."
}

function sourceFromPlaceholder(node: Element): string | undefined {
  const encoded = node.getAttribute(MERMAID_SOURCE_ATTRIBUTE)
  if (!encoded) {
    return undefined
  }

  try {
    const decoded = decodeURIComponent(encoded)
    const normalized = normalizeMermaidSource(decoded)
    return normalized.length > 0 ? normalized : undefined
  } catch {
    return undefined
  }
}

function createRawSourceBlock(source: string): HTMLPreElement {
  const pre = document.createElement("pre")
  pre.className =
    "mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-surface-weak/40 p-2 text-xs text-text-base"
  const code = document.createElement("code")
  code.textContent = source
  pre.appendChild(code)
  return pre
}

function renderInlineMermaidSuccess(
  node: HTMLElement,
  source: string,
  rendered: MermaidRenderResult,
): void {
  node.className = MARKDOWN_MERMAID_WRAPPER_CLASS
  node.setAttribute(MERMAID_ENHANCED_ATTRIBUTE, "true")
  node.setAttribute(MERMAID_SOURCE_ATTRIBUTE, encodeURIComponent(source))

  const diagram = document.createElement("div")
  diagram.className = "overflow-auto"
  diagram.innerHTML = rendered.svg
  rendered.bindFunctions?.(diagram)

  node.replaceChildren(diagram)
}

function renderInlineMermaidFailure(node: HTMLElement, source: string, message: string): void {
  node.className = MARKDOWN_MERMAID_WRAPPER_CLASS
  node.setAttribute(MERMAID_ENHANCED_ATTRIBUTE, "true")
  node.setAttribute(MERMAID_SOURCE_ATTRIBUTE, encodeURIComponent(source))

  const panel = document.createElement("div")
  panel.className = MARKDOWN_MERMAID_ERROR_CLASS
  panel.textContent = `Unable to render Mermaid diagram: ${message}`

  const helper = document.createElement("div")
  helper.className = MARKDOWN_MERMAID_META_CLASS
  helper.textContent = "Showing raw Mermaid source instead."

  node.replaceChildren(panel, helper, createRawSourceBlock(source))
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

export function createMermaidPlaceholderHtml(source: string): string {
  const encodedSource = encodeURIComponent(source)
  return `<div ${MERMAID_PLACEHOLDER_ATTRIBUTE}="true" ${MERMAID_SOURCE_ATTRIBUTE}="${encodedSource}"></div>`
}

export async function enhanceMermaidPlaceholders(
  root: ParentNode,
  input?: { signal?: AbortSignal },
): Promise<void> {
  const placeholders = Array.from(root.querySelectorAll<HTMLElement>(MERMAID_PLACEHOLDER_SELECTOR))

  for (const placeholder of placeholders) {
    if (input?.signal?.aborted) {
      return
    }

    const source = sourceFromPlaceholder(placeholder)
    if (!source) {
      renderInlineMermaidFailure(placeholder, "", "missing Mermaid source")
      continue
    }

    try {
      const rendered = await renderMermaidSvg({ source })
      if (input?.signal?.aborted) {
        return
      }
      renderInlineMermaidSuccess(placeholder, source, rendered)
    } catch (error) {
      if (input?.signal?.aborted) {
        return
      }
      renderInlineMermaidFailure(placeholder, source, errorMessage(error))
    }
  }
}

export { MERMAID_PLACEHOLDER_SELECTOR, hashSource as hashMermaidSource }

export type { MermaidRenderInput, MermaidRenderResult }
