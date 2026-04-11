import type { FoliateDrawAnnotationEventDetail } from "foliate-js/view.js"
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

export function drawAnnotation(event: CustomEvent<FoliateDrawAnnotationEventDetail>) {
  const annotation = event.detail.annotation
  const color =
    typeof annotation.color === "string" ? annotation.color : ANNOTATION_COLORS.amber.value
  const style =
    annotation.style === ANNOTATION_STYLE_UNDERLINE ||
    annotation.style === ANNOTATION_STYLE_SQUIGGLY ||
    annotation.style === ANNOTATION_STYLE_STRIKETHROUGH
      ? annotation.style
      : ANNOTATION_STYLE_HIGHLIGHT
  const writingMode = event.detail.doc.defaultView?.getComputedStyle(
    event.detail.range.startContainer.parentElement ?? event.detail.doc.body,
  ).writingMode

  if (style === ANNOTATION_STYLE_HIGHLIGHT) {
    event.detail.draw((rects) => drawHighlight(rects, color))
    return
  }

  event.detail.draw((rects) => drawLinearMark(rects, color, writingMode ?? "", style))
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
