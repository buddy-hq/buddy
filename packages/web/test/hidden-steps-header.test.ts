import { describe, expect, test } from "bun:test"

import {
  resolveHiddenStepsHeader,
  type HiddenStepsEntry,
} from "../src/components/chat/tools/hidden-steps/entries"
import type { ToolIconRenderer } from "../src/components/chat/tools/tool-registry-types"

const READ_ICON: ToolIconRenderer = () => null
const STANDARD_ICON: ToolIconRenderer = () => null

function toolEntry(input: {
  id: string
  title: string
  status: "completed" | "running"
  icon: ToolIconRenderer
}): HiddenStepsEntry {
  return {
    part: {
      id: input.id,
      sessionID: "ses_header",
      messageID: "msg_header",
      type: "tool",
    },
    state: {
      status: input.status,
      input: {},
      metadata: {},
      attachments: [],
    },
    info: { title: input.title },
    icon: input.icon,
  }
}

describe("hidden steps header", () => {
  test("pairs an active reasoning label with the reasoning fallback icon", () => {
    const header = resolveHiddenStepsHeader(
      [
        toolEntry({ id: "read", title: "Read", status: "completed", icon: READ_ICON }),
        {
          part: {
            id: "reasoning",
            sessionID: "ses_header",
            messageID: "msg_header",
            type: "reasoning",
            text: "",
            time: { start: 1 },
          },
        },
      ],
      true,
    )

    expect(header.label).toBe("Thinking")
    expect(header.icon).toBeUndefined()
  })

  test("pairs an active tool label with that tool's icon", () => {
    const header = resolveHiddenStepsHeader(
      [
        toolEntry({ id: "read", title: "Read", status: "completed", icon: READ_ICON }),
        toolEntry({
          id: "standard",
          title: "Get Standard",
          status: "running",
          icon: STANDARD_ICON,
        }),
      ],
      true,
    )

    expect(header.label).toBe("Get Standard")
    expect(header.icon).toBe(STANDARD_ICON)
  })
})
