import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { GroupedFigureToolCard } from "../src/components/chat/tools/render/render-figure"
import type { MessagePart } from "../src/state/chat-types"

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
    metadata?: Record<string, unknown>
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
          artifact: "RenderFigureOutput",
          value: {
            figureID: "fig_1",
            mime: "image/svg+xml",
            url: "https://placehold.co/320x180/svg",
            alt: "Valid figure",
            repairAttempts: 0,
          },
        },
      },
    })

    await act(async () => {
      root.render(<GroupedFigureToolCard parts={[invalidFigure, validFigure]} />)
      await flushEffects()
    })

    expect(container.querySelector("button[disabled]")).not.toBeNull()
    expect(container.querySelectorAll("img").length).toBeGreaterThan(0)
  })
})
