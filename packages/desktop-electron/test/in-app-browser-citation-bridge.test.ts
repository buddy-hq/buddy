import { describe, expect, test } from "bun:test"
import type { InAppBrowserCitationMessage } from "@buddy/browser-contract"
import {
  createInAppBrowserCitationBridge,
  readInAppBrowserGuestCitationCapture,
  type InAppBrowserCitationGuestPort,
} from "../src/main/in-app-browser-citation-bridge"
import {
  IN_APP_BROWSER_CITATION_MARK_CHANNEL,
  IN_APP_BROWSER_CITATION_REPLY_CHANNEL,
  IN_APP_BROWSER_CITATION_SELECTION_CHANNEL,
  type InAppBrowserGuestCitationRequest,
} from "../src/shared/in-app-browser-citation-protocol"

const SELECTOR = { version: 1, start: 4, end: 15, prefix: "The ", suffix: " grows." } as const
const CAPTURE = {
  excerpt: "plant stems",
  selector: SELECTOR,
  headingPath: ["Plants"],
  rect: { x: 10, y: 20, width: 80, height: 16 },
}

type GuestReply = { readonly result: typeof CAPTURE | boolean | null }

function createFakeGuest(
  reply: (request: InAppBrowserGuestCitationRequest) => GuestReply | undefined,
  stylesReady: Promise<void> = Promise.resolve(),
) {
  const listeners = new Map<string, <TPayload>(payload: TPayload) => void>()
  const documentListeners = new Set<() => void>()
  const hostMessages: InAppBrowserCitationMessage["event"][] = []
  const requests: InAppBrowserGuestCitationRequest[] = []
  let styleInsertions = 0
  const port: InAppBrowserCitationGuestPort = {
    webContentsID: 7,
    onMainFrameMessage(channel, listener) {
      listeners.set(channel, listener)
      return () => listeners.delete(channel)
    },
    onDocumentChange(listener) {
      documentListeners.add(listener)
      return () => documentListeners.delete(listener)
    },
    sendToGuest(request) {
      requests.push(request)
      const answer = reply(request)
      if (!answer) return
      queueMicrotask(() =>
        listeners.get(IN_APP_BROWSER_CITATION_REPLY_CHANNEL)?.({
          requestID: request.requestID,
          result: answer.result,
        }),
      )
    },
    sendToHost(message) {
      expect(message.webContentsID).toBe(7)
      hostMessages.push(message.event)
    },
    async insertHighlightStyles() {
      styleInsertions += 1
      await stylesReady
    },
  }
  return {
    bridge: createInAppBrowserCitationBridge(port),
    hostMessages,
    requests,
    send: <TPayload>(channel: string, payload: TPayload) => listeners.get(channel)?.(payload),
    changeDocument: () => {
      for (const listener of documentListeners) listener()
    },
    styleInsertions: () => styleInsertions,
  }
}

describe("in-app Browser citation bridge", () => {
  test("forwards valid page selections and clears to the Browser tab", () => {
    const guest = createFakeGuest(() => undefined)

    guest.send(IN_APP_BROWSER_CITATION_SELECTION_CHANNEL, { x: 12, y: 30 })
    guest.send(IN_APP_BROWSER_CITATION_SELECTION_CHANNEL, { x: Number.NaN, y: 30 })
    guest.send(IN_APP_BROWSER_CITATION_SELECTION_CHANNEL, "select everything")
    guest.send(IN_APP_BROWSER_CITATION_SELECTION_CHANNEL, null)
    guest.bridge.requestCite()

    expect(guest.hostMessages).toEqual([
      { type: "selection", point: { x: 12, y: 30 } },
      { type: "selection-cleared" },
      { type: "cite-requested" },
    ])
  })

  test("returns a validated capture from the page", async () => {
    const guest = createFakeGuest(() => ({ result: CAPTURE }))

    expect(await guest.bridge.capture()).toEqual(CAPTURE)
    expect(guest.requests.map((request) => request.command)).toEqual([{ type: "capture" }])
  })

  test("rejects captures the page reports in the wrong shape", () => {
    expect(
      readInAppBrowserGuestCitationCapture({ ...CAPTURE, selector: { ...SELECTOR, end: 2 } }),
    ).toBeUndefined()
    expect(readInAppBrowserGuestCitationCapture({ ...CAPTURE, excerpt: "   " })).toBeUndefined()
    expect(
      readInAppBrowserGuestCitationCapture({ ...CAPTURE, headingPath: Array(7).fill("Heading") }),
    ).toBeUndefined()
    expect(readInAppBrowserGuestCitationCapture(null)).toBeUndefined()
  })

  test("settles a pending capture and drops marks when the page navigates", async () => {
    const guest = createFakeGuest((request) =>
      request.command.type === "mark" ? { result: true } : undefined,
    )

    expect(
      await guest.bridge.mark({ markID: "mark-1", excerpt: "plant stems", selector: SELECTOR }),
    ).toBe(true)
    const capture = guest.bridge.capture()
    guest.changeDocument()

    expect(await capture).toBeUndefined()
    expect(guest.hostMessages).toEqual([
      { type: "selection-cleared" },
      { type: "mark-lost", markID: "mark-1" },
    ])
  })

  test("reports mark movement only for marks it placed", async () => {
    const guest = createFakeGuest((request) => ({ result: request.command.type !== "reveal" }))

    await guest.bridge.mark({ markID: "mark-1", excerpt: "plant stems", selector: SELECTOR })
    const rect = { x: 10, y: 40, width: 80, height: 16 }
    guest.send(IN_APP_BROWSER_CITATION_MARK_CHANNEL, { markID: "mark-1", rect })
    guest.send(IN_APP_BROWSER_CITATION_MARK_CHANNEL, { markID: "someone-else", rect })
    guest.send(IN_APP_BROWSER_CITATION_MARK_CHANNEL, { markID: "mark-1", rect: null })
    guest.send(IN_APP_BROWSER_CITATION_MARK_CHANNEL, { markID: "mark-1", rect })

    expect(guest.hostMessages).toEqual([
      { type: "mark-moved", markID: "mark-1", rect },
      { type: "mark-lost", markID: "mark-1" },
    ])
  })

  test("never places a mark that was removed while page styles were loading", async () => {
    const styles = Promise.withResolvers<void>()
    const guest = createFakeGuest(() => ({ result: true }), styles.promise)

    const marked = guest.bridge.mark({
      markID: "mark-1",
      excerpt: "plant stems",
      selector: SELECTOR,
    })
    await guest.bridge.unmark("mark-1")
    styles.resolve()

    expect(await marked).toBe(false)
    expect(guest.requests.map((request) => request.command.type)).toEqual(["unmark"])
  })

  test("reports a mark lost when the page navigates while styles are loading", async () => {
    const styles = Promise.withResolvers<void>()
    const guest = createFakeGuest(() => ({ result: true }), styles.promise)

    const marked = guest.bridge.mark({
      markID: "mark-1",
      excerpt: "plant stems",
      selector: SELECTOR,
    })
    guest.changeDocument()
    styles.resolve()

    expect(await marked).toBe(false)
    expect(guest.requests).toEqual([])
    expect(guest.hostMessages).toEqual([
      { type: "selection-cleared" },
      { type: "mark-lost", markID: "mark-1" },
    ])
  })

  test("adds highlight styles once per page before marking or revealing", async () => {
    const guest = createFakeGuest((request) => ({ result: request.command.type === "reveal" }))

    expect(await guest.bridge.reveal({ excerpt: "plant stems", selector: SELECTOR })).toBe(true)
    await guest.bridge.reveal({ excerpt: "plant stems", selector: SELECTOR })
    expect(guest.styleInsertions()).toBe(1)

    guest.changeDocument()
    await guest.bridge.mark({ markID: "mark-2", excerpt: "plant stems", selector: SELECTOR })
    expect(guest.styleInsertions()).toBe(2)
  })
})
