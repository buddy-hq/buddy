import type {
  InAppBrowserCitationMessage,
  InAppBrowserCitationPoint,
  InAppBrowserCitationRect,
} from "@buddy/browser-contract"
import {
  CITATION_MAX_EXCERPT_LENGTH,
  readCitationTextSelector,
  type CitationTextSelector,
} from "@buddy/citation-contract"
import { z } from "zod"
import {
  IN_APP_BROWSER_CITATION_MARK_CHANNEL,
  IN_APP_BROWSER_CITATION_REPLY_CHANNEL,
  IN_APP_BROWSER_CITATION_REVEAL_WAIT_MS,
  IN_APP_BROWSER_CITATION_SELECTION_CHANNEL,
  type InAppBrowserGuestCitationCommand,
  type InAppBrowserGuestCitationRequest,
} from "../shared/in-app-browser-citation-protocol"

export type Dispose = () => void

const COORDINATE_LIMIT = 10_000_000
const GUEST_REPLY_TIMEOUT_MS = 3_000
const GUEST_REVEAL_TIMEOUT_MS = IN_APP_BROWSER_CITATION_REVEAL_WAIT_MS + GUEST_REPLY_TIMEOUT_MS
const MARK_ID_MAX_LENGTH = 128
const HEADING_PATH_MAX_DEPTH = 6
const HEADING_LABEL_MAX_LENGTH = 200

const coordinateSchema = z.number().min(-COORDINATE_LIMIT).max(COORDINATE_LIMIT)
const extentSchema = z.number().min(0).max(COORDINATE_LIMIT)
const pointSchema = z.object({ x: coordinateSchema, y: coordinateSchema })
const rectSchema = z.object({
  x: coordinateSchema,
  y: coordinateSchema,
  width: extentSchema,
  height: extentSchema,
})
export const excerptSchema = z
  .string()
  .max(CITATION_MAX_EXCERPT_LENGTH)
  .refine((text) => text.trim().length > 0)
export const markIDSchema = z.string().min(1).max(MARK_ID_MAX_LENGTH)
export const webContentsIDSchema = z.number().int().positive()
const guestCaptureSchema = z.object({
  excerpt: excerptSchema,
  selector: z.unknown(),
  headingPath: z
    .array(z.string().min(1).max(HEADING_LABEL_MAX_LENGTH))
    .max(HEADING_PATH_MAX_DEPTH)
    .optional(),
  rect: rectSchema,
})
const guestMarkSchema = z.object({ markID: markIDSchema, rect: rectSchema.nullable() })
const guestReplySchema = z.object({ requestID: z.number().int().positive(), result: z.unknown() })

type InAppBrowserGuestCitationReply = z.infer<typeof guestReplySchema>

export type InAppBrowserGuestCitationCapture = {
  readonly excerpt: string
  readonly selector: CitationTextSelector
  readonly headingPath?: readonly string[]
  readonly rect: InAppBrowserCitationRect
}

export type InAppBrowserCitationGuestPort = {
  readonly webContentsID: number
  onMainFrameMessage(channel: string, listener: <TPayload>(payload: TPayload) => void): Dispose
  onDocumentChange(listener: () => void): Dispose
  sendToGuest(request: InAppBrowserGuestCitationRequest): void
  sendToHost(message: InAppBrowserCitationMessage): void
  insertHighlightStyles(): Promise<void>
}

export type InAppBrowserCitationBridge = {
  capture(): Promise<InAppBrowserGuestCitationCapture | undefined>
  mark(input: { markID: string; excerpt: string; selector: CitationTextSelector }): Promise<boolean>
  unmark(markID: string): Promise<void>
  reveal(input: { excerpt: string; selector: CitationTextSelector }): Promise<boolean>
  requestCite(): void
  dispose(): void
}

export function readInAppBrowserCitationPoint<TValue>(
  value: TValue,
): InAppBrowserCitationPoint | undefined {
  const parsed = pointSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function readInAppBrowserGuestCitationCapture<TValue>(
  value: TValue,
): InAppBrowserGuestCitationCapture | undefined {
  const parsed = guestCaptureSchema.safeParse(value)
  if (!parsed.success) return undefined
  const selector = readCitationTextSelector(parsed.data.selector)
  if (!selector) return undefined
  const { excerpt, headingPath, rect } = parsed.data
  return Object.assign({ excerpt, selector, rect }, headingPath ? { headingPath } : undefined)
}

export function createInAppBrowserCitationBridge(
  port: InAppBrowserCitationGuestPort,
): InAppBrowserCitationBridge {
  let nextRequestID = 1
  let highlightStyles: Promise<void> | undefined
  const pendingReplies = new Map<
    number,
    (reply: InAppBrowserGuestCitationReply | undefined) => void
  >()
  const activeMarks = new Set<string>()

  const emit = (event: InAppBrowserCitationMessage["event"]) =>
    port.sendToHost({ webContentsID: port.webContentsID, event })
  const settlePendingReplies = () => {
    const resolvers = [...pendingReplies.values()]
    pendingReplies.clear()
    for (const resolve of resolvers) resolve(undefined)
  }
  const ensureHighlightStyles = () => {
    highlightStyles ??= port.insertHighlightStyles().catch(() => undefined)
    return highlightStyles
  }
  const request = (command: InAppBrowserGuestCitationCommand, timeoutMs: number) => {
    const requestID = nextRequestID
    nextRequestID += 1
    return new Promise<InAppBrowserGuestCitationReply | undefined>((resolve) => {
      const timer = setTimeout(() => {
        if (pendingReplies.delete(requestID)) resolve(undefined)
      }, timeoutMs)
      pendingReplies.set(requestID, (reply) => {
        clearTimeout(timer)
        resolve(reply)
      })
      port.sendToGuest({ requestID, command })
    })
  }

  const disposers = [
    port.onMainFrameMessage(IN_APP_BROWSER_CITATION_SELECTION_CHANNEL, (payload) => {
      if (payload === null) {
        emit({ type: "selection-cleared" })
        return
      }
      const point = readInAppBrowserCitationPoint(payload)
      if (point) emit({ type: "selection", point })
    }),
    port.onMainFrameMessage(IN_APP_BROWSER_CITATION_MARK_CHANNEL, (payload) => {
      const parsed = guestMarkSchema.safeParse(payload)
      if (!parsed.success || !activeMarks.has(parsed.data.markID)) return
      const { markID, rect } = parsed.data
      if (rect) {
        emit({ type: "mark-moved", markID, rect })
        return
      }
      activeMarks.delete(markID)
      emit({ type: "mark-lost", markID })
    }),
    port.onMainFrameMessage(IN_APP_BROWSER_CITATION_REPLY_CHANNEL, (payload) => {
      const parsed = guestReplySchema.safeParse(payload)
      if (!parsed.success) return
      const resolve = pendingReplies.get(parsed.data.requestID)
      if (!resolve) return
      pendingReplies.delete(parsed.data.requestID)
      resolve(parsed.data)
    }),
    port.onDocumentChange(() => {
      highlightStyles = undefined
      settlePendingReplies()
      emit({ type: "selection-cleared" })
      for (const markID of activeMarks) emit({ type: "mark-lost", markID })
      activeMarks.clear()
    }),
  ]

  return {
    async capture() {
      const reply = await request({ type: "capture" }, GUEST_REPLY_TIMEOUT_MS)
      return readInAppBrowserGuestCitationCapture(reply?.result)
    },
    async mark(input) {
      activeMarks.add(input.markID)
      await ensureHighlightStyles()
      if (!activeMarks.has(input.markID)) return false
      const reply = await request({ type: "mark", ...input }, GUEST_REPLY_TIMEOUT_MS)
      const found = reply?.result === true
      if (!found) activeMarks.delete(input.markID)
      return found
    },
    async unmark(markID) {
      activeMarks.delete(markID)
      await request({ type: "unmark", markID }, GUEST_REPLY_TIMEOUT_MS)
    },
    async reveal(input) {
      await ensureHighlightStyles()
      const reply = await request({ type: "reveal", ...input }, GUEST_REVEAL_TIMEOUT_MS)
      return reply?.result === true
    },
    requestCite() {
      emit({ type: "cite-requested" })
    },
    dispose() {
      for (const dispose of disposers) dispose()
      settlePendingReplies()
      activeMarks.clear()
    },
  }
}
