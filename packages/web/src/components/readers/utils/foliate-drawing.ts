import type { Overlayer } from "foliate-js/overlayer.js"
import type {
  FoliateAnnotationPayload,
  FoliateDrawAnnotationEventDetail,
} from "foliate-js/view.js"
import {
  ANNOTATION_COLORS,
  ANNOTATION_STYLE_HIGHLIGHT,
  ANNOTATION_STYLE_STRIKETHROUGH,
  ANNOTATION_STYLE_SQUIGGLY,
  ANNOTATION_STYLE_UNDERLINE,
} from "../foliate-reader-constants"
import type { ReaderAnnotation, ReaderAnnotationColorId } from "../foliate-reader-types"
import { getAnnotationColorId, getAnnotationStyle } from "./foliate-helpers"

export function createSvgElement(tag: string) {
  return document.createElementNS("http://www.w3.org/2000/svg", tag)
}

export function addNoteMarker(group: SVGElement, rects: DOMRectList, color: string) {
  const firstRect = Array.from(rects)[0]
  if (!firstRect) return group

  const radius = Math.max(6, Math.min(8, firstRect.height * 0.32))
  const centerX = Math.min(
    firstRect.right - radius - 2,
    firstRect.left + Math.max(radius + 2, firstRect.width * 0.12),
  )
  const centerY = Math.min(
    firstRect.bottom - radius - 2,
    firstRect.top + Math.max(radius + 2, firstRect.height * 0.34),
  )

  const badge = createSvgElement("circle")
  badge.setAttribute("cx", `${centerX}`)
  badge.setAttribute("cy", `${centerY}`)
  badge.setAttribute("r", `${radius}`)
  badge.setAttribute("fill", color)
  badge.setAttribute("stroke", "rgba(255,255,255,0.92)")
  badge.setAttribute("stroke-width", "1.5")
  group.append(badge)

  const dot = createSvgElement("circle")
  dot.setAttribute("cx", `${centerX}`)
  dot.setAttribute("cy", `${centerY}`)
  dot.setAttribute("r", `${Math.max(2, radius * 0.24)}`)
  dot.setAttribute("fill", "rgba(255,255,255,0.96)")
  group.append(dot)

  return group
}

export function drawHighlight(rects: DOMRectList, color: string) {
  const group = createSvgElement("g")
  group.setAttribute("fill", color)
  group.style.opacity = "0.26"
  for (const rect of Array.from(rects)) {
    const node = createSvgElement("rect")
    node.setAttribute("x", `${rect.left}`)
    node.setAttribute("y", `${rect.top}`)
    node.setAttribute("height", `${rect.height}`)
    node.setAttribute("width", `${rect.width}`)
    group.append(node)
  }
  return group
}

export function drawLinearMark(
  rects: DOMRectList,
  color: string,
  writingMode: string,
  kind: "underline" | "strikethrough" | "squiggly",
) {
  const vertical = writingMode === "vertical-rl" || writingMode === "vertical-lr"
  if (kind === "squiggly") {
    const group = createSvgElement("g")
    group.setAttribute("fill", "none")
    group.setAttribute("stroke", color)
    group.setAttribute("stroke-width", "2")
    for (const rect of Array.from(rects)) {
      const path = createSvgElement("path")
      if (vertical) {
        const blocks = Math.max(3, Math.round(rect.height / 6))
        const segment = rect.height / blocks
        const commands = Array.from(
          { length: blocks },
          (_, index) => `l${index % 2 === 0 ? 3 : -3} ${segment}`,
        ).join("")
        path.setAttribute("d", `M${rect.right} ${rect.top}${commands}`)
      } else {
        const blocks = Math.max(3, Math.round(rect.width / 6))
        const segment = rect.width / blocks
        const commands = Array.from(
          { length: blocks },
          (_, index) => `l${segment} ${index % 2 === 0 ? -3 : 3}`,
        ).join("")
        path.setAttribute("d", `M${rect.left} ${rect.bottom}${commands}`)
      }
      group.append(path)
    }
    return group
  }

  const group = createSvgElement("g")
  group.setAttribute("fill", color)
  for (const rect of Array.from(rects)) {
    const node = createSvgElement("rect")
    if (vertical) {
      node.setAttribute(
        "x",
        `${kind === "underline" ? rect.right - 2 : (rect.left + rect.right) / 2}`,
      )
      node.setAttribute("y", `${rect.top}`)
      node.setAttribute("width", "2")
      node.setAttribute("height", `${rect.height}`)
    } else {
      node.setAttribute("x", `${rect.left}`)
      node.setAttribute(
        "y",
        `${kind === "underline" ? rect.bottom - 2 : (rect.top + rect.bottom) / 2}`,
      )
      node.setAttribute("width", `${rect.width}`)
      node.setAttribute("height", "2")
    }
    group.append(node)
  }
  return group
}

function drawAnnotationDetail(detail: FoliateDrawAnnotationEventDetail) {
  const annotation = detail.annotation
  const color =
    typeof annotation.color === "string" ? annotation.color : ANNOTATION_COLORS.amber.value
  const style =
    annotation.style === ANNOTATION_STYLE_UNDERLINE ||
    annotation.style === ANNOTATION_STYLE_SQUIGGLY ||
    annotation.style === ANNOTATION_STYLE_STRIKETHROUGH
      ? annotation.style
      : ANNOTATION_STYLE_HIGHLIGHT
  const writingMode = detail.doc.defaultView?.getComputedStyle(
    detail.range.startContainer.parentElement ?? detail.doc.body,
  ).writingMode
  const hasNote = typeof annotation.note === "string" && annotation.note.trim().length > 0

  if (style === ANNOTATION_STYLE_HIGHLIGHT) {
    detail.draw((rects) => {
      const group = drawHighlight(rects, color)
      if (hasNote) addNoteMarker(group, rects, color)
      return group
    })
    return
  }

  detail.draw((rects) => {
    const group = drawLinearMark(rects, color, writingMode ?? "", style)
    if (hasNote) addNoteMarker(group, rects, color)
    return group
  })
}

export function drawAnnotation(event: CustomEvent<FoliateDrawAnnotationEventDetail>) {
  drawAnnotationDetail(event.detail)
}

export function drawAnnotationRange(
  overlayer: Overlayer,
  value: string,
  range: Range,
  annotation: FoliateAnnotationPayload,
  doc: Document,
) {
  drawAnnotationDetail({
    annotation,
    doc,
    range,
    draw: (painter, options) => overlayer.add(value, range, painter, options),
  })
}

export function toAnnotationDialogState(annotation?: ReaderAnnotation): {
  mode: "create" | "edit"
  value: string
  text: string
  note: string
  style: ReturnType<typeof getAnnotationStyle>
  color: ReaderAnnotationColorId
} {
  return {
    mode: annotation ? "edit" : "create",
    value: annotation?.value ?? "",
    text: annotation?.text ?? "",
    note: annotation?.note ?? "",
    style: annotation ? getAnnotationStyle(annotation) : ANNOTATION_STYLE_HIGHLIGHT,
    color: getAnnotationColorId(annotation?.color),
  }
}
