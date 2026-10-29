import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { BenchMediaPreview } from "../src/components/bench/bench-media-preview"
import { createBrowserServerConnection, setRuntimeServerConnection } from "../src/context/server"

function createPreview() {
  const container = document.createElement("div")
  const root = createRoot(container)
  const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("%PDF-", { headers: { "content-type": "application/pdf" } }),
  )
  const createObjectURL = spyOn(URL, "createObjectURL").mockReturnValue("blob:bench-pdf")
  const revokeObjectURL = spyOn(URL, "revokeObjectURL").mockImplementation(() => {})

  return { container, root, fetchSpy, createObjectURL, revokeObjectURL }
}

describe("Bench PDF preview", () => {
  let preview: ReturnType<typeof createPreview>
  let mounted: boolean

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    setRuntimeServerConnection({
      url: "http://127.0.0.1:4096",
      username: "buddy",
      password: "secret",
      isEmbeddedBackend: false,
    })
    preview = createPreview()
    mounted = true
  })

  afterEach(async () => {
    try {
      if (mounted) await act(async () => preview.root.unmount())
    } finally {
      preview.container.remove()
      preview.fetchSpy.mockRestore()
      preview.createObjectURL.mockRestore()
      preview.revokeObjectURL.mockRestore()
      setRuntimeServerConnection(createBrowserServerConnection())
      Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
    }
  })

  async function render(src = "/api/objects/report/raw") {
    await act(async () => {
      preview.root.render(<BenchMediaPreview title="report.pdf" src={src} renderMode="pdf" />)
    })
  }

  test("fetches with the app login, displays a local blob, and releases it on unmount", async () => {
    await render()

    const [input, init] = preview.fetchSpy.mock.calls[0] ?? []
    expect(String(input)).toBe("http://127.0.0.1:4096/api/objects/report/raw")
    expect(new Headers(init?.headers).get("authorization")).toBe(`Basic ${btoa("buddy:secret")}`)
    const frame = preview.container.querySelector("iframe")
    expect(frame?.getAttribute("src")).toBe("blob:bench-pdf")
    expect(frame?.getAttribute("sandbox")).toBe("allow-scripts")
    expect(frame?.title).toBe("report.pdf")

    await act(async () => preview.root.unmount())
    mounted = false

    expect(preview.revokeObjectURL.mock.calls).toEqual([["blob:bench-pdf"]])
  })

  test("shows the PDF loading state while the authenticated request is pending", async () => {
    const response = Promise.withResolvers<Response>()
    preview.fetchSpy.mockReturnValue(response.promise)

    await render()

    expect(preview.container.textContent).toContain("Opening…")
    expect(preview.container.querySelector("iframe")).toBeNull()
  })

  test("shows the chat PDF error state when fetching fails", async () => {
    preview.fetchSpy.mockResolvedValue(new Response("", { status: 404 }))

    await render()

    expect(preview.container.textContent).toContain(
      "Buddy couldn't preview this PDF. Request failed (404)",
    )
    expect(preview.container.querySelector("iframe")).toBeNull()
    expect(preview.createObjectURL.mock.calls).toEqual([])
  })

  test("revokes the old local copy and loads the replacement when the source changes", async () => {
    await render()
    const response = Promise.withResolvers<Response>()
    preview.fetchSpy.mockReturnValue(response.promise)
    preview.createObjectURL.mockReturnValue("blob:replacement-pdf")

    await render("/api/objects/replacement/raw")

    expect(preview.revokeObjectURL.mock.calls).toEqual([["blob:bench-pdf"]])
    expect(preview.container.querySelector("iframe")).toBeNull()
    expect(preview.container.textContent).toContain("Opening…")

    await act(async () => response.resolve(new Response("%PDF-replacement")))

    expect(preview.container.querySelector("iframe")?.getAttribute("src")).toBe(
      "blob:replacement-pdf",
    )
  })

  test.each([200, 404])(
    "ignores a late response (%i) after its source was replaced",
    async (status) => {
      const staleResponse = Promise.withResolvers<Response>()
      preview.fetchSpy.mockReturnValueOnce(staleResponse.promise)

      await render()
      await render("/api/objects/replacement/raw")
      await act(async () => staleResponse.resolve(new Response("%PDF-stale", { status })))

      expect(preview.container.querySelector("iframe")?.getAttribute("src")).toBe("blob:bench-pdf")
      expect(preview.container.textContent).not.toContain("Buddy couldn't preview this PDF.")
      expect(preview.createObjectURL.mock.calls).toHaveLength(1)
    },
  )
})
