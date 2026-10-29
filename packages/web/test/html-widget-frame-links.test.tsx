import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { HtmlWidgetFrame } from "../src/components/media/renderers/html-widget-frame"
import { createBrowserServerConnection, setRuntimeServerConnection } from "../src/context/server"
import { resolveHtmlWidgetViewport, type HtmlWidgetPresentation } from "../src/lib/html-widgets"
import { installTestFetch, restoreTestFetch } from "./test-utils"
import { useChatStore } from "../src/state/chat-store"

const runtimeUrl =
  "/api/objects/html-widget/runtime/L3JlcG8/01ARZ3NDEKTSV4RRFFQ69G5FAV/live/index.html"
const widget: HtmlWidgetPresentation = {
  objectID: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  kind: "html-widget",
  title: "Signed widget",
  sourceRoot: ".buddy/objects/v1/html-widget/01ARZ3NDEKTSV4RRFFQ69G5FAV/source",
  entryPath: "index.html",
  sourceVersion: null,
  viewport: resolveHtmlWidgetViewport("standard_16_10"),
  runtimeUrl,
}

describe("widget frame link exchange", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let originalFetch: typeof fetch
  let requests: Request[]
  let response: ReturnType<typeof Promise.withResolvers<Response>>

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    originalFetch = globalThis.fetch
    requests = []
    response = Promise.withResolvers<Response>()
    useChatStore.getState().setStreamStatus("connecting")
    useChatStore.getState().setStreamStatus("connected")
    setRuntimeServerConnection({
      url: "http://127.0.0.1:4096",
      username: "buddy",
      password: "secret",
      isEmbeddedBackend: true,
    })
    installTestFetch(async (input, init) => {
      requests.push(new Request(input, init))
      return response.promise
    })
    container = document.createElement("div")
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    restoreTestFetch(originalFetch)
    setRuntimeServerConnection(createBrowserServerConnection())
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function render(reloadKey = 0) {
    await act(async () => {
      root.render(<HtmlWidgetFrame widget={widget} mode="bench" reloadKey={reloadKey} />)
    })
  }

  test("uses the normal authenticated API client and loads only the exchanged link", async () => {
    await render()
    expect(requests).toHaveLength(1)
    const request = requests[0]
    expect(request?.url).toBe("http://127.0.0.1:4096/api/frame/widget-links")
    expect(request?.method).toBe("POST")
    expect(request?.headers.get("authorization")).toBe(`Basic ${btoa("buddy:secret")}`)
    expect(await request?.json()).toEqual({ runtimeUrl })
    expect(container.querySelector("iframe")).toBeNull()
    await act(async () => {
      response.resolve(Response.json({ url: "/api/frame/widget/signed.pass/index.html" }))
    })
    const frame = container.querySelector("iframe")
    expect(frame?.getAttribute("src")).toBe(
      "http://127.0.0.1:4096/api/frame/widget/signed.pass/index.html?renderKey=0",
    )
    expect(frame?.getAttribute("sandbox")).toBe("allow-scripts")
    expect(frame?.getAttribute("referrerpolicy")).toBe("no-referrer")
    await render()
    expect(container.querySelector("iframe")).toBe(frame)
    expect(requests).toHaveLength(1)
  })

  test("exchanges again on reload after a backend restart", async () => {
    await render()
    await act(async () => {
      response.resolve(Response.json({ url: "/api/frame/widget/first.pass/index.html" }))
    })
    response = Promise.withResolvers<Response>()
    await render(1)
    expect(requests).toHaveLength(2)
    expect(container.querySelector("iframe")).toBeNull()
    await act(async () => {
      response.resolve(Response.json({ url: "/api/frame/widget/restarted.pass/index.html" }))
    })
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe(
      "http://127.0.0.1:4096/api/frame/widget/restarted.pass/index.html?renderKey=1",
    )
  })

  test("shows the existing error state when exchange fails", async () => {
    await render()
    await act(async () => response.resolve(new Response("", { status: 404 })))
    expect(container.querySelector("iframe")).toBeNull()
    expect(container.textContent).toContain("Widget failed to load.")
  })

  test.each(["first.pass", "restarted.pass"])(
    "refreshes the mounted frame on stream reconnect (%s)",
    async (nextPass) => {
      await render()
      await act(async () => {
        response.resolve(Response.json({ url: "/api/frame/widget/first.pass/index.html" }))
      })
      const frame = container.querySelector("iframe")
      response = Promise.withResolvers<Response>()
      await act(async () => {
        useChatStore.getState().setStreamStatus("connecting")
        useChatStore.getState().setStreamStatus("connected")
      })
      expect(requests).toHaveLength(2)
      expect(container.querySelector("iframe")).toBe(frame)
      await act(async () => {
        response.resolve(Response.json({ url: `/api/frame/widget/${nextPass}/index.html` }))
      })
      expect(container.querySelector("iframe")).toBe(frame)
      expect(frame?.getAttribute("src")).toBe(
        `http://127.0.0.1:4096/api/frame/widget/${nextPass}/index.html?renderKey=0`,
      )
    },
  )
})
