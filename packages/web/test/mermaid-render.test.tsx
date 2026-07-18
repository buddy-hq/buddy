import { afterEach, describe, expect, mock, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { DottedGlowLoading } from "../src/components/media/loading/dotted-glow"
import {
  resolveGroupedMermaidDefaultIndex,
  shouldStartMermaidAutoRepair,
} from "../src/components/media/renderers/mermaid"
import { createMermaidLoadingState } from "../src/components/media/renderers/mermaid/loading-state"
import {
  MERMAID_RENDER_CONFIG_VERSION,
  MERMAID_RENDERER_VERSION,
  readCachedMermaidSvg,
  renderMermaidSvg,
} from "../src/components/media/renderers/mermaid/lib/render"
import { startMermaidAutoRepair } from "../src/components/media/renderers/mermaid/lib/persisted-renders"
import { scheduleMermaidRender } from "../src/components/media/renderers/mermaid/lib/scheduler"
import type { MessagePart } from "../src/state/chat-types"

const originalFetch = globalThis.fetch
const MERMAID_OBJECT_ID = "object_1"
const MERMAID_REVISION_ID = "revision_1"

function createMermaidObjectResult(input: {
  objectID: string
  revisionID: string
  source: string
}) {
  const ref = {
    kind: "mermaid",
    objectID: input.objectID,
    revisionID: input.revisionID,
    itemID: null,
  } as const

  return {
    buddyObjectResult: {
      version: 1,
      status: "ok",
      reason: null,
      message: "Rendered Mermaid diagram.",
      primaryRef: ref,
      objects: [
        {
          kind: "mermaid",
          objectID: input.objectID,
          title: "Mermaid diagram",
          status: "ready",
          lifecycle: "revisioned",
          sourceRoot: null,
        },
      ],
      presentations: [
        {
          ref,
          viewID: "rendered",
          surface: "inline",
          data: {
            renderer: "mermaid",
            source: input.source,
            svgUrl: null,
            alt: "Mermaid diagram",
            caption: null,
            renderStatus: "ready",
            failedRenderKey: null,
          },
          autoOpen: null,
        },
      ],
    },
  }
}

afterEach(() => {
  globalThis.fetch = originalFetch
  Reflect.deleteProperty(globalThis, "__BUDDY_TEST_MERMAID_RUNTIME__")
})

describe("mermaid render pipeline", () => {
  test("uses dotted glow while Mermaid media is loading", () => {
    expect(createMermaidLoadingState()).toEqual({
      status: "loading",
      variant: "dotted-glow",
    })
  })

  test("uses the Mermaid media surface behind dotted glow", () => {
    const markup = renderToStaticMarkup(<DottedGlowLoading />)

    expect(markup).toContain("bg-background-base")
  })

  test("selects the latest renderable grouped Mermaid part by default", () => {
    const parts = [
      {
        id: "part_error",
        sessionID: "ses_test",
        messageID: "msg_test",
        type: "tool",
        tool: "render_mermaid",
        state: {
          status: "error",
          input: {
            source: "flowchart LR\nA-->B",
          },
          error: "Mermaid object was not found.",
        },
      },
      {
        id: "part_completed",
        sessionID: "ses_test",
        messageID: "msg_test",
        type: "tool",
        tool: "render_mermaid",
        state: {
          status: "completed",
          input: {},
          metadata: {
            ...createMermaidObjectResult({
              objectID: MERMAID_OBJECT_ID,
              revisionID: MERMAID_REVISION_ID,
              source: "flowchart LR\nA-->B",
            }),
          },
        },
      },
    ] satisfies MessagePart[]

    expect(resolveGroupedMermaidDefaultIndex(parts)).toBe(1)
  })

  test("keeps grouped Mermaid selection on the first item when no part completed", () => {
    const parts = [
      {
        id: "part_error",
        sessionID: "ses_test",
        messageID: "msg_test",
        type: "tool",
        tool: "render_mermaid",
        state: {
          status: "error",
          input: {
            source: "flowchart LR\nA-->B",
          },
          error: "Mermaid object was not found.",
        },
      },
    ] satisfies MessagePart[]

    expect(resolveGroupedMermaidDefaultIndex(parts)).toBe(0)
  })

  test("rejects empty source early", async () => {
    await expect(renderMermaidSvg({ source: "   " })).rejects.toThrow("Diagram source is empty.")
  })

  test("does not return cached svg for empty source", () => {
    expect(readCachedMermaidSvg({ source: "   " })).toBeUndefined()
  })

  test("starts auto repair for persisted failed renders when the object is eligible", () => {
    expect(
      shouldStartMermaidAutoRepair({
        directory: "/repo",
        object: {
          origin: {
            kind: "tool",
            sessionID: "ses_test",
            messageID: "msg_test",
            callID: "render_mermaid:0",
          },
          autoRepair: {
            status: "eligible",
            attempts: 0,
          },
        },
        renderFailure: {
          message: "Failed before reload",
          persisted: true,
          renderKey: "render_key",
        },
      }),
    ).toBe(true)
  })

  test("keeps a successful browser render when storing the persisted record fails", async () => {
    globalThis.__BUDDY_TEST_MERMAID_RUNTIME__ = {
      initialize: () => {},
      render: async () => ({
        svg: '<svg xmlns="http://www.w3.org/2000/svg"><g class="node"></g></svg>',
      }),
    }

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method ?? (input instanceof Request ? input.method : undefined) ?? "GET"
      if (
        url.includes("/api/objects/mermaid/object_1/render-record") &&
        method.toUpperCase() === "GET"
      ) {
        return new Response(JSON.stringify({ renderKey: "resolved_key" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }
      if (
        url.includes("/api/objects/mermaid/object_1/render-record") &&
        method.toUpperCase() === "PUT"
      ) {
        expect(url).toContain(`rendererVersion=${encodeURIComponent(MERMAID_RENDERER_VERSION)}`)
        expect(url).toContain(`renderConfigVersion=${MERMAID_RENDER_CONFIG_VERSION}`)
        return new Response(JSON.stringify({ renderKey: "abc123" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as unknown as typeof fetch

    const result = await renderMermaidSvg({
      objectID: "object_1",
      revisionID: "revision_1",
      directory: "/repo",
      priority: 0,
      source: "graph TD\nA-->B",
    })

    expect(result.svg).toContain("<svg")
    expect(result.contrastAdjustments).toEqual([])
    expect(result.renderKey).toBeUndefined()
    expect(
      readCachedMermaidSvg({
        objectID: "object_1",
        revisionID: "revision_1",
        source: "graph TD\nA-->B",
      }),
    ).toEqual(result)
  })

  test("dedupes concurrent auto-repair requests for the same object", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      if (!url.includes("/api/session/ses_test/mermaid-repair-async")) {
        throw new Error(`Unexpected fetch: ${url}`)
      }
      return new Response(
        JSON.stringify({ repairRequestID: "msg_buddy_mermaid_auto_repair_1", status: "running" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )
    }) as unknown as typeof fetch

    const [first, second] = await Promise.all([
      startMermaidAutoRepair({
        objectID: "object_1",
        directory: "/repo",
        failedRenderKey: "render_key_1",
        sessionID: "ses_test",
      }),
      startMermaidAutoRepair({
        objectID: "object_1",
        directory: "/repo",
        failedRenderKey: "render_key_1",
        sessionID: "ses_test",
      }),
    ])

    expect(first).toEqual(second)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  test("preserves the browser syntax error when failed-record persistence also fails", async () => {
    globalThis.__BUDDY_TEST_MERMAID_RUNTIME__ = {
      initialize: () => {},
      render: async () => {
        throw new Error("Parse error on line 2")
      },
    }

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method ?? (input instanceof Request ? input.method : undefined) ?? "GET"
      if (
        url.includes("/api/objects/mermaid/object_2/render-record") &&
        method.toUpperCase() === "GET"
      ) {
        return new Response(JSON.stringify({ renderKey: "resolved_key" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }
      if (
        url.includes("/api/objects/mermaid/object_2/render-record") &&
        method.toUpperCase() === "PUT"
      ) {
        return new Response(JSON.stringify({ error: "cache write failed" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as unknown as typeof fetch

    await expect(
      renderMermaidSvg({
        objectID: "object_2",
        revisionID: "revision_2",
        directory: "/repo",
        priority: 0,
        source: "graph TD\nA-->",
      }),
    ).rejects.toMatchObject({
      message: "Parse error on line 2",
      renderKey: undefined,
    })
  })

  test("promotes an already queued render to a higher priority", async () => {
    let releaseFirst: (() => void) | undefined
    const firstStarted = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const executionOrder: string[] = []

    const first = scheduleMermaidRender({
      key: "low-priority",
      priority: 1,
      run: async () => {
        executionOrder.push("low")
        await firstStarted
        return "low"
      },
    })

    const second = scheduleMermaidRender({
      key: "other-low-priority",
      priority: 1,
      run: async () => {
        executionOrder.push("other")
        return "other"
      },
    })

    const promoted = scheduleMermaidRender({
      key: "other-low-priority",
      priority: 0,
      run: async () => {
        executionOrder.push("promoted")
        return "promoted"
      },
    })

    releaseFirst?.()

    await expect(first).resolves.toBe("low")
    await expect(promoted).resolves.toBe("other")
    await expect(second).resolves.toBe("other")
    expect(executionOrder).toEqual(["low", "other"])
  })
})
