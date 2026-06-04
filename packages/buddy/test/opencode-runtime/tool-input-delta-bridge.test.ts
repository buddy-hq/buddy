import fs from "node:fs/promises"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { MessageID, PartID, SessionID } from "@buddy/opencode-adapter/id"
import {
  resetPendingWhiteboardToolPartsForTest,
  toPendingWhiteboardToolPartDelta,
  trackPendingWhiteboardToolPart,
} from "@buddy/opencode-adapter/tool-input-delta-live"
import type { MessageV2 } from "@buddy/opencode-adapter/message"

const WHITEBOARD_CREATE_VIEW_TOOL_ID = "whiteboard_create_view" as const
const VENDOR_SESSION_ROOT = path.resolve(
  import.meta.dir,
  "../../../../vendor/opencode/packages/opencode/src/session",
)
const BUDDY_RUNTIME_PATH = path.resolve(import.meta.dir, "../../src/opencode-runtime/runtime.ts")
const TOOL_INPUT_DELTA_BRIDGE_PATH = path.resolve(
  import.meta.dir,
  "../../../opencode-adapter/src/tool-input-delta-live.ts",
)

afterEach(() => {
  resetPendingWhiteboardToolPartsForTest()
})

function pendingWhiteboardToolPart(): MessageV2.ToolPart {
  return {
    id: PartID.ascending(),
    sessionID: SessionID.make("ses_whiteboard_delta"),
    messageID: MessageID.ascending(),
    type: "tool",
    tool: WHITEBOARD_CREATE_VIEW_TOOL_ID,
    callID: "call_whiteboard_delta",
    state: {
      status: "pending",
      input: {},
      raw: "",
    },
  }
}

describe("whiteboard tool-input delta bridge", () => {
  test("pins the upstream normalized delta and processor discard assumptions", async () => {
    const [aiSdkSource, processorSource] = await Promise.all([
      fs.readFile(path.join(VENDOR_SESSION_ROOT, "llm/ai-sdk.ts"), "utf8"),
      fs.readFile(path.join(VENDOR_SESSION_ROOT, "processor.ts"), "utf8"),
    ])

    expect(aiSdkSource).toContain('case "tool-input-delta":')
    expect(aiSdkSource).toContain("LLMEvent.toolInputDelta({")
    expect(aiSdkSource).toContain("name: state.toolNames[event.id] ??")
    expect(aiSdkSource).toContain("text: event.delta ??")
    expect(processorSource).toContain('case "tool-input-delta":')
    expect(processorSource).toContain(
      "delta fragments into `state.raw` is redundant work for no current consumer.",
    )
  })

  test("wires both sides of the bridge before server startup without opening runtime state", async () => {
    const [runtimeSource, bridgeSource] = await Promise.all([
      fs.readFile(BUDDY_RUNTIME_PATH, "utf8"),
      fs.readFile(TOOL_INPUT_DELTA_BRIDGE_PATH, "utf8"),
    ])
    const bridgeInstallIndex = runtimeSource.indexOf("await ensureToolInputDeltaBridgePatched()")
    const serverStartupIndex = runtimeSource.indexOf("const built = await Server.Default()")

    expect(bridgeInstallIndex).toBeGreaterThan(-1)
    expect(serverStartupIndex).toBeGreaterThan(bridgeInstallIndex)
    expect(bridgeSource).toContain("patchSessionService(session)")
    expect(bridgeSource).toContain("patchLlmService(llm, session)")
    expect(bridgeSource).toContain('await import("./app-runtime")')
    expect(bridgeSource).not.toContain("OPENCODE_APP_RUNTIME_MODULE_ID")
  })

  test("translates the upstream normalized whiteboard delta into the pending nested raw field", () => {
    const part = pendingWhiteboardToolPart()
    trackPendingWhiteboardToolPart(part)

    expect(
      toPendingWhiteboardToolPartDelta({
        sessionID: part.sessionID,
        event: {
          type: "tool-input-delta",
          id: part.callID,
          name: WHITEBOARD_CREATE_VIEW_TOOL_ID,
          text: '{"elements":"[',
        },
      }),
    ).toEqual({
      sessionID: part.sessionID,
      messageID: part.messageID,
      partID: part.id,
      field: "state.raw",
      delta: '{"elements":"[',
    })
  })

  test("ignores other tools and stops forwarding after the whiteboard tool leaves pending state", () => {
    const part = pendingWhiteboardToolPart()
    trackPendingWhiteboardToolPart(part)

    expect(
      toPendingWhiteboardToolPartDelta({
        sessionID: part.sessionID,
        event: {
          type: "tool-input-delta",
          id: part.callID,
          name: "render_mermaid",
          text: "ignored",
        },
      }),
    ).toBeUndefined()

    trackPendingWhiteboardToolPart({
      ...part,
      state: {
        status: "running",
        input: {},
        time: { start: Date.now() },
      },
    })

    expect(
      toPendingWhiteboardToolPartDelta({
        sessionID: part.sessionID,
        event: {
          type: "tool-input-delta",
          id: part.callID,
          name: WHITEBOARD_CREATE_VIEW_TOOL_ID,
          text: "ignored",
        },
      }),
    ).toBeUndefined()
  })

  test("ignores malformed upstream events", () => {
    const part = pendingWhiteboardToolPart()
    trackPendingWhiteboardToolPart(part)

    expect(
      toPendingWhiteboardToolPartDelta({
        sessionID: part.sessionID,
        event: {
          type: "tool-input-delta",
          id: part.callID,
          name: WHITEBOARD_CREATE_VIEW_TOOL_ID,
        },
      }),
    ).toBeUndefined()
  })
})
