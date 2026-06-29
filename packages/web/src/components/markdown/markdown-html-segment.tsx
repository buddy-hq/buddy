import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import DOMPurify from "dompurify"
import morphdom from "morphdom"
import "katex/dist/katex.min.css"
import "@/components/chat/tools/text-shimmer.css"
import { toast } from "@buddy/ui"
import { resolveFileTypeIconUrl } from "@/components/files/file-type-icon"
import {
  buildPresentedMediaFileActionInput,
  findPresentedMediaCandidateMatches,
  isLikelyPresentedMediaPathCandidate,
  normalizePresentedMediaCandidatePath,
  resolvePresentedMediaPathInfo,
} from "@/lib/presented-media"
import { useWorkspaceFileOpen, type WorkspaceResourceOpener } from "@/lib/use-workspace-file-open"
import { usePlatform } from "@/context/platform"
import { getServerConnection } from "@/context/server"
import { resolveAssetUrl } from "@/lib/resource-url"
import {
  parseMarkdownToHtml,
  projectMarkdownBlocks,
  type MarkdownProjection,
} from "./markdown-parser"
import {
  disposeMarkdownWorkerKey,
  highlightStreamingCode,
  MarkdownWorkerDisposedError,
  MarkdownWorkerSupersededError,
  MarkdownWorkerUnavailableError,
} from "./markdown-worker"
import { shouldResetCodeTokens, type RenderedCodeState } from "./markdown-code-state"
import type { MarkdownToken, MarkdownWorkerState } from "./markdown-worker-protocol"
import { hasOpenStreamingMath } from "./markdown-math"
import { useInlineAssetLifecycleReporter } from "@/components/chat/inline-asset-boundary"

if (typeof window !== "undefined" && DOMPurify.isSupported) {
  DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
    if (node instanceof HTMLAnchorElement) {
      if (node.target !== "_blank") return

      const rel = node.getAttribute("rel") ?? ""
      const set = new Set(rel.split(/\s+/).filter(Boolean))
      set.add("noopener")
      set.add("noreferrer")
      node.setAttribute("rel", Array.from(set).join(" "))
      return
    }

    if (node instanceof HTMLImageElement) {
      const src = node.getAttribute("src")
      if (!src || !src.startsWith("/api/")) return
      node.setAttribute("src", resolveAssetUrl(src))
    }
  })
}

const sanitizeConfig = {
  USE_PROFILES: { html: true, mathMl: true, svg: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
}

// Current prose-based markdown styles.
// The original hand-rolled version is preserved in ./markdown-legacy-styles.ts for rollback.
const markdownClassName = [
  // Base prose: sm size, min-w-0 for flex truncation, break-words for unbroken model output.
  "prose prose-sm min-w-0 max-w-full break-words",
  // Wire prose color vars to our design tokens
  "[--tw-prose-body:var(--color-text-base)]",
  "[--tw-prose-headings:var(--color-text-strong)]",
  "[--tw-prose-bold:var(--color-text-strong)]",
  "[--tw-prose-links:var(--color-text-interactive-base)]",
  "[--tw-prose-code:var(--color-syntax-string)]",
  "[--tw-prose-quotes:var(--color-text-weak)]",
  "[--tw-prose-quote-borders:var(--color-border-weak-base)]",
  "[--tw-prose-captions:var(--color-text-weaker)]",
  "[--tw-prose-th-borders:var(--color-border-weak-base)]",
  "[--tw-prose-td-borders:var(--color-border-weaker-base)]",
  "[--tw-prose-counters:var(--color-text-weak)]",
  "[--tw-prose-bullets:var(--color-text-weak)]",
  "[--tw-prose-hr:var(--color-border-weak-base)]",
  "[--tw-prose-lead:var(--color-text-weak)]",
  "[--tw-prose-pre-bg:transparent]",
  "[--tw-prose-pre-code:var(--color-text-base)]",
  // Markdown blocks add one wrapper between the prose root and rendered content.
  // Reset only the outer edges so separate streaming blocks retain their internal rhythm.
  "[&>[data-markdown-block-key]:first-child>*:first-child]:mt-0",
  "[&>[data-markdown-block-key]:last-child>*:last-child]:mb-0",
  // Keep headings the same size as body text (chat context)
  "[&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-sm [&_h4]:text-sm [&_h5]:text-sm [&_h6]:text-sm",
  "prose-headings:font-medium",
  // Code block overrides — use our shiki/mono styling
  "[&_code]:font-mono [&_code]:[font-feature-settings:var(--font-family-mono--font-feature-settings)] [&_code]:font-medium [&_code]:break-words",
  "[&_code]:before:content-none [&_code]:after:content-none",
  "[&_.shiki]:rounded [&_.shiki]:border [&_.shiki]:border-border-weak-base [&_.shiki]:p-3 [&_.shiki]:text-[13px]",
  "[&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit",
  "[&_pre]:overflow-auto [&_pre]:[scrollbar-width:none] [&_pre::-webkit-scrollbar]:hidden",
  // Links and tables must contain pathological long output inside the chat column.
  "[&_a]:break-words [&_a]:no-underline [&_a:hover]:underline [&_a:hover]:underline-offset-2",
  "[&_a.external-link:hover>code]:underline [&_a.external-link:hover>code]:underline-offset-2",
  "[&_table]:block [&_table]:w-full [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse",
  // katex
  "[&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:[scrollbar-width:none] [&_.katex-display::-webkit-scrollbar]:hidden",
].join(" ")

type CopyLabels = {
  copy: string
  copied: string
}

type MarkdownCacheEntry = {
  source: string
  html: string
}

type MarkdownHtmlBlockMode = "full" | "live" | "code"

const MARKDOWN_CACHE_MAX = 200
const markdownCache = new Map<string, MarkdownCacheEntry>()
const renderedCodeTokens = new WeakMap<HTMLDivElement, RenderedCodeState>()
const CODE_FALLBACK_BACKGROUND_COLOR = "var(--color-background-stronger)"
const CODE_FALLBACK_COLOR = "var(--color-text-base)"

const copyIconPath =
  '<path d="M6.2513 6.24935V2.91602H17.0846V13.7493H13.7513M13.7513 6.24935V17.0827H2.91797V6.24935H13.7513Z" stroke="currentColor" stroke-linecap="round"/>'
const checkIconPath =
  '<path d="M5 11.9657L8.37838 14.7529L15 5.83398" stroke="currentColor" stroke-linecap="square"/>'
const codeUrlPattern = /^https?:\/\/[^\s<>()`"']+$/u

function codeUrl(text: string) {
  const href = text.trim().replace(/[),.;!?]+$/g, "")
  if (!codeUrlPattern.test(href)) return
  try {
    return new URL(href).toString()
  } catch {
    return
  }
}

function presentedMediaLinkLabel(path: string) {
  const normalized = normalizePresentedMediaCandidatePath(path)
  const withoutFileProtocol = normalized.startsWith("file://")
    ? normalized.replace(/^file:\/\//u, "")
    : normalized
  const trimmed = withoutFileProtocol.replace(/[\\/]+$/gu, "")
  const lastSlash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))
  return lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed
}

function createCopyIcon(path: string, slot: string) {
  const icon = document.createElement("span")
  icon.setAttribute("data-slot", slot)
  icon.className = "pointer-events-none inline-flex h-4 w-4 items-center justify-center"
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", "0 0 20 20")
  svg.setAttribute("fill", "none")
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("class", "h-4 w-4")
  svg.innerHTML = path
  icon.appendChild(svg)
  return icon
}

function createPresentedMediaIcon(path: string) {
  const icon = document.createElement("span")
  icon.setAttribute("data-slot", "presented-media-icon")
  icon.className =
    "pointer-events-none inline-flex size-3.5 shrink-0 items-center justify-center relative top-px"

  const fileName = presentedMediaLinkLabel(path)
  const image = document.createElement("img")
  image.setAttribute("alt", "")
  image.setAttribute("aria-hidden", "true")
  image.setAttribute("src", resolveFileTypeIconUrl({ fileName }))
  image.className = "size-3.5 object-contain"
  icon.appendChild(image)
  return icon
}

function decoratePresentedMediaLink(link: HTMLAnchorElement, filePath: string) {
  link.href = filePath
  link.setAttribute("data-presented-media-path", filePath)
  link.className =
    "presented-media-link mx-1 inline-flex max-w-full items-baseline gap-1.5 align-baseline text-text-interactive-base no-underline hover:underline hover:decoration-dotted hover:underline-offset-2"
  link.removeAttribute("target")
  link.removeAttribute("rel")
  link.setAttribute("title", filePath)

  const existingIcon = link.querySelector('[data-slot="presented-media-icon"]')
  if (existingIcon instanceof HTMLElement) {
    existingIcon.replaceWith(createPresentedMediaIcon(filePath))
  } else {
    link.appendChild(createPresentedMediaIcon(filePath))
  }

  const label = presentedMediaLinkLabel(filePath)
  const existingLabel = link.querySelector('[data-slot="presented-media-label"]')
  if (existingLabel instanceof HTMLElement) {
    existingLabel.className = "min-w-0 whitespace-normal [overflow-wrap:anywhere]"
    existingLabel.textContent = label
  } else {
    const labelNode = document.createElement("span")
    labelNode.setAttribute("data-slot", "presented-media-label")
    labelNode.className = "min-w-0 whitespace-normal [overflow-wrap:anywhere]"
    labelNode.textContent = label
    link.appendChild(labelNode)
  }
}

function createCopyButton(labels: CopyLabels) {
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute("data-slot", "markdown-copy-button")
  button.setAttribute("aria-label", labels.copy)
  button.setAttribute("title", labels.copy)
  button.className =
    "group absolute right-1 top-1 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-base bg-background-base/90 text-text-weak opacity-0 shadow-sm transition-opacity hover:text-text-base focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-base group-hover/markdown-code:opacity-100"
  button.appendChild(createCopyIcon(copyIconPath, "copy-icon"))
  const checkIcon = createCopyIcon(checkIconPath, "check-icon")
  checkIcon.style.display = "none"
  button.appendChild(checkIcon)
  return button
}

function setCopyState(button: HTMLButtonElement, labels: CopyLabels, copied: boolean) {
  if (copied) {
    button.setAttribute("data-copied", "true")
    button.setAttribute("aria-label", labels.copied)
    button.setAttribute("title", labels.copied)
    return
  }
  button.removeAttribute("data-copied")
  button.setAttribute("aria-label", labels.copy)
  button.setAttribute("title", labels.copy)
}

function setIconVisibility(button: HTMLButtonElement) {
  const copied = button.getAttribute("data-copied") === "true"
  const copyIcon = button.querySelector('[data-slot="copy-icon"]')
  const checkIcon = button.querySelector('[data-slot="check-icon"]')
  if (!(copyIcon instanceof HTMLElement) || !(checkIcon instanceof HTMLElement)) return
  copyIcon.style.display = copied ? "none" : "inline-flex"
  checkIcon.style.display = copied ? "inline-flex" : "none"
}

function ensureCodeWrapper(block: HTMLPreElement, labels: CopyLabels) {
  const parent = block.parentElement
  if (!parent) return
  const wrapped = parent.getAttribute("data-component") === "markdown-code"
  if (!wrapped) {
    const wrapper = document.createElement("div")
    wrapper.setAttribute("data-component", "markdown-code")
    wrapper.className = "group/markdown-code relative"
    parent.replaceChild(wrapper, block)
    wrapper.appendChild(block)
    wrapper.appendChild(createCopyButton(labels))
    return
  }

  parent.classList.add("group/markdown-code", "relative")
  const buttons = Array.from(parent.querySelectorAll('[data-slot="markdown-copy-button"]')).filter(
    (element): element is HTMLButtonElement => element instanceof HTMLButtonElement,
  )
  if (buttons.length === 0) {
    parent.appendChild(createCopyButton(labels))
    return
  }
  for (const button of buttons.slice(1)) {
    button.remove()
  }
}

function markCodeLinks(root: HTMLDivElement) {
  const codeNodes = Array.from(root.querySelectorAll(":not(pre) > code"))
  for (const code of codeNodes) {
    const text = code.textContent ?? ""
    const href = codeUrl(text)
    const filePath = isLikelyPresentedMediaPathCandidate(text)
      ? normalizePresentedMediaCandidatePath(text)
      : undefined
    const parentLink =
      code.parentElement instanceof HTMLAnchorElement &&
      (code.parentElement.classList.contains("external-link") ||
        code.parentElement.classList.contains("presented-media-link"))
        ? code.parentElement
        : null

    if (!href) {
      if (!filePath) {
        if (parentLink) parentLink.replaceWith(code)
        continue
      }

      const link = parentLink ?? document.createElement("a")
      if (!parentLink) {
        code.parentNode?.replaceChild(link, code)
      }
      decoratePresentedMediaLink(link, filePath)

      if (code.parentNode === link) {
        code.remove()
      }
      continue
    }

    if (parentLink) {
      parentLink.href = href
      continue
    }

    const link = document.createElement("a")
    link.href = href
    link.className = "external-link"
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    code.parentNode?.replaceChild(link, code)
    link.appendChild(code)
  }
}

function markTextLinks(root: HTMLDivElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []

  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (!(current instanceof Text)) continue
    if (!current.textContent?.trim()) continue
    const parent = current.parentElement
    if (!parent) continue
    if (parent.closest("pre, code, a, button")) continue
    nodes.push(current)
  }

  for (const node of nodes) {
    const text = node.textContent ?? ""
    const matches = findPresentedMediaCandidateMatches(text)
    if (matches.length === 0) continue

    const fragment = document.createDocumentFragment()
    let cursor = 0

    for (const match of matches) {
      if (match.start > cursor) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, match.start)))
      }

      const link = document.createElement("a")
      decoratePresentedMediaLink(link, match.path)
      fragment.appendChild(link)
      cursor = match.end
    }

    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)))
    }

    node.replaceWith(fragment)
  }
}

function decorateMarkdown(root: HTMLDivElement, labels: CopyLabels) {
  const blocks = Array.from(root.querySelectorAll("pre"))
  for (const block of blocks) {
    ensureCodeWrapper(block, labels)
  }
  markCodeLinks(root)
  markTextLinks(root)
}

function setupCodeCopy(root: HTMLDivElement, labels: CopyLabels) {
  const timeouts = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>()
  const buttons = Array.from(root.querySelectorAll('[data-slot="markdown-copy-button"]')).filter(
    (button): button is HTMLButtonElement => button instanceof HTMLButtonElement,
  )

  for (const button of buttons) {
    setIconVisibility(button)
  }

  const handleClick = async (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest('[data-slot="markdown-copy-button"]')
    if (!(button instanceof HTMLButtonElement)) return
    const code = button.closest('[data-component="markdown-code"]')?.querySelector("code")
    const content = code?.textContent ?? ""
    if (!content || !navigator.clipboard) return
    await navigator.clipboard.writeText(content)
    setCopyState(button, labels, true)
    setIconVisibility(button)
    const existing = timeouts.get(button)
    if (existing) clearTimeout(existing)
    const timeout = setTimeout(() => {
      setCopyState(button, labels, false)
      setIconVisibility(button)
    }, 2000)
    timeouts.set(button, timeout)
  }

  root.addEventListener("click", handleClick)
  return () => {
    root.removeEventListener("click", handleClick)
    for (const timeout of timeouts.values()) {
      clearTimeout(timeout)
    }
  }
}

export function sanitizeMarkdownHtml(html: string) {
  if (!DOMPurify.isSupported) return ""
  return DOMPurify.sanitize(html, sanitizeConfig)
}

export function sanitizeRawMarkdownFallback(text: string): string {
  const escaped = text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;")
  return sanitizeMarkdownHtml(escaped.replace(/\r\n?/gu, "\n").replace(/\n/gu, "<br>"))
}

function markdownSanitizeContextKey() {
  const server = getServerConnection()
  return [server.url ?? "", server.username ?? "", server.password ?? ""].join("|")
}

function touchMarkdownCache(key: string, value: MarkdownCacheEntry) {
  markdownCache.delete(key)
  markdownCache.set(key, value)
  if (markdownCache.size <= MARKDOWN_CACHE_MAX) return
  const first = markdownCache.keys().next().value
  if (!first) return
  markdownCache.delete(first)
}

function decoratedMarkdownRoot(html: string, labels: CopyLabels): HTMLDivElement | undefined {
  const document = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html")
  const nextRoot = document.body.firstElementChild
  if (!(nextRoot instanceof HTMLDivElement)) return undefined

  decorateMarkdown(nextRoot, labels)
  return nextRoot
}

function isSameMarkdownImage(fromElement: Element, toElement: Element): boolean {
  if (!(fromElement instanceof HTMLImageElement) || !(toElement instanceof HTMLImageElement)) {
    return false
  }

  return (
    fromElement.getAttribute("src") === toElement.getAttribute("src") &&
    fromElement.getAttribute("alt") === toElement.getAttribute("alt") &&
    fromElement.getAttribute("title") === toElement.getAttribute("title")
  )
}

function decoratedCodeFallbackRoot(input: {
  code: string
  language: string | undefined
  labels: CopyLabels
}): HTMLDivElement {
  const root = document.createElement("div")
  const pre = document.createElement("pre")
  pre.className = "shiki OpenCode"
  pre.style.backgroundColor = CODE_FALLBACK_BACKGROUND_COLOR
  pre.style.color = CODE_FALLBACK_COLOR
  const code = document.createElement("code")
  code.className = `language-${input.language || "text"}`
  code.appendChild(createCodeTokenSpan([input.code, ""]))
  pre.appendChild(code)
  root.appendChild(pre)
  decorateMarkdown(root, input.labels)
  return root
}

function sameCodeToken(left: MarkdownToken, right: MarkdownToken | undefined) {
  return !!right && left[0] === right[0] && left[1] === right[1]
}

function createCodeTokenSpan(token: MarkdownToken) {
  const span = document.createElement("span")
  span.setAttribute("style", token[1])
  span.textContent = token[0]
  return span
}

function updateCodeTokens(input: {
  root: HTMLDivElement
  language: string
  raw: string
  result: MarkdownWorkerState
}) {
  const code = input.root.querySelector("code")
  if (!(code instanceof HTMLElement)) return

  code.className = `language-${input.language}`
  const previous = renderedCodeTokens.get(input.root)
  const reset = shouldResetCodeTokens(previous, {
    language: input.language,
    generation: input.result.generation,
    stableCount: input.result.stable.length,
    raw: input.raw,
  })
  const stableCount = reset ? 0 : (previous?.stableCount ?? 0)
  const tail = [...input.result.stable.slice(stableCount), ...input.result.unstable]
  const prior = reset ? [] : (previous?.unstable ?? [])
  const prefix = prior.findIndex((token, index) => !sameCodeToken(token, tail[index]))
  const keep = stableCount + (prefix < 0 ? Math.min(prior.length, tail.length) : prefix)

  if (reset) {
    code.replaceChildren()
  } else {
    while (code.children.length > keep) {
      code.lastElementChild?.remove()
    }
  }
  tail
    .slice(keep - stableCount)
    .map(createCodeTokenSpan)
    .forEach((span) => code.appendChild(span))

  renderedCodeTokens.set(input.root, {
    language: input.language,
    generation: input.result.generation,
    stableCount: input.result.stable.length,
    unstable: input.result.unstable,
    raw: input.raw,
  })
}

type MarkdownHtmlSegmentProps = {
  text: string
  cacheKey?: string
  className?: string
  directory?: string
  onOpenResource?: WorkspaceResourceOpener
  streaming?: boolean
  interrupted?: boolean
}

type MarkdownHtmlBlockProps = MarkdownHtmlSegmentProps & {
  blockKey: string
  blockMode: Exclude<MarkdownHtmlBlockMode, "code">
}

const MarkdownHtmlBlock = memo(function MarkdownHtmlBlock(props: MarkdownHtmlBlockProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const renderIdRef = useRef(0)
  const copyCleanupRef = useRef<(() => void) | undefined>(undefined)
  const copySetupTimerRef = useRef<number | undefined>(undefined)
  const copyLabels = useMemo<CopyLabels>(() => ({ copy: "Copy code", copied: "Copied" }), [])
  const platform = usePlatform()
  const { executePrimary } = useWorkspaceFileOpen(props.directory, props.onOpenResource)
  const sanitizeContextKey = markdownSanitizeContextKey()
  const fullCacheKey = useMemo(
    () =>
      `${props.cacheKey ?? props.text}::${sanitizeContextKey}::${props.streaming ? "live" : "full"}::${props.interrupted ? "interrupted" : "active"}`,
    [props.cacheKey, props.text, sanitizeContextKey, props.streaming, props.interrupted],
  )
  useInlineAssetLifecycleReporter({
    ref: rootRef,
    active: true,
  })
  const cachedEntry = useMemo(() => {
    const cached = markdownCache.get(fullCacheKey)
    if (cached && cached.source === props.text) {
      touchMarkdownCache(fullCacheKey, cached)
      return cached
    }
    return null
  }, [fullCacheKey, props.text])

  const resetCodeCopy = useCallback(() => {
    if (copySetupTimerRef.current !== undefined) {
      window.clearTimeout(copySetupTimerRef.current)
      copySetupTimerRef.current = undefined
    }
    if (copyCleanupRef.current) {
      copyCleanupRef.current()
      copyCleanupRef.current = undefined
    }
  }, [])

  useEffect(() => {
    return () => {
      resetCodeCopy()
    }
  }, [resetCodeCopy])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !cachedEntry) return

    const nextRoot = decoratedMarkdownRoot(cachedEntry.html, copyLabels)
    if (!nextRoot) return

    root.replaceChildren(...Array.from(nextRoot.childNodes))
    resetCodeCopy()
    copySetupTimerRef.current = window.setTimeout(() => {
      if (!root.isConnected) return
      copyCleanupRef.current = setupCodeCopy(root, copyLabels)
    }, 0)
  }, [cachedEntry, copyLabels, resetCodeCopy])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const link = target.closest("a")
      if (!(link instanceof HTMLAnchorElement)) return
      if (!props.directory) return
      if (link.classList.contains("external-link")) return

      const rawPath =
        link.getAttribute("data-presented-media-path")?.trim() ??
        link.getAttribute("title")?.trim() ??
        link.getAttribute("href")?.trim()
      if (!rawPath) return
      if (!isLikelyPresentedMediaPathCandidate(rawPath)) return
      event.preventDefault()
      const directory = props.directory

      void (async () => {
        try {
          const resolved = await resolvePresentedMediaPathInfo({
            directory,
            path: normalizePresentedMediaCandidatePath(rawPath),
          })
          await executePrimary(
            buildPresentedMediaFileActionInput({
              item: resolved,
              canOpenDefaultApp: !!platform.openPath,
              canReveal: !!platform.revealPath,
            }),
          )
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error))
        }
      })()
    }

    root.addEventListener("click", handleClick)

    const renderId = renderIdRef.current + 1
    renderIdRef.current = renderId
    let cancelled = false
    const preserveRenderedFallback = props.streaming === true && hasOpenStreamingMath(props.text)
    if (!cachedEntry && !preserveRenderedFallback && root.childNodes.length === 0) {
      const fallbackRoot = decoratedMarkdownRoot(
        sanitizeRawMarkdownFallback(props.text),
        copyLabels,
      )
      if (fallbackRoot) {
        root.replaceChildren(...Array.from(fallbackRoot.childNodes))
        resetCodeCopy()
      }
    }

    void (async () => {
      let html: string
      try {
        html = sanitizeMarkdownHtml(
          await parseMarkdownToHtml(props.text, props.streaming, props.cacheKey),
        )
      } catch {
        html = sanitizeRawMarkdownFallback(props.text)
      }
      if (cancelled || renderIdRef.current !== renderId) return
      touchMarkdownCache(fullCacheKey, { source: props.text, html })

      const nextRoot = decoratedMarkdownRoot(html, copyLabels)
      if (!nextRoot) return

      morphdom(root, nextRoot, {
        childrenOnly: true,
        onBeforeElUpdated: (fromEl, toEl) => {
          if (isSameMarkdownImage(fromEl, toEl)) {
            return false
          }
          if (
            fromEl instanceof HTMLButtonElement &&
            toEl instanceof HTMLButtonElement &&
            fromEl.getAttribute("data-slot") === "markdown-copy-button" &&
            toEl.getAttribute("data-slot") === "markdown-copy-button" &&
            fromEl.getAttribute("data-copied") === "true"
          ) {
            setCopyState(toEl, copyLabels, true)
          }
          if (fromEl.isEqualNode(toEl)) return false
          return true
        },
      })
      resetCodeCopy()
      copySetupTimerRef.current = window.setTimeout(() => {
        if (cancelled || renderIdRef.current !== renderId || !root.isConnected) return
        copyCleanupRef.current = setupCodeCopy(root, copyLabels)
      }, 0)
    })()

    return () => {
      cancelled = true
      root.removeEventListener("click", handleClick)
      resetCodeCopy()
    }
  }, [
    cachedEntry,
    copyLabels,
    executePrimary,
    fullCacheKey,
    platform.openPath,
    platform.revealPath,
    props.cacheKey,
    props.directory,
    props.interrupted,
    props.blockMode,
    props.text,
    props.streaming,
    resetCodeCopy,
  ])

  return <div ref={rootRef} data-markdown-block-key={props.blockKey} className={props.className} />
})

type MarkdownCodeBlockProps = {
  blockKey: string
  raw: string
  code: string
  language?: string
  complete?: boolean
}

const MarkdownCodeBlock = memo(function MarkdownCodeBlock(props: MarkdownCodeBlockProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const copyCleanupRef = useRef<(() => void) | undefined>(undefined)
  const copyLabels = useMemo<CopyLabels>(() => ({ copy: "Copy code", copied: "Copied" }), [])
  const language = props.language || "text"
  const workerKey = props.blockKey

  useInlineAssetLifecycleReporter({
    ref: rootRef,
    active: true,
  })

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || root.childNodes.length > 0) return
    const fallbackRoot = decoratedCodeFallbackRoot({
      code: props.code,
      language,
      labels: copyLabels,
    })
    root.replaceChildren(...Array.from(fallbackRoot.childNodes))
    copyCleanupRef.current = setupCodeCopy(root, copyLabels)
  }, [copyLabels, language, props.code])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let cancelled = false

    void highlightStreamingCode({
      key: workerKey,
      text: props.code,
      language,
      complete: props.complete,
    })
      .then((result) => {
        if (cancelled || !root.isConnected) return
        updateCodeTokens({
          root,
          language,
          raw: props.raw,
          result,
        })
      })
      .catch((error: unknown) => {
        if (
          error instanceof MarkdownWorkerDisposedError ||
          error instanceof MarkdownWorkerSupersededError ||
          error instanceof MarkdownWorkerUnavailableError
        ) {
          return
        }
        console.error("Markdown highlighting worker failed", error)
      })

    return () => {
      cancelled = true
    }
  }, [language, props.code, props.complete, props.raw, workerKey])

  useEffect(() => {
    return () => {
      copyCleanupRef.current?.()
      copyCleanupRef.current = undefined
      disposeMarkdownWorkerKey(workerKey)
    }
  }, [workerKey])

  return (
    <div
      ref={rootRef}
      data-markdown-block-key={props.blockKey}
      data-markdown-complete={props.complete ? "true" : "false"}
      className=""
    />
  )
})

export function MarkdownHtmlSegment(props: MarkdownHtmlSegmentProps) {
  const projectionRef = useRef<MarkdownProjection | undefined>(undefined)
  const projection = useMemo(() => {
    const next = projectMarkdownBlocks(projectionRef.current, props.text, props.streaming ?? false)
    projectionRef.current = next
    return next
  }, [props.streaming, props.text])
  const blocks = projection.blocks
  const baseCacheKey = props.cacheKey ?? props.text

  return (
    <div className={props.className ?? markdownClassName}>
      {blocks.map((block, index) => {
        const blockKey = `${baseCacheKey}:${index}:${block.mode}`
        if (block.mode === "code") {
          return (
            <MarkdownCodeBlock
              key={blockKey}
              blockKey={blockKey}
              raw={block.raw}
              code={block.src}
              language={block.language}
              complete={block.complete}
            />
          )
        }
        return (
          <MarkdownHtmlBlock
            key={blockKey}
            blockKey={blockKey}
            blockMode={block.mode}
            text={block.src}
            cacheKey={blockKey}
            className=""
            directory={props.directory}
            onOpenResource={props.onOpenResource}
            streaming={block.mode === "live"}
            interrupted={props.interrupted}
          />
        )
      })}
    </div>
  )
}

export { markdownClassName }
