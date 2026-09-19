import type { ReaderMarginMark, ReaderMarginMarkPosition } from "../reader-types"
import { resolveFoliateRenderedRange } from "./foliate-annotations"
import { toTopViewportDOMRect } from "./foliate-helpers"
import { surfaceSlotPosition } from "./use-margin-mark-positions"

type FoliateMarginView = Parameters<typeof resolveFoliateRenderedRange>[0]

const FOLIATE_MARGIN_GAP_PX = 14
const FOLIATE_SURFACE_EDGE_PX = 12

function firstLineRect(range: Range): DOMRect | undefined {
  return Array.from(range.getClientRects()).find((rect) => rect.width > 0 && rect.height > 0)
}

function blockElement(range: Range): Element | undefined {
  const node = range.startContainer
  const element = node instanceof Element ? node : node.parentElement
  const view = element?.ownerDocument.defaultView
  if (!view) return element ?? undefined
  let current: Element | null = element
  while (current) {
    const display = view.getComputedStyle(current).display
    if (display !== "inline" && display !== "contents") return current
    current = current.parentElement
  }
  return element ?? undefined
}

function columnRight(range: Range, line: DOMRect): number {
  const fragment = Array.from(blockElement(range)?.getClientRects() ?? []).find(
    (rect) => rect.left <= line.left + 1 && rect.right >= line.right - 1,
  )
  return fragment?.right ?? line.right
}

export async function measureFoliateMarginMarks(
  view: FoliateMarginView,
  marks: readonly ReaderMarginMark[],
  surface: HTMLElement,
): Promise<readonly ReaderMarginMarkPosition[]> {
  const bounds = surface.getBoundingClientRect()
  const positions = await Promise.all(
    marks.map(async (mark) => {
      if (mark.anchor.kind !== "cfi-text") return undefined
      const range = await resolveFoliateRenderedRange(view, mark.anchor.cfi)
      const line = range ? firstLineRect(range) : undefined
      if (!range || !line) return undefined
      const frameView = range.startContainer.ownerDocument?.defaultView ?? null
      const lineRect = toTopViewportDOMRect(line, frameView)
      if (lineRect.right <= bounds.left || lineRect.left >= bounds.right) return undefined
      const edge = toTopViewportDOMRect(
        new DOMRect(columnRight(range, line), line.top, 0, line.height),
        frameView,
      ).left
      return surfaceSlotPosition({
        id: mark.id,
        surface: bounds,
        line: lineRect,
        x: Math.min(edge + FOLIATE_MARGIN_GAP_PX, bounds.right - FOLIATE_SURFACE_EDGE_PX),
      })
    }),
  )
  return positions.filter((position) => position !== undefined)
}
