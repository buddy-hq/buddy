import { ipcRenderer, type IpcRendererEvent } from "electron"
import { CITATION_MAX_EXCERPT_LENGTH, type CitationTextSelector } from "@buddy/citation-contract"
import {
  captureTrimmedRenderedTextSelection,
  resolveRenderedTextRange,
} from "@buddy/citation-contract/rendered-text"
import {
  observeSelectionActions,
  type SelectionActionPoint,
} from "@buddy/citation-contract/selection-actions"
import {
  IN_APP_BROWSER_CITATION_COMMAND_CHANNEL,
  IN_APP_BROWSER_CITATION_MARK_CHANNEL,
  IN_APP_BROWSER_CITATION_MARK_HIGHLIGHT,
  IN_APP_BROWSER_CITATION_REPLY_CHANNEL,
  IN_APP_BROWSER_CITATION_REVEAL_HIGHLIGHT,
  IN_APP_BROWSER_CITATION_REVEAL_WAIT_MS,
  IN_APP_BROWSER_CITATION_SELECTION_CHANNEL,
  type InAppBrowserGuestCitationCommand,
  type InAppBrowserGuestCitationRequest,
} from "../shared/in-app-browser-citation-protocol"

const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable]"
const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6"
const HEADING_EXCLUDED_SELECTOR = "nav, aside, footer, [hidden], [aria-hidden=true]"
const HEADING_PATH_MAX_DEPTH = 6
const HEADING_LABEL_MAX_LENGTH = 200
const REVEAL_HIGHLIGHT_DURATION_MS = 2_400
const REVEAL_RETRY_INTERVAL_MS = 500

type GuestRect = { x: number; y: number; width: number; height: number }

type ActiveMark = {
  range: Range
  excerpt: string
  selector: CitationTextSelector
  reportedRect: GuestRect | undefined
}

type LocateCommand = { readonly excerpt: string; readonly selector: CitationTextSelector }

type GuestCitationResult = NonNullable<ReturnType<typeof captureSelection>> | boolean | null

const marks = new Map<string, ActiveMark>()
let markFrame: number | undefined
let markObserver: MutationObserver | undefined
let selectionReported = false

function highlightRegistry(): HighlightRegistry | undefined {
  return "highlights" in CSS ? CSS.highlights : undefined
}

function lastLineRect(range: Range): DOMRect | undefined {
  const rects = range.getClientRects()
  for (let index = rects.length - 1; index >= 0; index -= 1) {
    const rect = rects.item(index)
    if (rect && rect.width > 0 && rect.height > 0) return rect
  }
  return undefined
}

function guestRect(rect: DOMRect): GuestRect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

function sameGuestRect(left: GuestRect | undefined, right: GuestRect): boolean {
  return (
    left !== undefined &&
    Math.round(left.x) === Math.round(right.x) &&
    Math.round(left.y) === Math.round(right.y) &&
    Math.round(left.width) === Math.round(right.width) &&
    Math.round(left.height) === Math.round(right.height)
  )
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/gu, " ").trim()
}

function readableExcerpt(rendered: string, raw: string): string {
  const collapsed = collapseWhitespace(raw)
  if (collapseWhitespace(rendered) !== collapsed) return collapsed
  const readable = rendered
    .trim()
    .replace(/[^\S\n]*\n[^\S\n]*/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
  return readable.length <= CITATION_MAX_EXCERPT_LENGTH ? readable : collapsed
}

function isEditableSelection(selection: Selection): boolean {
  const node = selection.anchorNode
  const element = node instanceof Element ? node : node?.parentElement
  return element?.closest(EDITABLE_SELECTOR) != null
}

function citableSelection(): Selection | undefined {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return undefined
  return isEditableSelection(selection) ? undefined : selection
}

function selectionActionPoint(
  pointer: SelectionActionPoint | null,
): SelectionActionPoint | undefined {
  const selection = citableSelection()
  if (!selection) return undefined
  const text = selection.toString()
  if (text.trim().length === 0 || text.length > CITATION_MAX_EXCERPT_LENGTH) return undefined
  if (pointer) return pointer
  const rect = lastLineRect(selection.getRangeAt(0))
  return rect ? { x: rect.right, y: rect.bottom } : undefined
}

function headingPathBefore(root: HTMLElement, range: Range): string[] | undefined {
  const path: { level: number; label: string }[] = []
  for (const heading of root.querySelectorAll(HEADING_SELECTOR)) {
    if (heading.closest(HEADING_EXCLUDED_SELECTOR)) continue
    if (range.comparePoint(heading, 0) >= 0) break
    const label = collapseWhitespace(heading.textContent ?? "").slice(0, HEADING_LABEL_MAX_LENGTH)
    if (!label) continue
    const level = Number(heading.tagName.slice(1))
    while ((path.at(-1)?.level ?? 0) >= level) path.pop()
    path.push({ level, label })
  }
  if (path.length === 0) return undefined
  return path.slice(-HEADING_PATH_MAX_DEPTH).map((entry) => entry.label)
}

function captureSelection() {
  const root = document.body
  const selection = citableSelection()
  if (!root || !selection) return null
  const captured = captureTrimmedRenderedTextSelection(root, selection)
  if (!captured) return null
  const rect = lastLineRect(captured.range) ?? captured.range.getBoundingClientRect()
  const headingPath = headingPathBefore(root, captured.range)
  return Object.assign(
    {
      excerpt: readableExcerpt(selection.toString(), captured.excerpt),
      selector: captured.selector,
      rect: guestRect(rect),
    },
    headingPath ? { headingPath } : undefined,
  )
}

function locateCitation(command: LocateCommand): Range | undefined {
  const root = document.body
  return root ? resolveRenderedTextRange(root, command.excerpt, command.selector) : undefined
}

function markRangeIntact(range: Range): boolean {
  return !range.collapsed && range.startContainer.isConnected && range.endContainer.isConnected
}

function sendMarkRect(markID: string, rect: GuestRect | null) {
  ipcRenderer.send(IN_APP_BROWSER_CITATION_MARK_CHANNEL, { markID, rect })
}

function replaceMarkRange(mark: ActiveMark, range: Range) {
  const highlight = highlightRegistry()?.get(IN_APP_BROWSER_CITATION_MARK_HIGHLIGHT)
  highlight?.delete(mark.range)
  mark.range = range
  highlight?.add(range)
}

function reportMark(markID: string, mark: ActiveMark) {
  if (!markRangeIntact(mark.range)) {
    const repaired = locateCitation(mark)
    if (!repaired) {
      unmarkCitation(markID)
      sendMarkRect(markID, null)
      return
    }
    replaceMarkRange(mark, repaired)
  }
  const lineRect = lastLineRect(mark.range)
  if (!lineRect) return
  const rect = guestRect(lineRect)
  if (sameGuestRect(mark.reportedRect, rect)) return
  mark.reportedRect = rect
  sendMarkRect(markID, rect)
}

function reportMarks() {
  markFrame = undefined
  for (const [markID, mark] of marks) reportMark(markID, mark)
}

function scheduleMarkReport() {
  markFrame ??= window.requestAnimationFrame(reportMarks)
}

function watchMarks() {
  if (markObserver) return
  window.addEventListener("scroll", scheduleMarkReport, true)
  window.addEventListener("resize", scheduleMarkReport)
  markObserver = new MutationObserver(scheduleMarkReport)
  markObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  })
}

function stopWatchingMarks() {
  window.removeEventListener("scroll", scheduleMarkReport, true)
  window.removeEventListener("resize", scheduleMarkReport)
  markObserver?.disconnect()
  markObserver = undefined
  if (markFrame !== undefined) window.cancelAnimationFrame(markFrame)
  markFrame = undefined
}

function markCitation(command: LocateCommand & { readonly markID: string }): boolean {
  const range = locateCitation(command)
  if (!range) return false
  unmarkCitation(command.markID)
  const registry = highlightRegistry()
  if (registry) {
    const highlight = registry.get(IN_APP_BROWSER_CITATION_MARK_HIGHLIGHT) ?? new Highlight()
    highlight.add(range)
    registry.set(IN_APP_BROWSER_CITATION_MARK_HIGHLIGHT, highlight)
  }
  const mark: ActiveMark = {
    range,
    excerpt: command.excerpt,
    selector: command.selector,
    reportedRect: undefined,
  }
  marks.set(command.markID, mark)
  watchMarks()
  reportMark(command.markID, mark)
  return true
}

function unmarkCitation(markID: string) {
  const mark = marks.get(markID)
  if (!mark) return
  marks.delete(markID)
  const registry = highlightRegistry()
  const highlight = registry?.get(IN_APP_BROWSER_CITATION_MARK_HIGHLIGHT)
  highlight?.delete(mark.range)
  if (highlight?.size === 0) registry?.delete(IN_APP_BROWSER_CITATION_MARK_HIGHLIGHT)
  if (marks.size === 0) stopWatchingMarks()
}

function flashRange(range: Range) {
  range.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" })
  const registry = highlightRegistry()
  if (!registry) {
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    return
  }
  const highlight = new Highlight(range)
  registry.set(IN_APP_BROWSER_CITATION_REVEAL_HIGHLIGHT, highlight)
  window.setTimeout(() => {
    if (registry.get(IN_APP_BROWSER_CITATION_REVEAL_HIGHLIGHT) === highlight) {
      registry.delete(IN_APP_BROWSER_CITATION_REVEAL_HIGHLIGHT)
    }
  }, REVEAL_HIGHLIGHT_DURATION_MS)
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function revealCitation(command: LocateCommand): Promise<boolean> {
  const deadline = Date.now() + IN_APP_BROWSER_CITATION_REVEAL_WAIT_MS
  let range = locateCitation(command)
  while (!range && Date.now() < deadline) {
    await wait(REVEAL_RETRY_INTERVAL_MS)
    range = locateCitation(command)
  }
  if (!range) return false
  flashRange(range)
  return true
}

async function runCommand(command: InAppBrowserGuestCitationCommand): Promise<GuestCitationResult> {
  if (command.type === "capture") return captureSelection()
  if (command.type === "mark") return markCitation(command)
  if (command.type === "unmark") {
    unmarkCitation(command.markID)
    return true
  }
  return revealCitation(command)
}

function handleCommand(_event: IpcRendererEvent, request: InAppBrowserGuestCitationRequest) {
  const reply = (result: GuestCitationResult) =>
    ipcRenderer.send(IN_APP_BROWSER_CITATION_REPLY_CHANNEL, {
      requestID: request.requestID,
      result,
    })
  void runCommand(request.command).then(reply, () => reply(null))
}

function reportSelection(point: SelectionActionPoint) {
  selectionReported = true
  ipcRenderer.send(IN_APP_BROWSER_CITATION_SELECTION_CHANNEL, point)
}

function clearSelection() {
  if (!selectionReported) return
  selectionReported = false
  ipcRenderer.send(IN_APP_BROWSER_CITATION_SELECTION_CHANNEL, null)
}

function observePageSelections() {
  observeSelectionActions({
    element: document.documentElement,
    scrollTarget: window,
    dismissOnBlur: false,
    onSelection: (pointer) => {
      const point = selectionActionPoint(pointer)
      if (point) reportSelection(point)
      else clearSelection()
    },
    onDismiss: clearSelection,
  })
}

export function installInAppBrowserCitations() {
  ipcRenderer.on(IN_APP_BROWSER_CITATION_COMMAND_CHANNEL, handleCommand)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observePageSelections, { once: true })
    return
  }
  observePageSelections()
}
