import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import DOMPurify from "dompurify"
import morphdom from "morphdom"
import "katex/dist/katex.min.css"
import { getServerConnection } from "@/context/server"
import { resolveAssetUrl } from "@/lib/resource-url"
import { parseMarkdownToHtml } from "./markdown-parser"

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
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
}

const markdownClassName = [
  "min-w-0 max-w-full break-words text-sm leading-[1.65] text-text-base",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_h1]:mt-6 [&_h1]:mb-2.5 [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:leading-[1.45] [&_h1]:text-text-base",
  "[&_h2]:mt-6 [&_h2]:mb-2.5 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:leading-[1.45] [&_h2]:text-text-base",
  "[&_h3]:mt-6 [&_h3]:mb-2.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:leading-[1.45] [&_h3]:text-text-base",
  "[&_h4]:mt-6 [&_h4]:mb-2.5 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:leading-[1.45] [&_h4]:text-text-base",
  "[&_h5]:mt-6 [&_h5]:mb-2.5 [&_h5]:text-sm [&_h5]:font-semibold [&_h5]:leading-[1.45] [&_h5]:text-text-base",
  "[&_h6]:mt-6 [&_h6]:mb-2.5 [&_h6]:text-sm [&_h6]:font-semibold [&_h6]:leading-[1.45] [&_h6]:text-text-base",
  "[&_strong]:font-semibold [&_strong]:text-text-base [&_b]:font-semibold [&_b]:text-text-base",
  "[&_p]:mb-4",
  "[&_a]:text-text-interactive-base [&_a]:no-underline [&_a:hover]:underline [&_a:hover]:underline-offset-2",
  "[&_ul]:mt-2 [&_ul]:mb-4 [&_ul]:list-outside [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:mt-2 [&_ol]:mb-4 [&_ol]:list-outside [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:mb-1.5 [&_li::marker]:text-text-weak",
  "[&_li>p:first-child]:m-0 [&_li>p:first-child]:inline",
  "[&_li>p+p]:mt-1.5 [&_li>p+p]:block",
  "[&_li>ul]:my-1 [&_li>ul]:pl-4 [&_li>ol]:my-1 [&_li>ol]:pl-4",
  "[&_blockquote]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-border-base [&_blockquote]:pl-2.5 [&_blockquote]:text-text-weak",
  "[&_hr]:my-8 [&_hr]:h-0 [&_hr]:border-0",
  "[&_pre]:my-4 [&_pre]:overflow-auto [&_pre]:[scrollbar-width:none] [&_pre::-webkit-scrollbar]:hidden",
  "[&_.shiki]:rounded-md [&_.shiki]:border [&_.shiki]:border-border-base [&_.shiki]:px-3 [&_.shiki]:py-2 [&_.shiki]:text-[13px]",
  "[&_code]:rounded-[4px] [&_code]:border [&_code]:border-border-base [&_code]:bg-[color-mix(in_oklab,var(--surface-weak)_70%,transparent)] [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.83em] [&_code]:text-text-base",
  "[&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit",
  "[&_table]:my-5 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-sm",
  "[&_th]:border-b [&_th]:border-border-base [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_th]:align-top [&_th]:font-semibold [&_th]:text-text-base",
  "[&_td]:border-b [&_td]:border-b-[color-mix(in_oklab,var(--border-base)_70%,transparent)] [&_td]:px-2 [&_td]:py-2 [&_td]:text-left [&_td]:align-top",
  "[&_img]:my-5 [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md",
  "[&_a.external-link:hover>code]:underline [&_a.external-link:hover>code]:underline-offset-2",
].join(" ")

type CopyLabels = {
  copy: string
  copied: string
}

type MarkdownCacheEntry = {
  source: string
  html: string
}

const MARKDOWN_CACHE_MAX = 200
const markdownCache = new Map<string, MarkdownCacheEntry>()

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

function createCopyButton(labels: CopyLabels) {
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute("data-slot", "markdown-copy-button")
  button.setAttribute("data-copied", "false")
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
  button.setAttribute("data-copied", copied ? "true" : "false")
  button.setAttribute("aria-label", copied ? labels.copied : labels.copy)
  button.setAttribute("title", copied ? labels.copied : labels.copy)

  const copyIcon = button.querySelector('[data-slot="copy-icon"]')
  const checkIcon = button.querySelector('[data-slot="check-icon"]')
  if (!(copyIcon instanceof HTMLElement) || !(checkIcon instanceof HTMLElement)) return

  if (copied) {
    copyIcon.style.display = "none"
    checkIcon.style.display = "inline-flex"
    return
  }

  copyIcon.style.display = "inline-flex"
  checkIcon.style.display = "none"
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
    const href = codeUrl(code.textContent ?? "")
    const parentLink =
      code.parentElement instanceof HTMLAnchorElement &&
      code.parentElement.classList.contains("external-link")
        ? code.parentElement
        : null

    if (!href) {
      if (parentLink) parentLink.replaceWith(code)
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

function decorateMarkdown(root: HTMLDivElement, labels: CopyLabels) {
  const blocks = Array.from(root.querySelectorAll("pre"))
  for (const block of blocks) {
    ensureCodeWrapper(block, labels)
  }
  markCodeLinks(root)
}

function setupCodeCopy(root: HTMLDivElement, labels: CopyLabels) {
  const timeouts = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>()
  const buttons = Array.from(root.querySelectorAll('[data-slot="markdown-copy-button"]')).filter(
    (button): button is HTMLButtonElement => button instanceof HTMLButtonElement,
  )

  for (const button of buttons) {
    const copied = button.getAttribute("data-copied") === "true"
    setCopyState(button, labels, copied)
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
    const existing = timeouts.get(button)
    if (existing) clearTimeout(existing)
    const timeout = setTimeout(() => setCopyState(button, labels, false), 2000)
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

function sanitize(html: string) {
  if (!DOMPurify.isSupported) return ""
  return DOMPurify.sanitize(html, sanitizeConfig)
}

export function sanitizeRawMarkdownFallback(text: string): string {
  const escaped = text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
  return sanitize(escaped.replace(/\r\n?/gu, "\n").replace(/\n/gu, "<br>"))
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

export function MarkdownHtmlSegment(props: {
  text: string
  cacheKey?: string
  className?: string
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const renderIdRef = useRef(0)
  const copyCleanupRef = useRef<(() => void) | undefined>(undefined)
  const copySetupTimerRef = useRef<number | undefined>(undefined)
  const copyLabels = useMemo<CopyLabels>(() => ({ copy: "Copy code", copied: "Copied" }), [])
  const sanitizeContextKey = markdownSanitizeContextKey()
  const fullCacheKey = useMemo(
    () => `${props.cacheKey ?? props.text}::${sanitizeContextKey}`,
    [props.cacheKey, props.text, sanitizeContextKey],
  )
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

    const renderId = renderIdRef.current + 1
    renderIdRef.current = renderId
    let cancelled = false

    void (async () => {
      let html: string
      try {
        html = sanitize(await parseMarkdownToHtml(props.text))
      } catch {
        html = sanitizeRawMarkdownFallback(props.text)
      }
      if (cancelled || renderIdRef.current !== renderId) return
      touchMarkdownCache(fullCacheKey, { source: props.text, html })

      const nextRoot = decoratedMarkdownRoot(html, copyLabels)
      if (!nextRoot) return

      morphdom(root, nextRoot, {
        childrenOnly: true,
      })
      resetCodeCopy()
      copySetupTimerRef.current = window.setTimeout(() => {
        if (cancelled || renderIdRef.current !== renderId || !root.isConnected) return
        copyCleanupRef.current = setupCodeCopy(root, copyLabels)
      }, 0)
    })()

    return () => {
      cancelled = true
      resetCodeCopy()
    }
  }, [copyLabels, fullCacheKey, props.text, resetCodeCopy])

  return <div ref={rootRef} className={props.className ?? markdownClassName} />
}

export { markdownClassName }
