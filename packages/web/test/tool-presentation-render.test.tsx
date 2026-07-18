import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { AssistantPartRenderer } from "../src/components/chat/parts/assistant-part/assistant-part"
import type { MessagePart } from "../src/state/chat-types"
import { inlinePresentation, presentationMetadata } from "./tool-presentation-fixtures"

function toolPart(action: string): MessagePart {
  return {
    id: "tool-presentation-rerender",
    sessionID: "ses_presentation_rerender",
    messageID: "msg_presentation_rerender",
    type: "tool",
    tool: "example_tool",
    callID: "call_presentation_rerender",
    metadata: presentationMetadata(
      inlinePresentation({
        phase: "completed",
        action,
        icon: "tool",
        renderer: "generic",
        layoutRole: "compact-output",
      }),
    ),
    state: {
      status: "completed",
      input: {},
      output: "ok",
      title: "done",
      metadata: {},
      attachments: [],
      time: { start: 1, end: 2 },
    },
  }
}

describe("tool presentation rendering", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("rerenders when only the atomic part presentation snapshot changes", async () => {
    await act(async () => root.render(<AssistantPartRenderer part={toolPart("Generating")} />))
    expect(container.textContent).toContain("Generating")

    await act(async () => root.render(<AssistantPartRenderer part={toolPart("Generated")} />))
    expect(container.textContent).toContain("Generated")
    expect(container.textContent).not.toContain("Generating")
  })
})
