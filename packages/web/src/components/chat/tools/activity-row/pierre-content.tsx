import { useEffect, useRef, useState, type ReactNode } from "react"

import { registerCustomTheme } from "@pierre/diffs"
import { File, FileDiff } from "@pierre/diffs/react"
import { cn } from "@buddy/ui"

import { openCodeTheme } from "@/components/markdown/markdown-parser"

import "./pierre-content.css"
import { PIERRE_CONTENT_OPTIONS, PIERRE_DIFF_OPTIONS } from "./pierre-config"
import type { PierreViewDiff } from "./pierre-diff"

registerCustomTheme("OpenCode", () => Promise.resolve(openCodeTheme))

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

function checksum(content: string): string | undefined {
  if (!content) return undefined

  let hash = FNV_OFFSET_BASIS
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return (hash >>> 0).toString(36)
}

function DeferredContent({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return visible ? children : null
}

function PierreViewerShell({
  children,
  embedded = false,
}: {
  children: ReactNode
  embedded?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const syncColorScheme = () => {
      const host = ref.current?.querySelector("diffs-container")
      if (!(host instanceof HTMLElement)) return

      const scheme = document.documentElement.dataset.colorScheme
      if (scheme === "dark" || scheme === "light") {
        host.dataset.colorScheme = scheme
      } else {
        host.removeAttribute("data-color-scheme")
      }
    }

    syncColorScheme()
    const observer = new MutationObserver(syncColorScheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-color-scheme"],
    })
    if (ref.current) observer.observe(ref.current, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn("pierre-content-viewer", embedded && "pierre-content-viewer--embedded")}
    >
      {children}
    </div>
  )
}

export function PierreContentCode({ code, filePath }: { code: string; filePath: string }) {
  return (
    <PierreViewerShell>
      <DeferredContent>
        <File
          file={{ name: filePath, contents: code, cacheKey: checksum(code) }}
          options={PIERRE_CONTENT_OPTIONS}
        />
      </DeferredContent>
    </PierreViewerShell>
  )
}

export function PierreContentDiff({
  view,
  embedded = false,
}: {
  view: PierreViewDiff
  embedded?: boolean
}) {
  return (
    <PierreViewerShell embedded={embedded}>
      <DeferredContent>
        <FileDiff
          fileDiff={view.fileDiff}
          options={{
            ...PIERRE_DIFF_OPTIONS,
            hunkSeparators: view.fileDiff.isPartial ? "simple" : "line-info-basic",
          }}
        />
      </DeferredContent>
    </PierreViewerShell>
  )
}
