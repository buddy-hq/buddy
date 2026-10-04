import { useCallback, useEffect, useRef, type RefObject } from "react"
import type { ReaderNavigationItem } from "@/components/readers/reader-types"
import {
  findMarkdownBenchFragmentTarget,
  readMarkdownBenchHeadings,
  type MarkdownBenchHeading,
} from "./editor-fragments"

/** Live outline and reading position of a Markdown/MDX document. */
export type MarkdownBenchContentsState = {
  items: ReaderNavigationItem[]
  activeItemId: string | undefined
}

function navigationItems(headings: readonly MarkdownBenchHeading[]): ReaderNavigationItem[] {
  const items: ReaderNavigationItem[] = []
  const parents: { level: number; item: ReaderNavigationItem }[] = []
  for (const heading of headings) {
    while (parents.length > 0 && (parents.at(-1)?.level ?? 0) >= heading.level) parents.pop()
    const item: ReaderNavigationItem = { id: heading.id, label: heading.label, subitems: [] }
    const parent = parents.at(-1)
    if (parent) parent.item.subitems.push(item)
    else items.push(item)
    parents.push({ level: heading.level, item })
  }
  return items
}

function activeHeading(viewport: HTMLElement, headings: readonly MarkdownBenchHeading[]) {
  const threshold = viewport.getBoundingClientRect().top + 64
  let active = headings[0]
  for (const heading of headings) {
    if (heading.element.getBoundingClientRect().top > threshold) break
    active = heading
  }
  return active?.id
}

/** Keep Contents current and scroll only the document viewport when navigating. */
export function useMarkdownBenchContents(
  viewportRef: RefObject<HTMLElement | null>,
  active: boolean,
  onChange: ((contents: MarkdownBenchContentsState) => void) | undefined,
) {
  const headingsRef = useRef<readonly MarkdownBenchHeading[]>([])
  const contentsRef = useRef<MarkdownBenchContentsState>({ items: [], activeItemId: undefined })
  const refreshRef = useRef<(() => void) | undefined>(undefined)

  const publish = useCallback(
    (headings: readonly MarkdownBenchHeading[], activeItemId: string | undefined) => {
      const previous = headingsRef.current
      const unchanged =
        previous.length === headings.length &&
        previous.every((heading, index) => {
          const next = headings[index]
          return (
            next?.id === heading.id && next.label === heading.label && next.level === heading.level
          )
        })
      headingsRef.current = headings
      const items = unchanged ? contentsRef.current.items : navigationItems(headings)
      if (
        items === contentsRef.current.items &&
        activeItemId === contentsRef.current.activeItemId
      ) {
        return
      }
      contentsRef.current = { items, activeItemId }
      onChange?.(contentsRef.current)
    },
    [onChange],
  )

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !active || !onChange) return
    let frame = 0
    let headingsChanged = false
    const refresh = () => {
      frame = 0
      const headings = headingsChanged ? readMarkdownBenchHeadings(viewport) : headingsRef.current
      headingsChanged = false
      publish(headings, activeHeading(viewport, headings))
    }
    const schedule = (readHeadings: boolean) => {
      headingsChanged ||= readHeadings
      if (!frame) frame = window.requestAnimationFrame(refresh)
    }
    const onScroll = () => schedule(false)
    refreshRef.current = () => schedule(true)
    const mutations = new MutationObserver(() => schedule(true))
    mutations.observe(viewport, { childList: true, subtree: true, characterData: true })
    const resize = new ResizeObserver(() => schedule(false))
    resize.observe(viewport)
    const content = viewport.querySelector<HTMLElement>(".mdxeditor-root-contenteditable")
    if (content) resize.observe(content)
    viewport.addEventListener("scroll", onScroll, { passive: true })
    onChange(contentsRef.current)
    headingsChanged = true
    refresh()
    return () => {
      refreshRef.current = undefined
      mutations.disconnect()
      resize.disconnect()
      viewport.removeEventListener("scroll", onScroll)
      window.cancelAnimationFrame(frame)
    }
  }, [active, onChange, publish, viewportRef])

  const scrollToTarget = useCallback(
    (target: HTMLElement | undefined) => {
      const viewport = viewportRef.current
      if (!viewport || !target) return false
      viewport.scrollTo({
        top: Math.max(
          0,
          viewport.scrollTop +
            target.getBoundingClientRect().top -
            viewport.getBoundingClientRect().top -
            24,
        ),
        behavior: "instant",
      })
      const headings = readMarkdownBenchHeadings(viewport)
      publish(
        headings,
        headings.find((heading) => heading.element === target)?.id ??
          activeHeading(viewport, headings),
      )
      return true
    },
    [publish, viewportRef],
  )

  const scrollToFragment = useCallback(
    (fragment: string) => {
      const viewport = viewportRef.current
      return scrollToTarget(
        viewport ? findMarkdownBenchFragmentTarget(viewport, fragment) : undefined,
      )
    },
    [scrollToTarget, viewportRef],
  )

  const scrollToHeading = useCallback(
    (id: string) => {
      const viewport = viewportRef.current
      const heading = viewport
        ? readMarkdownBenchHeadings(viewport).find((heading) => heading.id === id)
        : undefined
      return scrollToTarget(heading?.element)
    },
    [scrollToTarget, viewportRef],
  )

  const refreshContents = useCallback(() => refreshRef.current?.(), [])
  return { scrollToFragment, scrollToHeading, refreshContents }
}
