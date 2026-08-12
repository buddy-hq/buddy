import type {
  FoliateAnnotationPayload,
  FoliateBook,
  FoliateNavigationTarget,
  FoliateResolvedNavigation,
} from "foliate-js/view.js"
import type { Overlayer } from "foliate-js/overlayer.js"
import { drawAnnotationRange } from "./foliate-drawing"
import { resolveCanonicalNavigationTarget } from "./foliate-helpers"

type FoliateAnnotationView = {
  book: FoliateBook
  renderer: {
    getContents: () => Array<{
      index?: number
      doc: Document
      overlayer?: Overlayer
    }>
    goTo: (target: unknown) => Promise<void>
  }
  resolveNavigation: (
    target: FoliateNavigationTarget,
  ) => FoliateResolvedNavigation | undefined | Promise<FoliateResolvedNavigation | undefined>
  getProgressOf: (
    index: number,
    range?: Range,
  ) => { tocItem?: { label: string } | null }
}

type FoliateAnnotationInfo = {
  index: number
  label: string
}

function isRange(value: Element | Range | null): value is Range {
  return value !== null && "startContainer" in value && "getClientRects" in value
}

function getRenderedContent(view: FoliateAnnotationView, index: number) {
  return view.renderer
    .getContents()
    .find((content) => content.index === index && content.overlayer !== undefined)
}

function getRenderedContents(
  view: FoliateAnnotationView,
  indices: number[],
): ReturnType<FoliateAnnotationView["renderer"]["getContents"]> {
  const uniqueIndices = new Set(indices)
  return view.renderer
    .getContents()
    .filter((content) => content.index !== undefined && uniqueIndices.has(content.index))
}

function resolveRange(
  anchor: ((doc: Document) => Element | Range | null) | undefined,
  doc: Document,
): Range | undefined {
  if (!anchor) return undefined
  const result = anchor(doc)
  return isRange(result) ? result : undefined
}

function normalizeAnnotationText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function resolveAnnotationContent(
  view: FoliateAnnotationView,
  indices: number[],
  canonicalIndex: number,
  anchor: ((doc: Document) => Element | Range | null) | undefined,
  annotationText: string | undefined,
) {
  const contents = getRenderedContents(view, indices)
  const expectedText = annotationText ? normalizeAnnotationText(annotationText) : undefined
  let fallback:
    | {
        content: (typeof contents)[number]
        range: Range
      }
    | undefined

  for (const content of contents) {
    if (!content.overlayer) continue
    const range = resolveRange(anchor, content.doc)
    if (!range) continue
    fallback ??= { content, range }
    if (
      content.index === canonicalIndex ||
      !expectedText ||
      normalizeAnnotationText(range.toString()) === expectedText
    ) {
      return { content, range }
    }
  }

  return expectedText ? undefined : fallback
}

function getAnnotationInfo(
  view: FoliateAnnotationView,
  index: number,
  range: Range | undefined,
): FoliateAnnotationInfo {
  return {
    index,
    label: view.getProgressOf(index, range).tocItem?.label ?? "",
  }
}

/**
 * Paint an annotation using the canonical filtered section index. Foliate's built-in
 * addAnnotation() can target the wrong renderer page when the EPUB spine contains a missing
 * manifest item because its CFI resolver indexes the unfiltered spine.
 */
export async function renderFoliateAnnotation(
  view: FoliateAnnotationView,
  annotation: FoliateAnnotationPayload,
  onlyIndex?: number,
): Promise<FoliateAnnotationInfo | undefined> {
  const resolved = await resolveCanonicalNavigationTarget(view, annotation.value)
  if (!resolved) return undefined
  if (
    onlyIndex !== undefined &&
    resolved.index !== onlyIndex &&
    resolved.nativeIndex !== onlyIndex
  ) {
    return getAnnotationInfo(view, resolved.index, undefined)
  }

  const rendered = resolveAnnotationContent(
    view,
    [onlyIndex ?? resolved.index, resolved.index, resolved.nativeIndex],
    resolved.index,
    resolved.anchor,
    annotation.text,
  )
  if (!rendered?.content.overlayer) return getAnnotationInfo(view, resolved.index, undefined)

  rendered.content.overlayer.remove(annotation.value)
  drawAnnotationRange(
    rendered.content.overlayer,
    annotation.value,
    rendered.range,
    annotation,
    rendered.content.doc,
  )
  return getAnnotationInfo(view, resolved.index, rendered.range)
}

export async function removeFoliateAnnotation(
  view: FoliateAnnotationView,
  annotation: FoliateAnnotationPayload,
): Promise<FoliateAnnotationInfo | undefined> {
  const resolved = await resolveCanonicalNavigationTarget(view, annotation.value)
  if (!resolved) return undefined

  for (const content of getRenderedContents(view, [resolved.index, resolved.nativeIndex])) {
    content.overlayer?.remove(annotation.value)
  }
  return getAnnotationInfo(view, resolved.index, undefined)
}

export async function revealFoliateAnnotation(
  view: FoliateAnnotationView,
  annotation: FoliateAnnotationPayload,
): Promise<Range | undefined> {
  const resolved = await resolveCanonicalNavigationTarget(view, annotation.value)
  if (!resolved) return undefined

  await view.renderer.goTo({ index: resolved.index, anchor: resolved.anchor })
  const content = getRenderedContent(view, resolved.index)
  return content ? resolveRange(resolved.anchor, content.doc) : undefined
}
