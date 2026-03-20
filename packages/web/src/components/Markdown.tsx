import { useEffect, useRef } from "react"
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
  const sanitizeContextKey = markdownSanitizeContextKey()

  useEffect(() => {
    let disposed = false

    const applyHtml = (html: string) => {
      const root = rootRef.current
      if (!root) return

      if (!html) {
        if (root.innerHTML) root.innerHTML = ""
        return
      }

      const temp = document.createElement("div")
      temp.innerHTML = html

      morphdom(root, temp, {
        childrenOnly: true,
        onBeforeElUpdated(fromEl, toEl) {
          if (fromEl.isEqualNode(toEl)) return false
          return true
        },
      })
    }

    const key = `${cacheKey ?? text}::${sanitizeContextKey}`
    const cached = markdownCache.get(key)
    if (cached && cached.source === text) {
      touchMarkdownCache(key, cached)
      applyHtml(cached.html)
      return () => {
        disposed = true
      }
    }

    (async () => {
      try {
        const rendered = await parseMarkdownToHtml(text)
        const safe = sanitize(rendered)
        if (disposed) return
        touchMarkdownCache(key, {
          source: text,
          html: safe,
        })
        applyHtml(safe)
      } catch {
        const safe = sanitize(text)
        if (disposed) return
        touchMarkdownCache(key, {
          source: text,
          html: safe,
        })
        applyHtml(safe)
      }
    })()

    return () => {
      disposed = true
    }
  }, [cacheKey, sanitizeContextKey, text])

  return <div data-component="markdown" className={[markdownClassName, className].filter(Boolean).join(" ")} ref={rootRef} />
}
