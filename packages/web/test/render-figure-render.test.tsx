import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { GroupedFigureToolCard } from "../src/components/chat/tools/render/render-figure"
import type { TJsonObject } from "../src/components/chat/tools/types"
import type { MessagePart } from "../src/state/chat-types"

function renderHarness(root: Root, element: ReactNode) {
  const rootRoute = createRootRoute({
    component: () => <>{element}</>,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: ["/"],
    }),
  })

  root.render(<RouterProvider router={router} />)
}

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function createFigureToolPart(input: {
  id: string
  tool?: "render_figure" | "render_freeform_figure"
  state: {
    status: "completed" | "error"
    input: Record<string, never>
    metadata?: TJsonObject
    attachments?: []
    output?: string
    error?: string
  }
}): MessagePart {
  return {
    id: input.id,
    sessionID: "ses_figure",
    messageID: "msg_figure",
    callID: `call_${input.id}`,
    type: "tool",
    tool: input.tool ?? "render_figure",
    state: {
      attachments: [],
      metadata: {},
      output: "",
      ...input.state,
    },
  }
}

describe("render figure renderer", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("keeps invalid grouped figures visible as placeholders", async () => {
    const invalidFigure = createFigureToolPart({
      id: "prt_invalid_figure",
      state: {
        status: "error",
        input: {},
        error: "failed",
      },
    })
    const validFigure = createFigureToolPart({
      id: "prt_valid_figure",
      state: {
        status: "completed",
        input: {},
        metadata: {
          buddyObjectResult: {
            version: 1,
            status: "ok",
            reason: null,
            message: "Rendered figure.",
            primaryRef: {
              kind: "figure",
              objectID: "figure_1",
              revisionID: "revision_1",
              itemID: null,
            },
            objects: [
              {
                kind: "figure",
                objectID: "figure_1",
                title: "Valid figure",
                status: "ready",
                lifecycle: "revisioned",
                sourceRoot: null,
              },
            ],
            presentations: [
              {
                ref: {
                  kind: "figure",
                  objectID: "figure_1",
                  revisionID: "revision_1",
                  itemID: null,
                },
                viewID: "rendered",
                surface: "inline",
                data: {
                  renderer: "figure",
                  svgUrl: "https://placehold.co/320x180/svg",
                  source: null,
                  alt: "Valid figure",
                  caption: null,
                  renderStatus: "ready",
                },
                autoOpen: null,
              },
            ],
          },
        },
      },
    })

    await act(async () => {
      renderHarness(root, <GroupedFigureToolCard parts={[invalidFigure, validFigure]} />)
      await flushEffects()
    })

    expect(container.querySelector("button[disabled]")).not.toBeNull()
    expect(container.querySelectorAll("img").length).toBeGreaterThan(0)
  })
})
