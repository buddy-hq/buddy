import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { PlatformProvider, type Platform } from "../src/context/platform"
import { ServerProvider, type ServerConnection } from "../src/context/server"
import type { ToolPartProps } from "../src/components/chat/tools/registry"
import { resolveToolRenderer } from "../src/components/chat/tools/registry"
import {
  GroupedImagegenToolCard,
  renderImageGenerationTool,
  renderPresentMediaTool,
} from "../src/components/chat/tools/render/present-media"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import { usePresentedMediaPlaybackStore } from "../src/state/presented-media-playback-store"
import type { MessagePart } from "../src/state/chat-types"
import { getPromptDraft, getPromptScopeKey, usePromptStore } from "../src/state/prompt-store"

function PresentMediaToolHarness(props: ToolPartProps) {
  return renderPresentMediaTool(props)
}

function ImageGenerationToolHarness(props: ToolPartProps) {
  return renderImageGenerationTool(props)
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
  const rootRoute = createRootRoute({
    component: () => <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: ["/"],
    }),
  })

  root.render(<RouterProvider router={router} />)
}

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

async function waitForEffect(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return
    await act(async () => {
      await flushEffects()
    })
  }
  throw new Error("Expected effect did not complete")
}

function mediaFileRows(container: ParentNode) {
  return container.querySelectorAll<HTMLElement>('[data-component="media-file-row"]')
}

function firstMediaFileRow(container: ParentNode) {
  return container.querySelector<HTMLElement>('[data-component="media-file-row"]')
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
    isEmbeddedBackend: false,
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
  objectID: string
  layout: string
  items: Array<{
    path: string
    absolutePath?: string
    fileName: string
    mediaKind: string
    mimeType?: string
    renderMode: string
    rawUrl: string
    canOpenInBuddy?: boolean
    sizeBytes?: number
  }>
}): ToolPartProps {
  const ref = {
    kind: "media-presentation",
    objectID: input.objectID,
    revisionID: null,
    itemID: null,
  } as const
  const layout = input.layout === "single" ? "single" : input.layout === "list" ? "strip" : "grid"

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
        buddyObjectResult: {
          version: 1,
          status: "ok",
          reason: null,
          message: "Presented media.",
          primaryRef: ref,
          objects: [
            {
              kind: "media-presentation",
              objectID: input.objectID,
              title: "Presented media",
              status: "ready",
              lifecycle: "external-reference",
              sourceRoot: null,
            },
          ],
          presentations: [
            {
              ref,
              viewID: "gallery",
              surface: "inline",
              data: {
                renderer: "media-gallery",
                layout,
                items: input.items.map((item, index) => ({
                  itemID: `item_${index + 1}`,
                  title: item.fileName,
                  mediaType: item.mediaKind,
                  mimeType: item.mimeType ?? null,
                  source: {
                    role: "external",
                    path: item.absolutePath ?? item.path,
                    displayPath: item.path,
                    workspacePath: item.canOpenInBuddy === false ? null : item.path,
                    availability: "available",
                  },
                  availability: "available",
                  rawUrl: item.rawUrl,
                  fileName: item.fileName,
                })),
              },
              autoOpen: null,
            },
          ],
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

function createImagegenPart(input: {
  id: string
  objectID: string
  fileName: string
  rawUrl: string
}): MessagePart {
  const props = createToolProps({
    objectID: input.objectID,
    layout: "single",
    items: [
      {
        path: `generated/${input.fileName}`,
        fileName: input.fileName,
        mediaKind: "image",
        renderMode: "image",
        rawUrl: input.rawUrl,
      },
    ],
  })
  return {
    id: input.id,
    sessionID: "ses_media",
    messageID: "msg_media",
    callID: `call_${input.id}`,
    type: "tool",
    tool: "imagegen",
    state: {
      status: "completed",
      input: {},
      attachments: [],
      metadata: props.state.metadata,
      output: "",
    },
  }
}

describe("present media renderer", () => {
  let container: HTMLDivElement
  let root: Root
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    originalFetch = globalThis.fetch
    usePresentedMediaPlaybackStore.setState({
      loadedKeys: [],
      playingKey: undefined,
      volume: 1,
      muted: false,
    })
    usePromptStore.setState({
      draftsByKey: {},
      historyByDirectory: {},
      historyNavigationByKey: {},
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

  test("routes semantic image and media tokens to their dedicated adapters", () => {
    const imagegenRenderer = resolveToolRenderer("image-generation")
    const presentMediaRenderer = resolveToolRenderer("media")

    expect(imagegenRenderer.card).toBe(renderImageGenerationTool)
    expect(presentMediaRenderer.card).toBe(renderPresentMediaTool)
  })

  test("uses the visual media loading shell while imagegen is running", async () => {
    const props = createToolProps({
      objectID: "object_loading",
      layout: "single",
      items: [],
    })

    await act(async () => {
      renderHarness(
        root,
        <ImageGenerationToolHarness
          {...props}
          tool="imagegen"
          state={{
            ...props.state,
            status: "running",
          }}
        />,
      )
      await flushEffects()
    })

    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })

  test("combines parallel imagegen results into one multi-image shell", async () => {
    const first = createImagegenPart({
      id: "prt_imagegen_1",
      objectID: "object_imagegen_1",
      fileName: "first.png",
      rawUrl: "/api/objects/media-presentation/object_imagegen_1/raw/item_1",
    })
    const second = createImagegenPart({
      id: "prt_imagegen_2",
      objectID: "object_imagegen_2",
      fileName: "second.png",
      rawUrl: "/api/objects/media-presentation/object_imagegen_2/raw/item_1",
    })
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes("/availability")) {
        return Response.json({ status: "available", message: null })
      }
      throw new Error(`Unexpected fetch: GET ${url}`)
    })
    globalThis.fetch = withFetchPreconnect(fetchMock, originalFetch)

    await act(async () => {
      renderHarness(root, <GroupedImagegenToolCard parts={[first, second]} directory="/repo" />)
      await flushEffects()
    })

    expect(container.querySelectorAll('[data-slot="carousel"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-slot="carousel-item"]')).toHaveLength(2)
  })

  test("removes stale grouped image URLs when current availability is missing", async () => {
    const first = createImagegenPart({
      id: "prt_imagegen_available",
      objectID: "object_imagegen_available",
      fileName: "available.png",
      rawUrl: "/api/objects/media-presentation/object_imagegen_available/raw/item_1",
    })
    const second = createImagegenPart({
      id: "prt_imagegen_missing",
      objectID: "object_imagegen_missing",
      fileName: "missing.png",
      rawUrl: "/api/objects/media-presentation/object_imagegen_missing/raw/item_1",
    })
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes("object_imagegen_available") && url.includes("/availability")) {
        return Response.json({ status: "available", message: null })
      }
      if (url.includes("object_imagegen_missing") && url.includes("/availability")) {
        return Response.json({ status: "missing", message: "Media item is unavailable." })
      }
      throw new Error(`Unexpected fetch: GET ${url}`)
    })
    globalThis.fetch = withFetchPreconnect(fetchMock, originalFetch)

    await act(async () => {
      renderHarness(root, <GroupedImagegenToolCard parts={[first, second]} directory="/repo" />)
      await flushEffects()
    })
    await waitForEffect(() => fetchMock.mock.calls.length === 2)

    expect(container.querySelectorAll('img[src*="object_imagegen_available"]')).not.toHaveLength(0)
    expect(container.querySelectorAll('img[src*="object_imagegen_missing"]')).toHaveLength(0)
  })

  test("stages a presented image with its exact local path when Edit image is selected", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = input instanceof Request ? input.method : (init?.method ?? "GET")

      if (
        method === "GET" &&
        url.includes("/api/objects/media-presentation/object_edit/items/item_1/availability")
      ) {
        return Response.json({ status: "available", message: null })
      }
      if (
        method === "GET" &&
        url.includes("/api/objects/media-presentation/object_edit/raw/item_1")
      ) {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { "content-type": "image/png" },
        })
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
                objectID: "object_edit",
                layout: "single",
                items: [
                  {
                    path: "generated/edit-me.png",
                    absolutePath: "/repo/generated/edit-me.png",
                    fileName: "edit-me.png",
                    mediaKind: "image",
                    renderMode: "image",
                    rawUrl:
                      "/api/objects/media-presentation/object_edit/raw/item_1?directory=%2Frepo&fileName=edit-me.png",
                  },
                ],
              })}
              tool="present_media"
              canEditImages
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })
    await waitForEffect(() => container.querySelector("img") !== null)
    await act(async () => {
      for (const image of container.querySelectorAll("img")) {
        image.dispatchEvent(new Event("load", { bubbles: true }))
      }
      await flushEffects()
    })

    const editButton = container.querySelector<HTMLButtonElement>('button[aria-label="Edit image"]')
    expect(editButton).not.toBeNull()

    await act(async () => {
      editButton?.click()
      await flushEffects()
    })
    const promptKey = getPromptScopeKey("/repo", "ses_media")
    await waitForEffect(
      () => getPromptDraft(usePromptStore.getState(), promptKey).attachments.length === 1,
    )

    const attachment = getPromptDraft(usePromptStore.getState(), promptKey).attachments[0]
    expect(attachment?.filename).toBe("edit-me.png")
    expect(attachment?.mime).toBe("image/png")
    expect(attachment?.kind).toBe("image")
    expect(attachment?.localPath).toBe("/repo/generated/edit-me.png")
    expect(attachment?.editTarget).toBe(true)
    expect(attachment?.dataUrl).toStartWith("data:image/png;base64,")
  })

  test("renders a gallery for multiple images", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = input instanceof Request ? input.method : (init?.method ?? "GET")

      if (
        method === "GET" &&
        (url.includes("/api/objects/media-presentation/object_a/items/item_1/availability") ||
          url.includes("/api/objects/media-presentation/object_a/items/item_2/availability"))
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
                objectID: "object_a",
                layout: "gallery",
                items: [
                  {
                    path: "generated/a.png",
                    fileName: "a.png",
                    mediaKind: "image",
                    renderMode: "image",
                    rawUrl:
                      "/api/objects/media-presentation/object_a/raw/item_1?directory=%2Frepo&fileName=a.png",
                  },
                  {
                    path: "generated/b.png",
                    fileName: "b.png",
                    mediaKind: "image",
                    renderMode: "image",
                    rawUrl:
                      "/api/objects/media-presentation/object_a/raw/item_2?directory=%2Frepo&fileName=b.png",
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
        return url.includes("/api/objects/media-presentation/object_a/raw/") && method !== "HEAD"
      }).length,
    ).toBe(0)
  })

  test("renders MIME-typed video items with the inline player", async () => {
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (
          method === "GET" &&
          url.includes("/api/objects/media-presentation/object_video/items/item_1/availability")
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
                objectID: "object_video",
                layout: "single",
                items: [
                  {
                    path: "generated/demo.mp4",
                    fileName: "demo.mp4",
                    mediaKind: "video",
                    mimeType: "video/mp4",
                    renderMode: "video",
                    rawUrl:
                      "/api/objects/media-presentation/object_video/raw/item_1?directory=%2Frepo&fileName=demo.mp4",
                  },
                ],
              })}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })
    await waitForEffect(() => container.querySelector("video") !== null)

    expect(container.querySelector("video")?.getAttribute("src")).toContain(
      "/api/objects/media-presentation/object_video/raw/item_1",
    )
    expect(container.querySelector('button[aria-label="Open on Bench"]')).not.toBeNull()
  })

  test("renders MIME-typed audio without legacy group headers", async () => {
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (
          method === "GET" &&
          url.includes("/api/objects/media-presentation/object_mixed/items/item_1/availability")
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
                objectID: "object_mixed",
                layout: "single",
                items: [
                  {
                    path: "generated/demo.mp3",
                    fileName: "demo.mp3",
                    mediaKind: "audio",
                    mimeType: "audio/mpeg",
                    renderMode: "audio",
                    rawUrl:
                      "/api/objects/media-presentation/object_mixed/raw/item_1?directory=%2Frepo&fileName=demo.mp3",
                  },
                ],
              })}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })
    await waitForEffect(() => container.querySelector("audio") !== null)

    expect(container.querySelector("audio")?.getAttribute("src")).toContain(
      "/api/objects/media-presentation/object_mixed/raw/item_1",
    )
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
          url.includes("/api/objects/media-presentation/object_notes/items/item_1/availability") &&
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
                objectID: "object_notes",
                layout: "list",
                items: [
                  {
                    path: "generated/notes.pdf",
                    fileName: "notes.pdf",
                    mediaKind: "pdf",
                    renderMode: "pdf",
                    rawUrl:
                      "/api/objects/media-presentation/object_notes/raw/item_1?directory=%2Frepo&fileName=notes.pdf",
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
    expect(mediaFileRows(container).length).toBe(1)
  })

  test("opens workspace PDFs with the Buddy reader opener instead of the default app", async () => {
    const openPath = mock(async () => {})
    const onOpenResource = mock(() => {})
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (
          method === "GET" &&
          url.includes("/api/objects/media-presentation/object_reader/items/item_1/availability") &&
          url.includes("directory=%2Frepo")
        ) {
          return Response.json({ status: "available", message: null })
        }

        if (method === "GET" && url.includes("/api/objects/resource")) {
          return Response.json({ resources: [] })
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
                objectID: "object_reader",
                layout: "list",
                items: [
                  {
                    path: "generated/notes.pdf",
                    absolutePath: "/repo/generated/notes.pdf",
                    fileName: "notes.pdf",
                    mediaKind: "pdf",
                    renderMode: "pdf",
                    rawUrl:
                      "/api/objects/media-presentation/object_reader/raw/item_1?directory=%2Frepo&fileName=notes.pdf",
                  },
                ],
              })}
              onOpenResource={onOpenResource}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })

    const row = firstMediaFileRow(container)
    expect(row).not.toBeNull()

    await act(async () => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flushEffects()
    })

    expect(onOpenResource).toHaveBeenCalledWith("/repo", {
      path: "generated/notes.pdf",
      name: "notes.pdf",
    })
    expect(openPath).not.toHaveBeenCalled()
  })

  test("hides PDF processing actions until resources load", async () => {
    const pendingResponses: Array<() => void> = []
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = input instanceof Request ? input.method : (init?.method ?? "GET")

      if (
        method === "GET" &&
        url.includes("/api/objects/media-presentation/object_notes/items/item_1/availability") &&
        url.includes("directory=%2Frepo")
      ) {
        return Response.json({ status: "available", message: null })
      }

      if (method === "GET" && url.includes("/api/find/file")) {
        return createPendingJsonResponse({ pendingResponses, body: [] })
      }

      if (method === "GET" && url.includes("/api/objects/resource")) {
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
                objectID: "object_notes",
                layout: "list",
                items: [
                  {
                    path: "generated/notes.pdf",
                    fileName: "notes.pdf",
                    mediaKind: "pdf",
                    renderMode: "pdf",
                    rawUrl:
                      "/api/objects/media-presentation/object_notes/raw/item_1?directory=%2Frepo&fileName=notes.pdf",
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
        return method === "POST" && url.includes("/api/objects/resource")
      }),
    ).toBe(false)

    for (const resolvePending of pendingResponses) {
      resolvePending()
    }

    await act(async () => {
      await flushEffects()
    })

    expect(container.textContent).toContain("notes.pdf")
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
          url.includes("/api/objects/media-presentation/object_b/items/item_1/availability") &&
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
                objectID: "object_b",
                layout: "list",
                items: [
                  {
                    path: "/tmp/notes.pdf",
                    absolutePath: "/tmp/notes.pdf",
                    fileName: "notes.pdf",
                    mediaKind: "pdf",
                    renderMode: "pdf",
                    rawUrl:
                      "/api/objects/media-presentation/object_b/raw/item_1?directory=%2Frepo&fileName=notes.pdf",
                    canOpenInBuddy: false,
                  },
                ],
              })}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })

    const row = firstMediaFileRow(container)
    expect(row).not.toBeNull()

    await act(async () => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flushEffects()
    })

    expect(container.textContent).toContain("notes.pdf")
    expect(container.textContent).toContain("Outside notebook")
    expect(mediaFileRows(container).length).toBe(1)
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
          url.includes("/api/objects/media-presentation/object_deck/items/item_1/availability") &&
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
                objectID: "object_deck",
                layout: "list",
                items: [
                  {
                    path: "generated/deck.pptx",
                    absolutePath: "/repo/generated/deck.pptx",
                    fileName: "deck.pptx",
                    mediaKind: "presentation",
                    renderMode: "file",
                    rawUrl:
                      "/api/objects/media-presentation/object_deck/raw/item_1?directory=%2Frepo&fileName=deck.pptx",
                  },
                ],
              })}
            />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })

    const row = firstMediaFileRow(container)
    expect(row).not.toBeNull()

    await act(async () => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flushEffects()
    })

    expect(openPath).toHaveBeenCalledWith("/repo/generated/deck.pptx")
  })

  test("does not fetch blobs for unavailable image items", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url

      const method = input instanceof Request ? input.method : (init?.method ?? "GET")

      if (
        method === "GET" &&
        url.includes("/api/objects/media-presentation/object_missing/items/item_1/availability")
      ) {
        return Response.json({ status: "missing", message: "File not found" })
      }

      if (url.includes("/api/objects/media-presentation/object_missing/raw/item_1")) {
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
                objectID: "object_missing",
                layout: "single",
                items: [
                  {
                    path: "/tmp/screenshot.png",
                    absolutePath: "/tmp/screenshot.png",
                    fileName: "screenshot.png",
                    mediaKind: "image",
                    renderMode: "image",
                    rawUrl:
                      "/api/objects/media-presentation/object_missing/raw/item_1?directory=%2Frepo&fileName=screenshot.png",
                    canOpenInBuddy: false,
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
    expect(mediaFileRows(container).length).toBe(1)
    expect(
      fetchMock.mock.calls.filter(([input, init]) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")
        return (
          url.includes("/api/objects/media-presentation/object_missing/raw/item_1") &&
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
          url.includes("/api/objects/media-presentation/object_huge/items/item_1/availability") &&
          url.includes("directory=%2Frepo")
        ) {
          return Response.json({ status: "available", message: null })
        }

        if (
          url.includes("/api/objects/media-presentation/object_huge/raw/item_1") &&
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
                objectID: "object_huge",
                layout: "single",
                items: [
                  {
                    path: "/tmp/huge.png",
                    absolutePath: "/tmp/huge.png",
                    fileName: "huge.png",
                    mediaKind: "other",
                    renderMode: "file",
                    sizeBytes: 1024 * 1024 * 1024,
                    rawUrl:
                      "/api/objects/media-presentation/object_huge/raw/item_1?directory=%2Frepo&fileName=huge.png",
                    canOpenInBuddy: false,
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
    expect(mediaFileRows(container).length).toBe(1)
  })

  test("keeps non-previewable image siblings visible beside previewable images", async () => {
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (
          method === "GET" &&
          (url.includes("/api/objects/media-presentation/object_combo/items/item_1/availability") ||
            url.includes(
              "/api/objects/media-presentation/object_combo/items/item_2/availability",
            )) &&
          url.includes("directory=%2Frepo")
        ) {
          return Response.json({ status: "available", message: null })
        }

        if (
          url.includes("/api/objects/media-presentation/object_combo/raw/item_1") &&
          method !== "HEAD"
        ) {
          return new Response("previewable", { status: 200 })
        }

        if (
          url.includes("/api/objects/media-presentation/object_combo/raw/item_2") &&
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
                objectID: "object_combo",
                layout: "gallery",
                items: [
                  {
                    path: "generated/a.png",
                    fileName: "a.png",
                    mediaKind: "image",
                    renderMode: "image",
                    rawUrl:
                      "/api/objects/media-presentation/object_combo/raw/item_1?directory=%2Frepo&fileName=a.png",
                    sizeBytes: 42,
                  },
                  {
                    path: "generated/huge.png",
                    absolutePath: "/tmp/huge.png",
                    fileName: "huge.png",
                    mediaKind: "other",
                    renderMode: "file",
                    rawUrl:
                      "/api/objects/media-presentation/object_combo/raw/item_2?directory=%2Frepo&fileName=huge.png",
                    canOpenInBuddy: false,
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
    expect(mediaFileRows(container).length).toBe(1)
  })

  test("fades unavailable object-backed items instead of retrying path resolution", async () => {
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (
          method === "GET" &&
          url.includes("/api/objects/media-presentation/object_stale/items/item_1/availability") &&
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
                objectID: "object_stale",
                layout: "list",
                items: [
                  {
                    path: "/tmp/notes.pdf",
                    absolutePath: "/tmp/notes.pdf",
                    fileName: "notes.pdf",
                    mediaKind: "pdf",
                    renderMode: "pdf",
                    rawUrl:
                      "/api/objects/media-presentation/object_stale/raw/item_1?directory=%2Frepo&fileName=notes.pdf",
                    canOpenInBuddy: false,
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

    const row = firstMediaFileRow(container)

    expect(row?.getAttribute("data-status")).toBe("error")
    expect(
      row
        ?.querySelector('[data-component="media-file-row-content"]')
        ?.className.includes("opacity-50"),
    ).toBe(true)
    expect(container.textContent).toContain("notes.pdf")
  })
})
