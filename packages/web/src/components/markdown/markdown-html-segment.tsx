import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import DOMPurify from "dompurify"
import morphdom from "morphdom"
import "katex/dist/katex.min.css"
import { resolveFileTypeIconUrl } from "@/components/files/file-type-icon"
import {
  findPresentedMediaCandidateMatches,
  isLikelyPresentedMediaPathCandidate,
  normalizePresentedMediaCandidatePath,
  toWorkspaceFilePanelItem,
} from "@/lib/presented-media"
import { useWorkspaceFilePanelStore } from "@/state/workspace-file-panel-store"
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
  USE_PROFILES: { html: true, mathMl: true, svg: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
}

const markdownClassName = [
  "min-w-0 max-w-full break-words text-sm leading-[1.6] text-text-strong",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_h1]:mt-0 [&_h1]:mb-6 [&_h1]:text-sm [&_h1]:font-medium [&_h1]:leading-[1.667] [&_h1]:text-text-strong",
  "[&_h2]:mt-0 [&_h2]:mb-6 [&_h2]:text-sm [&_h2]:font-medium [&_h2]:leading-[1.667] [&_h2]:text-text-strong",
  "[&_h3]:mt-0 [&_h3]:mb-6 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:leading-[1.667] [&_h3]:text-text-strong",
  "[&_h4]:mt-0 [&_h4]:mb-6 [&_h4]:text-sm [&_h4]:font-medium [&_h4]:leading-[1.667] [&_h4]:text-text-strong",
  "[&_h5]:mt-0 [&_h5]:mb-6 [&_h5]:text-sm [&_h5]:font-medium [&_h5]:leading-[1.667] [&_h5]:text-text-strong",
  "[&_h6]:mt-0 [&_h6]:mb-6 [&_h6]:text-sm [&_h6]:font-medium [&_h6]:leading-[1.667] [&_h6]:text-text-strong",
  "[&_strong]:font-medium [&_strong]:text-text-strong [&_b]:font-medium [&_b]:text-text-strong",
  "[&_p]:mb-3",
  "[&_a]:text-text-interactive-base [&_a]:no-underline [&_a:hover]:underline [&_a:hover]:underline-offset-2",
  "[&_ul]:my-2 [&_ul]:mb-3 [&_ul]:ml-0 [&_ul]:list-outside [&_ul]:list-disc [&_ul]:pl-8",
  "[&_ol]:my-2 [&_ol]:mb-3 [&_ol]:ml-0 [&_ol]:list-outside [&_ol]:list-decimal [&_ol]:pl-9",
  "[&_li]:mb-2 [&_li::marker]:text-text-weak",
  "[&_li>p:first-child]:m-0 [&_li>p:first-child]:inline",
  "[&_li>p+p]:mt-2 [&_li>p+p]:block",
  "[&_li>ul]:my-1 [&_li>ul]:pl-4 [&_li>ol]:my-1 [&_li>ol]:pl-7",
  "[&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-border-weak-base [&_blockquote]:pl-2 [&_blockquote]:not-italic [&_blockquote]:text-text-weak",
  "[&_hr]:my-10 [&_hr]:h-0 [&_hr]:border-0",
  "[&_pre]:mt-3 [&_pre]:mb-8 [&_pre]:overflow-auto [&_pre]:[scrollbar-width:none] [&_pre::-webkit-scrollbar]:hidden",
  "[&_.shiki]:rounded [&_.shiki]:border [&_.shiki]:border-border-weak-base [&_.shiki]:p-3 [&_.shiki]:text-[13px]",
  "[&_code]:font-mono [&_code]:[font-feature-settings:var(--font-family-mono--font-feature-settings)] [&_code]:text-syntax-string [&_code]:font-medium",
  "[&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit",
  "[&_table]:my-6 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-sm",
  "[&_th]:border-b [&_th]:border-border-weak-base [&_th]:p-3 [&_th]:text-left [&_th]:align-top [&_th]:font-medium [&_th]:text-text-strong",
  "[&_td]:border-b [&_td]:border-border-weaker-base [&_td]:p-3 [&_td]:text-left [&_td]:align-top",
  "[&_img]:my-6 [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded",
  "[&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:[scrollbar-width:none] [&_.katex-display::-webkit-scrollbar]:hidden",
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
  icon.className = "pointer-events-none inline-flex h-4 w-3 shrink-0 items-center justify-center"

  const fileName = presentedMediaLinkLabel(path)
  const image = document.createElement("img")
  image.setAttribute("alt", "")
  image.setAttribute("aria-hidden", "true")
  image.setAttribute("src", resolveFileTypeIconUrl({ fileName }))
  image.className = "h-4 w-3 object-contain"
  icon.appendChild(image)
  return icon
}

function decoratePresentedMediaLink(link: HTMLAnchorElement, filePath: string) {
  link.href = filePath
  link.setAttribute("data-presented-media-path", filePath)
  link.className =
    "presented-media-link inline-flex items-center gap-1.5 align-baseline text-text-interactive-base no-underline hover:underline hover:underline-offset-2"
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
    existingLabel.textContent = label
  } else {
    const labelNode = document.createElement("span")
    labelNode.setAttribute("data-slot", "presented-media-label")
    labelNode.className = "min-w-0 truncate"
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

export function MarkdownHtmlSegment(props: {
  text: string
  cacheKey?: string
  className?: string
  directory?: string
  streaming?: boolean
  interrupted?: boolean
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const renderIdRef = useRef(0)
  const copyCleanupRef = useRef<(() => void) | undefined>(undefined)
  const copySetupTimerRef = useRef<number | undefined>(undefined)
  const copyLabels = useMemo<CopyLabels>(() => ({ copy: "Copy code", copied: "Copied" }), [])
  const queueFileOpen = useWorkspaceFilePanelStore((state) => state.queueFileOpen)
  const sanitizeContextKey = markdownSanitizeContextKey()
  const fullCacheKey = useMemo(
    () =>
      `${props.cacheKey ?? props.text}::${sanitizeContextKey}::${props.streaming ? "live" : "full"}::${props.interrupted ? "interrupted" : "active"}`,
    [props.cacheKey, props.text, sanitizeContextKey, props.streaming, props.interrupted],
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

      const panelItem = toWorkspaceFilePanelItem({
        id: "",
        inputPath: rawPath,
        absolutePath: "",
        displayPath: rawPath,
        workspacePath: rawPath,
        fileName: presentedMediaLinkLabel(rawPath),
        mediaKind: "other",
        renderMode: "file",
        mimeType: null,
        sizeBytes: null,
        modifiedAt: null,
        rawUrl: "",
        actionCapabilities: {
          canOpenDefaultApp: false,
          canRevealInFileManager: false,
          canOpenInWorkspacePanel: true,
        },
        availability: {
          status: "available",
          message: null,
        },
      })
      if (panelItem) {
        queueFileOpen(props.directory ?? "", panelItem, { autoOpen: true })
      }
    }

    root.addEventListener("click", handleClick)

    const renderId = renderIdRef.current + 1
    renderIdRef.current = renderId
    let cancelled = false

    void (async () => {
      let html: string
      try {
        html = sanitizeMarkdownHtml(
          await parseMarkdownToHtml(
            props.text,
            props.streaming,
            props.cacheKey,
          ),
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
    copyLabels,
    fullCacheKey,
    props.cacheKey,
    props.directory,
    props.interrupted,
    props.text,
    props.streaming,
    queueFileOpen,
    resetCodeCopy,
  ])

  return <div ref={rootRef} className={props.className ?? markdownClassName} />
}

export { markdownClassName }
