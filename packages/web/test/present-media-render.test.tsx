import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { PlatformProvider, type Platform } from "../src/context/platform"
import { ServerProvider, type ServerConnection } from "../src/context/server"
import type { ToolPartProps } from "../src/components/chat/tools/registry"
import { renderPresentMediaTool } from "../src/components/chat/tools/render/present-media"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import { usePresentedMediaPlaybackStore } from "../src/state/presented-media-playback-store"
import { useWorkspaceFilePanelStore } from "../src/state/workspace-file-panel-store"

function PresentMediaToolHarness(props: ToolPartProps) {
  return renderPresentMediaTool(props)
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

function renderHarness(root: Root, element: ReactNode) {
  const queryClient = createQueryClient()

  root.render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>)
}

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

function createPlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    platform: "web",
    openLink() {},
    async restart() {},
    back() {},
    forward() {},
    async notify() {},
    ...overrides,
  }
}

function createServerConnection(): ServerConnection {
  return {
    url: "",
    username: null,
    password: null,
    isSidecar: false,
  }
}

function createPendingJsonResponse(input: {
  pendingResponses: Array<() => void>
  body: unknown
}): Promise<Response> {
  return new Promise<Response>((resolve) => {
    input.pendingResponses.push(() => resolve(Response.json(input.body)))
  })
}

function createToolProps(input: {
  artifactID: string
  layout: string
  items: Array<{
    path: string
    absolutePath?: string
    fileName: string
    mediaKind: string
    mimeType?: string
    renderMode: string
    rawUrl: string
    canOpenInWorkspacePanel?: boolean
    sizeBytes?: number
  }>
}): ToolPartProps {
  return {
    part: {
      id: "prt_media",
      sessionID: "ses_media",
      messageID: "msg_media",
      type: "tool",
    },
    state: {
      status: "completed",
      input: {},
      attachments: [],
      metadata: {
        artifact: "PresentedMediaOutput",
        value: {
          artifactID: input.artifactID,
          kind: "media-presentation",
          title: "Presented media",
          summary: "A test media card",
          intent: "show_now",
          layout: input.layout,
          items: input.items.map((item, index) => ({
            id: `item_${index + 1}`,
            inputPath: item.path,
            absolutePath: item.absolutePath ?? item.path,
            displayPath: item.path,
            workspacePath: item.canOpenInWorkspacePanel === false ? null : item.path,
            fileName: item.fileName,
            label: null,
            caption: null,
            displayHint: "auto",
            mediaKind: item.mediaKind,
            renderMode: item.renderMode,
            mimeType: item.mimeType ?? null,
            sizeBytes: item.sizeBytes ?? 42,
            modifiedAt: null,
            rawUrl: item.rawUrl,
            actionCapabilities: {
              canOpenDefaultApp: true,
              canRevealInFileManager: true,
              canOpenInWorkspacePanel: item.canOpenInWorkspacePanel ?? true,
            },
            availability: {
              status: "available",
              message: null,
            },
          })),
        },
      },
    },
    info: {
      title: "present_media",
    },
    tool: "present_media",
    directory: "/repo",
  }
}

describe("present media renderer", () => {
  let container: HTMLDivElement
  let root: Root
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    originalFetch = globalThis.fetch
    useWorkspaceFilePanelStore.setState({
      selectedPathByDirectory: {},
      selectedItemByDirectory: {},
      pendingOpenByDirectory: {},
      pendingAutoOpenByDirectory: {},
    })
    usePresentedMediaPlaybackStore.setState({
      loadedKeys: [],
      playingKey: undefined,
      volume: 1,
      muted: false,
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    globalThis.fetch = originalFetch
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("renders a gallery for multiple images", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = input instanceof Request ? input.method : (init?.method ?? "GET")

      if (
        method === "GET" &&
        (url.includes(
          "/api/artifacts/media-presentation/artifact_a/items/item_1/availability",
        ) ||
          url.includes(
            "/api/artifacts/media-presentation/artifact_a/items/item_2/availability",
          ))
      ) {
        return Response.json({ status: "available", message: null })
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`)
    })

    globalThis.fetch = withFetchPreconnect(fetchMock, originalFetch)

    await act(async () => {
      renderHarness(
        root,
        <PlatformProvider value={createPlatform()}>
          <ServerProvider value={createServerConnection()}>
            <PresentMediaToolHarness
              {...createToolProps({
                artifactID: "artifact_a",
                layout: "gallery",
                items: [
                  {
                    path: "generated/a.png",
                    fileName: "a.png",
                    mediaKind: "image",
                    renderMode: "image",
                    rawUrl:
                      "/api/artifacts/media-presentation/artifact_a/raw/media_item_1?directory=%2Frepo&fileName=a.png",
                  },
                  {
                    path: "generated/b.png",
                    fileName: "b.png",
                    mediaKind: "image",
                    renderMode: "image",
                    rawUrl:
                      "/api/artifacts/media-presentation/artifact_a/raw/media_item_2?directory=%2Frepo&fileName=b.png",
                  },
                ],
              })}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })
    await act(async () => {
      await flushEffects()
    })

    expect(container.querySelectorAll("img").length).toBe(4)
    expect(
      fetchMock.mock.calls.filter(([input, init]) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")
        return url.includes("/api/artifacts/media-presentation/artifact_a/raw/") && method !== "HEAD"
      }).length,
    ).toBe(0)
  })

  test("renders the first video player immediately without autoplay", async () => {
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (
          method === "GET" &&
          url.includes(
            "/api/artifacts/media-presentation/artifact_video/items/item_1/availability",
          )
        ) {
          return Response.json({ status: "available", message: null })
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    await act(async () => {
      renderHarness(
        root,
        <PlatformProvider value={createPlatform()}>
          <ServerProvider value={createServerConnection()}>
            <PresentMediaToolHarness
              {...createToolProps({
                artifactID: "artifact_video",
                layout: "single",
                items: [
                  {
                    path: "generated/demo.mp4",
                    fileName: "demo.mp4",
                    mediaKind: "video",
                    mimeType: "video/mp4",
                    renderMode: "video",
                    rawUrl:
                      "/api/artifacts/media-presentation/artifact_video/raw/media_item_1?directory=%2Frepo&fileName=demo.mp4",
                  },
                ],
              })}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })

    const video = container.querySelector("video")
    expect(video).not.toBeNull()
    expect(video?.getAttribute("src")).toContain(
      "/api/artifacts/media-presentation/artifact_video/raw/media_item_1",
    )
    expect(video?.getAttribute("preload")).toBe("metadata")
    expect(video?.hasAttribute("autoplay")).toBe(false)
    expect(video?.paused).toBe(true)
  })

  test("renders audio and video as separate player groups without headers", async () => {
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (
          method === "GET" &&
          (url.includes(
            "/api/artifacts/media-presentation/artifact_mixed/items/item_1/availability",
          ) ||
            url.includes(
              "/api/artifacts/media-presentation/artifact_mixed/items/item_2/availability",
            ))
        ) {
          return Response.json({ status: "available", message: null })
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    await act(async () => {
      renderHarness(
        root,
        <PlatformProvider value={createPlatform()}>
          <ServerProvider value={createServerConnection()}>
            <PresentMediaToolHarness
              {...createToolProps({
                artifactID: "artifact_mixed",
                layout: "gallery",
                items: [
                  {
                    path: "generated/demo.mp4",
                    fileName: "demo.mp4",
                    mediaKind: "video",
                    mimeType: "video/mp4",
                    renderMode: "video",
                    rawUrl:
                      "/api/artifacts/media-presentation/artifact_mixed/raw/media_item_1?directory=%2Frepo&fileName=demo.mp4",
                  },
                  {
                    path: "generated/demo.mp3",
                    fileName: "demo.mp3",
                    mediaKind: "audio",
                    mimeType: "audio/mpeg",
                    renderMode: "audio",
                    rawUrl:
                      "/api/artifacts/media-presentation/artifact_mixed/raw/media_item_2?directory=%2Frepo&fileName=demo.mp3",
                  },
                ],
              })}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })

    expect(container.querySelector("video")).not.toBeNull()
    expect(container.querySelector("audio")).not.toBeNull()
    expect(container.textContent).not.toContain("Audio and video")
    expect(container.textContent).not.toContain("Images")
    expect(container.textContent).not.toContain("Files")
  })

  test("renders file actions for non-image items", async () => {
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (
          method === "GET" &&
          url.includes(
            "/api/artifacts/media-presentation/artifact_notes/items/item_1/availability",
          ) &&
          url.includes("directory=%2Frepo")
        ) {
          return Response.json({ status: "available", message: null })
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    await act(async () => {
      renderHarness(
        root,
        <PlatformProvider value={createPlatform()}>
          <ServerProvider value={createServerConnection()}>
            <PresentMediaToolHarness
              {...createToolProps({
                artifactID: "artifact_notes",
                layout: "list",
                items: [
                  {
                    path: "generated/notes.pdf",
                    fileName: "notes.pdf",
                    mediaKind: "pdf",
                    renderMode: "pdf",
                    rawUrl:
                      "/api/artifacts/media-presentation/artifact_notes/raw/media_item_1?directory=%2Frepo&fileName=notes.pdf",
                  },
                ],
              })}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("notes.pdf")
    expect(container.querySelectorAll("tr").length).toBe(1)
  })

  test("hides PDF processing actions until resources load", async () => {
    const pendingResponses: Array<() => void> = []
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = input instanceof Request ? input.method : (init?.method ?? "GET")

      if (
        method === "GET" &&
        url.includes(
          "/api/artifacts/media-presentation/artifact_notes/items/item_1/availability",
        ) &&
        url.includes("directory=%2Frepo")
      ) {
        return Response.json({ status: "available", message: null })
      }

      if (method === "GET" && url.includes("/api/find/file")) {
        return createPendingJsonResponse({ pendingResponses, body: [] })
      }

      if (method === "GET" && url.includes("/api/resource")) {
        return createPendingJsonResponse({ pendingResponses, body: { resources: [] } })
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`)
    })

    globalThis.fetch = withFetchPreconnect(fetchMock, originalFetch)

    await act(async () => {
      renderHarness(
        root,
        <PlatformProvider value={createPlatform()}>
          <ServerProvider value={createServerConnection()}>
            <PresentMediaToolHarness
              {...createToolProps({
                artifactID: "artifact_notes",
                layout: "list",
                items: [
                  {
                    path: "generated/notes.pdf",
                    fileName: "notes.pdf",
                    mediaKind: "pdf",
                    renderMode: "pdf",
                    rawUrl:
                      "/api/artifacts/media-presentation/artifact_notes/raw/media_item_1?directory=%2Frepo&fileName=notes.pdf",
                  },
                ],
              })}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("notes.pdf")
    expect(container.textContent).not.toContain("Process for Buddy")
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")
        return method === "POST" && url.includes("/api/resource")
      }),
    ).toBe(false)

    for (const resolvePending of pendingResponses) {
      resolvePending()
    }

    await act(async () => {
      await flushEffects()
    })

    expect(container.textContent).toContain("Process for Buddy")
  })

  test("renders local file actions and original path controls", async () => {
    const openPath = mock(async () => {})
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (
          method === "GET" &&
          url.includes(
            "/api/artifacts/media-presentation/artifact_b/items/item_1/availability",
          ) &&
          url.includes("directory=%2Frepo")
        ) {
          return Response.json({ status: "available", message: null })
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    await act(async () => {
      renderHarness(
        root,
        <PlatformProvider value={createPlatform({ openPath })}>
          <ServerProvider value={createServerConnection()}>
            <PresentMediaToolHarness
              {...createToolProps({
                artifactID: "artifact_b",
                layout: "list",
                items: [
                  {
                    path: "/tmp/notes.pdf",
                    absolutePath: "/tmp/notes.pdf",
                    fileName: "notes.pdf",
                    mediaKind: "pdf",
                    renderMode: "pdf",
                    rawUrl:
                      "/api/artifacts/media-presentation/artifact_b/raw/media_item_1?directory=%2Frepo&fileName=notes.pdf",
                    canOpenInWorkspacePanel: false,
                  },
                ],
              })}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })

    const row = container.querySelector("tr")
    expect(row).not.toBeNull()

    await act(async () => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flushEffects()
    })

    expect(container.textContent).toContain("notes.pdf")
    expect(container.textContent).toContain("Outside notebook")
    expect(container.querySelectorAll("tr").length).toBe(1)
    expect(openPath).toHaveBeenCalledWith("/tmp/notes.pdf")
  })

  test("opens non-previewable workspace files in the default app on primary click", async () => {
    const openPath = mock(async () => {})
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (
          method === "GET" &&
          url.includes(
            "/api/artifacts/media-presentation/artifact_deck/items/item_1/availability",
          ) &&
          url.includes("directory=%2Frepo")
        ) {
          return Response.json({ status: "available", message: null })
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    await act(async () => {
      renderHarness(
        root,
        <PlatformProvider value={createPlatform({ openPath })}>
          <ServerProvider value={createServerConnection()}>
            <PresentMediaToolHarness
              {...createToolProps({
                artifactID: "artifact_deck",
                layout: "list",
                items: [
                  {
                    path: "generated/deck.pptx",
                    absolutePath: "/repo/generated/deck.pptx",
                    fileName: "deck.pptx",
                    mediaKind: "presentation",
                    renderMode: "file",
                    rawUrl:
                      "/api/artifacts/media-presentation/artifact_deck/raw/media_item_1?directory=%2Frepo&fileName=deck.pptx",
                  },
                ],
              })}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })

    const row = container.querySelector("tr")
    expect(row).not.toBeNull()

    await act(async () => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flushEffects()
    })

    expect(openPath).toHaveBeenCalledWith("/repo/generated/deck.pptx")
    expect(useWorkspaceFilePanelStore.getState().pendingOpenByDirectory["/repo"]).toBe(undefined)
  })

  test("does not fetch blobs for unavailable image items", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url

      const method = input instanceof Request ? input.method : (init?.method ?? "GET")

      if (
        method === "GET" &&
        url.includes(
          "/api/artifacts/media-presentation/artifact_missing/items/item_1/availability",
        )
      ) {
        return Response.json({ status: "missing", message: "File not found" })
      }

      if (url.includes("/api/artifacts/media-presentation/artifact_missing/raw/media_item_1")) {
        throw new Error(`unexpected raw blob fetch: ${url}`)
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    globalThis.fetch = withFetchPreconnect(fetchMock, originalFetch)

    await act(async () => {
      renderHarness(
        root,
        <PlatformProvider value={createPlatform()}>
          <ServerProvider value={createServerConnection()}>
            <PresentMediaToolHarness
              {...createToolProps({
                artifactID: "artifact_missing",
                layout: "single",
                items: [
                  {
                    path: "/tmp/screenshot.png",
                    absolutePath: "/tmp/screenshot.png",
                    fileName: "screenshot.png",
                    mediaKind: "image",
                    renderMode: "image",
                    rawUrl:
                      "/api/artifacts/media-presentation/artifact_missing/raw/media_item_1?directory=%2Frepo&fileName=screenshot.png",
                    canOpenInWorkspacePanel: false,
                  },
                ],
              })}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })

    await act(async () => {
      await flushEffects()
    })

    expect(container.textContent).toContain("screenshot.png")
    expect(container.querySelectorAll("tr").length).toBe(1)
    expect(
      fetchMock.mock.calls.filter(([input, init]) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")
        return (
          url.includes("/api/artifacts/media-presentation/artifact_missing/raw/media_item_1") &&
          method !== "HEAD"
        )
      }).length,
    ).toBe(0)
  })

  test("keeps oversized local media actionable via file row fallback", async () => {
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (
          method === "GET" &&
          url.includes(
            "/api/artifacts/media-presentation/artifact_huge/items/item_1/availability",
          ) &&
          url.includes("directory=%2Frepo")
        ) {
          return Response.json({ status: "available", message: null })
        }

        if (
          url.includes("/api/artifacts/media-presentation/artifact_huge/raw/media_item_1") &&
          method !== "HEAD"
        ) {
          throw new Error(`unexpected raw blob fetch: ${method} ${url}`)
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    await act(async () => {
      renderHarness(
        root,
        <PlatformProvider value={createPlatform()}>
          <ServerProvider value={createServerConnection()}>
            <PresentMediaToolHarness
              {...createToolProps({
                artifactID: "artifact_huge",
                layout: "single",
                items: [
                  {
                    path: "/tmp/huge.png",
                    absolutePath: "/tmp/huge.png",
                    fileName: "huge.png",
                    mediaKind: "image",
                    renderMode: "image",
                    sizeBytes: 1024 * 1024 * 1024,
                    rawUrl:
                      "/api/artifacts/media-presentation/artifact_huge/raw/media_item_1?directory=%2Frepo&fileName=huge.png",
                    canOpenInWorkspacePanel: false,
                  },
                ],
              })}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })

    await act(async () => {
      await flushEffects()
    })

    expect(container.textContent).toContain("huge.png")
    expect(container.querySelector("video")).toBeNull()
    expect(container.querySelector("audio")).toBeNull()
    expect(container.querySelectorAll("tr").length).toBe(1)
  })

  test("keeps non-previewable image siblings visible beside previewable images", async () => {
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (
          method === "GET" &&
          (url.includes(
            "/api/artifacts/media-presentation/artifact_combo/items/item_1/availability",
          ) ||
            url.includes(
              "/api/artifacts/media-presentation/artifact_combo/items/item_2/availability",
            )) &&
          url.includes("directory=%2Frepo")
        ) {
          return Response.json({ status: "available", message: null })
        }

        if (
          url.includes("/api/artifacts/media-presentation/artifact_combo/raw/media_item_1") &&
          method !== "HEAD"
        ) {
          return new Response("previewable", { status: 200 })
        }

        if (
          url.includes("/api/artifacts/media-presentation/artifact_combo/raw/media_item_2") &&
          method !== "HEAD"
        ) {
          throw new Error(`unexpected raw blob fetch: ${method} ${url}`)
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    await act(async () => {
      renderHarness(
        root,
        <PlatformProvider value={createPlatform()}>
          <ServerProvider value={createServerConnection()}>
            <PresentMediaToolHarness
              {...createToolProps({
                artifactID: "artifact_combo",
                layout: "gallery",
                items: [
                  {
                    path: "generated/a.png",
                    fileName: "a.png",
                    mediaKind: "image",
                    renderMode: "image",
                    rawUrl:
                      "/api/artifacts/media-presentation/artifact_combo/raw/media_item_1?directory=%2Frepo&fileName=a.png",
                    sizeBytes: 42,
                  },
                  {
                    path: "generated/huge.png",
                    absolutePath: "/tmp/huge.png",
                    fileName: "huge.png",
                    mediaKind: "image",
                    renderMode: "image",
                    rawUrl:
                      "/api/artifacts/media-presentation/artifact_combo/raw/media_item_2?directory=%2Frepo&fileName=huge.png",
                    canOpenInWorkspacePanel: false,
                    sizeBytes: 1024 * 1024 * 1024,
                  },
                ],
              })}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })

    await act(async () => {
      await flushEffects()
    })

    expect(container.querySelector('img[alt="a.png"]')).not.toBeNull()
    expect(container.textContent).toContain("huge.png")
    expect(container.querySelectorAll("tr").length).toBe(1)
  })

  test("fades unavailable artifact-backed items instead of retrying path resolution", async () => {
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (
          method === "GET" &&
          url.includes(
            "/api/artifacts/media-presentation/artifact_stale/items/item_1/availability",
          ) &&
          url.includes("directory=%2Frepo")
        ) {
          return Response.json({ status: "missing", message: "File not found" })
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    await act(async () => {
      renderHarness(
        root,
        <PlatformProvider value={createPlatform()}>
          <ServerProvider value={createServerConnection()}>
            <PresentMediaToolHarness
              {...createToolProps({
                artifactID: "artifact_stale",
                layout: "list",
                items: [
                  {
                    path: "/tmp/notes.pdf",
                    absolutePath: "/tmp/notes.pdf",
                    fileName: "notes.pdf",
                    mediaKind: "pdf",
                    renderMode: "pdf",
                    rawUrl:
                      "/api/artifacts/media-presentation/artifact_stale/raw/media_item_1?directory=%2Frepo&fileName=notes.pdf",
                    canOpenInWorkspacePanel: false,
                  },
                ],
              })}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })

    await act(async () => {
      await flushEffects()
    })

    const row = container.querySelector("tr")

    expect(row?.className.includes("opacity-50")).toBe(true)
    expect(container.textContent).toContain("notes.pdf")
  })
})
