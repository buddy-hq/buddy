import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { loadToolAttachmentBlob } from "../src/components/chat/tools/tool-attachment-pdf-preview"
import { createBrowserServerConnection, setRuntimeServerConnection } from "../src/context/server"

afterEach(() => {
  setRuntimeServerConnection(createBrowserServerConnection())
})

describe("tool attachment PDF loading", () => {
  test("loads inline PDFs", async () => {
    const blob = await loadToolAttachmentBlob("data:application/pdf;base64,JVBERi0=")

    expect(await blob.text()).toBe("%PDF-")
  })

  test("sends backend credentials in a header instead of the URL", async () => {
    setRuntimeServerConnection({
      url: "http://127.0.0.1:4096",
      username: "buddy",
      password: "secret",
      isEmbeddedBackend: false,
    })
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("%PDF-"))
    try {
      await loadToolAttachmentBlob("/api/objects/report/raw")

      const [input, init] = fetchSpy.mock.calls[0] ?? []
      expect(String(input)).toBe("http://127.0.0.1:4096/api/objects/report/raw")
      expect(new Headers(init?.headers).get("authorization")).toBe(`Basic ${btoa("buddy:secret")}`)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  test("keeps Buddy credentials away from other sites and reports failed responses", async () => {
    setRuntimeServerConnection({
      url: "http://127.0.0.1:4096",
      username: "buddy",
      password: "secret",
      isEmbeddedBackend: false,
    })
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }))
    try {
      await expect(loadToolAttachmentBlob("https://example.com/paper.pdf")).rejects.toThrow(
        "Request failed (404)",
      )

      const [input, init] = fetchSpy.mock.calls[0] ?? []
      expect(String(input)).toBe("https://example.com/paper.pdf")
      expect(init).toBeUndefined()
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
