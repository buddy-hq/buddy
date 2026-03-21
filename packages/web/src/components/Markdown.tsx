import { useEffect, useRef, useLayoutEffect, useMemo } from "react"
import DOMPurify from "dompurify"
import morphdom from "morphdom"
import "katex/dist/katex.min.css"
import { getServerConnection } from "../context/server"
import { resolveApiUrl } from "../lib/api-client"
import { parseMarkdownToHtml } from "../lib/markdown-parser"

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
      node.setAttribute("src", resolveApiUrl(src))
    }
  })
}

const sanitizeConfig = {
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
}

type MarkdownCacheEntry = {
  source: string
  html: string
}

const MARKDOWN_CACHE_MAX = 200
const markdownCache = new Map<string, MarkdownCacheEntry>()

const markdownClassName = [
  "min-w-0 max-w-full break-words text-sm leading-[1.65] text-foreground",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_h1]:mt-6 [&_h1]:mb-2.5 [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:leading-[1.45] [&_h1]:text-foreground",
  "[&_h2]:mt-6 [&_h2]:mb-2.5 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:leading-[1.45] [&_h2]:text-foreground",
  "[&_h3]:mt-6 [&_h3]:mb-2.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:leading-[1.45] [&_h3]:text-foreground",
  "[&_h4]:mt-6 [&_h4]:mb-2.5 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:leading-[1.45] [&_h4]:text-foreground",
  "[&_h5]:mt-6 [&_h5]:mb-2.5 [&_h5]:text-sm [&_h5]:font-semibold [&_h5]:leading-[1.45] [&_h5]:text-foreground",
  "[&_h6]:mt-6 [&_h6]:mb-2.5 [&_h6]:text-sm [&_h6]:font-semibold [&_h6]:leading-[1.45] [&_h6]:text-foreground",
  "[&_strong]:font-semibold [&_strong]:text-foreground [&_b]:font-semibold [&_b]:text-foreground",
  "[&_p]:mb-4",
  "[&_a]:text-primary [&_a]:no-underline [&_a:hover]:underline [&_a:hover]:underline-offset-2",
  "[&_ul]:mt-2 [&_ul]:mb-4 [&_ul]:list-outside [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:mt-2 [&_ol]:mb-4 [&_ol]:list-outside [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:mb-1.5 [&_li::marker]:text-muted-foreground",
  "[&_li>p:first-child]:m-0 [&_li>p:first-child]:inline",
  "[&_li>p+p]:mt-1.5 [&_li>p+p]:block",
  "[&_li>ul]:my-1 [&_li>ul]:pl-4 [&_li>ol]:my-1 [&_li>ol]:pl-4",
  "[&_blockquote]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-2.5 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-8 [&_hr]:h-0 [&_hr]:border-0",
  "[&_pre]:my-4 [&_pre]:overflow-auto [&_pre]:[scrollbar-width:none] [&_pre::-webkit-scrollbar]:hidden",
  "[&_.shiki]:rounded-md [&_.shiki]:border [&_.shiki]:border-border [&_.shiki]:px-3 [&_.shiki]:py-2 [&_.shiki]:text-[13px]",
  "[&_code]:rounded-[4px] [&_code]:border [&_code]:border-border [&_code]:bg-[color-mix(in_oklab,var(--muted)_70%,transparent)] [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.83em] [&_code]:text-foreground",
  "[&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit",
  "[&_table]:my-5 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-sm",
  "[&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_th]:align-top [&_th]:font-semibold [&_th]:text-foreground",
  "[&_td]:border-b [&_td]:border-b-[color-mix(in_oklab,var(--border)_70%,transparent)] [&_td]:px-2 [&_td]:py-2 [&_td]:text-left [&_td]:align-top",
  "[&_img]:my-5 [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md",
  "[&_a.external-link:hover>code]:underline [&_a.external-link:hover>code]:underline-offset-2",
].join(" ")

type CopyLabels = {
  copy: string
  copied: string
}

const codeUrlPattern = /^https?:\/\/[^\s<>()`"']+$/u

function codeUrl(text: string) {
  const href = text.trim().replace(/[),.;!?]+$/g, "")
  if (!codeUrlPattern.test(href)) return
  try {
    const url = new URL(href)
    return url.toString()
  } catch {
    return
  }
}

function createCopyButton(labels: CopyLabels) {
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute("data-slot", "markdown-copy-button")
  button.setAttribute("data-copied", "false")
  button.setAttribute("aria-label", labels.copy)
  button.className =
    "mt-2 inline-flex h-6 items-center rounded border border-border bg-background px-2 text-xs text-muted-foreground hover:text-foreground"
  button.textContent = labels.copy
  return button
}

function setCopyState(button: HTMLButtonElement, labels: CopyLabels, copied: boolean) {
  button.setAttribute("data-copied", copied ? "true" : "false")
  button.setAttribute("aria-label", copied ? labels.copied : labels.copy)
  button.textContent = copied ? labels.copied : labels.copy
}

function ensureCodeWrapper(block: HTMLPreElement, labels: CopyLabels) {
  const parent = block.parentElement
  if (!parent) return
  const wrapped = parent.getAttribute("data-component") === "markdown-code"
  if (!wrapped) {
    const wrapper = document.createElement("div")
    wrapper.setAttribute("data-component", "markdown-code")
    parent.replaceChild(wrapper, block)
    wrapper.appendChild(block)
    wrapper.appendChild(createCopyButton(labels))
    return
  }

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
    if (!content) return
    const clipboard = navigator?.clipboard
    if (!clipboard) return

    await clipboard.writeText(content)
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

export function Markdown({
  text,
  className,
  cacheKey,
}: {
  text: string
  className?: string
  cacheKey?: string
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const renderIdRef = useRef(0)
  const copyCleanupRef = useRef<(() => void) | undefined>(undefined)
  const copySetupTimerRef = useRef<number | undefined>(undefined)
  const copyLabels = useMemo<CopyLabels>(() => ({ copy: "Copy code", copied: "Copied" }), [])
  const sanitizeContextKey = markdownSanitizeContextKey()

  // Compute cache key synchronously
  const fullCacheKey = useMemo(
    () => `${cacheKey ?? text}::${sanitizeContextKey}`,
    [cacheKey, sanitizeContextKey, text],
  )

  // Check cache synchronously - if we have a hit, we can render immediately
  const cachedEntry = useMemo(() => {
    const cached = markdownCache.get(fullCacheKey)
    if (cached && cached.source === text) {
      touchMarkdownCache(fullCacheKey, cached)
      return cached
    }
    return null
  }, [fullCacheKey, text])

  const resetCodeCopy = () => {
    if (copySetupTimerRef.current !== undefined) {
      window.clearTimeout(copySetupTimerRef.current)
      copySetupTimerRef.current = undefined
    }
    if (copyCleanupRef.current) {
      copyCleanupRef.current()
      copyCleanupRef.current = undefined
    }
  }

  const scheduleCodeCopy = () => {
    if (copySetupTimerRef.current !== undefined) {
      window.clearTimeout(copySetupTimerRef.current)
      copySetupTimerRef.current = undefined
    }

    copySetupTimerRef.current = window.setTimeout(() => {
      copySetupTimerRef.current = undefined
      if (copyCleanupRef.current) {
        copyCleanupRef.current()
        copyCleanupRef.current = undefined
      }
      const root = rootRef.current
      if (!root) return
      copyCleanupRef.current = setupCodeCopy(root, copyLabels)
    }, 150)
  }

  const applyHtml = (html: string) => {
    const root = rootRef.current
    if (!root) return

    if (!html) {
      if (root.innerHTML) root.innerHTML = ""
      resetCodeCopy()
      return
    }

    const temp = document.createElement("div")
    temp.innerHTML = html
    decorateMarkdown(temp, copyLabels)

    morphdom(root, temp, {
      childrenOnly: true,
      onBeforeElUpdated(fromEl, toEl) {
        if (fromEl.isEqualNode(toEl)) return false
        return true
      },
    })

    scheduleCodeCopy()
  }

  useLayoutEffect(() => {
    // If we have cached HTML, apply it synchronously during layout phase
    if (cachedEntry) {
      applyHtml(cachedEntry.html)
    }
  }, [cachedEntry])

  useEffect(() => {
    // Skip async work if we already rendered from cache
    if (cachedEntry) return

    // Increment render ID to track stale async operations
    const currentRenderId = ++renderIdRef.current

    const applyIfCurrent = (html: string) => {
      // Guard against stale async resolves
      if (currentRenderId !== renderIdRef.current) return
      applyHtml(html)
    }

    // Double-check cache in case it was populated between render and effect
    const cached = markdownCache.get(fullCacheKey)
    if (cached && cached.source === text) {
      touchMarkdownCache(fullCacheKey, cached)
      applyIfCurrent(cached.html)
      return
    }

    // Async markdown parsing
    let cancelled = false

    ;(async () => {
      try {
        const rendered = await parseMarkdownToHtml(text)
        if (cancelled) return

        const safe = sanitize(rendered)
        if (cancelled) return

        touchMarkdownCache(fullCacheKey, {
          source: text,
          html: safe,
        })
        applyIfCurrent(safe)
      } catch {
        if (cancelled) return

        const safe = sanitize(text)
        if (cancelled) return

        touchMarkdownCache(fullCacheKey, {
          source: text,
          html: safe,
        })
        applyIfCurrent(safe)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [cachedEntry, fullCacheKey, text])

  useEffect(() => {
    return () => {
      resetCodeCopy()
    }
  }, [])

  return (
    <div
      data-component="markdown"
      className={[markdownClassName, className].filter(Boolean).join(" ")}
      ref={rootRef}
    />
  )
}
