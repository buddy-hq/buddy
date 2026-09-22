import {
  IN_APP_BROWSER_CITATION_CHANNEL,
  isAllowedInAppBrowserUrl,
  normalizeInAppBrowserTitle,
  type InAppBrowserCitationCaptureResult,
  type InAppBrowserCitationLocateResult,
  type InAppBrowserCommandResult,
} from "@buddy/browser-contract"
import { readCitationTextSelector } from "@buddy/citation-contract"
import {
  webContents,
  type Event as ElectronEvent,
  type IpcMainEvent,
  type WebContents,
  type WebContentsDidStartNavigationEventParams,
} from "electron"
import { z } from "zod"
import {
  IN_APP_BROWSER_CITATION_COMMAND_CHANNEL,
  IN_APP_BROWSER_CITATION_HIGHLIGHT_CSS,
} from "../shared/in-app-browser-citation-protocol"
import {
  createInAppBrowserCitationBridge,
  excerptSchema,
  markIDSchema,
  webContentsIDSchema,
  type Dispose,
  type InAppBrowserCitationBridge,
  type InAppBrowserCitationGuestPort,
} from "./in-app-browser-citation-bridge"

const captureRequestSchema = z.object({ webContentsID: webContentsIDSchema })
const revealRequestSchema = z.object({
  webContentsID: webContentsIDSchema,
  excerpt: excerptSchema,
  selector: z.unknown(),
})
const markRequestSchema = revealRequestSchema.extend({ markID: markIDSchema })
const unmarkRequestSchema = z.object({ webContentsID: webContentsIDSchema, markID: markIDSchema })

const bridgesByGuest = new WeakMap<WebContents, InAppBrowserCitationBridge>()

function electronCitationGuestPort(guest: WebContents): InAppBrowserCitationGuestPort {
  return {
    webContentsID: guest.id,
    onMainFrameMessage(channel, listener) {
      const received = <TPayload>(event: IpcMainEvent, payload: TPayload) => {
        if (event.senderFrame === guest.mainFrame) listener(payload)
      }
      guest.ipc.on(channel, received)
      return () => guest.ipc.removeListener(channel, received)
    },
    onDocumentChange(listener) {
      const started = (event: ElectronEvent<WebContentsDidStartNavigationEventParams>) => {
        if (event.isMainFrame && !event.isSameDocument) listener()
      }
      guest.on("did-start-navigation", started)
      return () => guest.removeListener("did-start-navigation", started)
    },
    sendToGuest(request) {
      if (!guest.isDestroyed()) guest.send(IN_APP_BROWSER_CITATION_COMMAND_CHANNEL, request)
    },
    sendToHost(message) {
      const host = guest.hostWebContents
      if (host && !host.isDestroyed()) host.send(IN_APP_BROWSER_CITATION_CHANNEL, message)
    },
    async insertHighlightStyles() {
      if (!guest.isDestroyed()) await guest.insertCSS(IN_APP_BROWSER_CITATION_HIGHLIGHT_CSS)
    },
  }
}

export function attachInAppBrowserCitations(guest: WebContents): Dispose {
  const bridge = createInAppBrowserCitationBridge(electronCitationGuestPort(guest))
  bridgesByGuest.set(guest, bridge)
  return () => {
    if (bridgesByGuest.get(guest) === bridge) bridgesByGuest.delete(guest)
    bridge.dispose()
  }
}

export function requestInAppBrowserCitation(guest: WebContents): void {
  bridgesByGuest.get(guest)?.requestCite()
}

function citationGuest(
  host: WebContents,
  webContentsID: number,
): { guest: WebContents; bridge: InAppBrowserCitationBridge } | undefined {
  const guest = webContents.fromId(webContentsID)
  if (!guest || guest.isDestroyed() || guest.hostWebContents?.id !== host.id) return undefined
  const bridge = bridgesByGuest.get(guest)
  return bridge ? { guest, bridge } : undefined
}

export async function captureInAppBrowserCitation<TInput>(
  host: WebContents,
  input: TInput,
): Promise<InAppBrowserCitationCaptureResult> {
  const request = captureRequestSchema.safeParse(input)
  if (!request.success) return { _tag: "failed", reason: "invalid-request" }
  const target = citationGuest(host, request.data.webContentsID)
  if (!target) return { _tag: "failed", reason: "tab-unavailable" }
  const capture = await target.bridge.capture()
  if (!capture || target.guest.isDestroyed()) return { _tag: "failed", reason: "no-selection" }
  const url = target.guest.getURL()
  if (!isAllowedInAppBrowserUrl(url)) return { _tag: "failed", reason: "no-selection" }
  return {
    _tag: "captured",
    capture: { ...capture, url, title: normalizeInAppBrowserTitle(target.guest.getTitle(), url) },
  }
}

export async function markInAppBrowserCitation<TInput>(
  host: WebContents,
  input: TInput,
): Promise<InAppBrowserCitationLocateResult> {
  const request = markRequestSchema.safeParse(input)
  const selector = request.success ? readCitationTextSelector(request.data.selector) : undefined
  if (!request.success || !selector) return { _tag: "failed", reason: "invalid-request" }
  const target = citationGuest(host, request.data.webContentsID)
  if (!target) return { _tag: "failed", reason: "tab-unavailable" }
  const found = await target.bridge.mark({
    markID: request.data.markID,
    excerpt: request.data.excerpt,
    selector,
  })
  return found ? { _tag: "found" } : { _tag: "not-found" }
}

export async function unmarkInAppBrowserCitation<TInput>(
  host: WebContents,
  input: TInput,
): Promise<InAppBrowserCommandResult> {
  const request = unmarkRequestSchema.safeParse(input)
  if (!request.success) return { _tag: "failed", reason: "invalid-request" }
  const target = citationGuest(host, request.data.webContentsID)
  if (!target) return { _tag: "failed", reason: "tab-unavailable" }
  await target.bridge.unmark(request.data.markID)
  return { _tag: "done" }
}

export async function revealInAppBrowserCitation<TInput>(
  host: WebContents,
  input: TInput,
): Promise<InAppBrowserCitationLocateResult> {
  const request = revealRequestSchema.safeParse(input)
  const selector = request.success ? readCitationTextSelector(request.data.selector) : undefined
  if (!request.success || !selector) return { _tag: "failed", reason: "invalid-request" }
  const target = citationGuest(host, request.data.webContentsID)
  if (!target) return { _tag: "failed", reason: "tab-unavailable" }
  const found = await target.bridge.reveal({ excerpt: request.data.excerpt, selector })
  return found ? { _tag: "found" } : { _tag: "not-found" }
}
