import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  BENCH_CHAT_LAYOUT_DOCKED,
  type BenchTarget,
  type OpenBenchResult,
} from "../src/lib/bench-navigation"
import {
  WhiteboardBenchAutoOpen,
  resolveWhiteboardBenchAutoOpenResult,
  shouldStartWhiteboardBenchAutoOpen,
  whiteboardBenchAutoOpenIdentity,
  whiteboardBenchTargetFromObjectID,
} from "../src/components/whiteboard/whiteboard-bench-auto-open"
import { useLiveWhiteboardMessages } from "../src/components/whiteboard/whiteboard-live-messages"
import { buildProgressiveWhiteboardPreviewFromMessages } from "../src/components/whiteboard/whiteboard-progressive"
import {
  TransientBenchSurfaceProvider,
  type TransientBenchSurface,
} from "../src/components/bench/transient-bench-surface"
import type { AssistantMessageInfo, MessageWithParts } from "../src/state/chat-types"
import {
  applyTranscriptMessageUpdated,
  applyTranscriptPartDelta,
  applyTranscriptPartUpdated,
  getTranscriptMessages,
  resetTranscriptRepositoryForTests,
} from "../src/state/transcript-repository"
import {
  BENCH_ROUTE_STATUS_OPEN,
  DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
  createCollapsedWorkspaceState,
  createExpandedWorkspaceState,
  effectiveWorkspaceProjection,
  type BenchRouteSnapshot,
} from "../src/state/directory-workspace-store"

const ACTIVE_TOOL_KEY = "message-1:part-1"
const SESSION_ID = "session-1"
const DIRECTORY = "/repo"
const WHITEBOARD_TARGET = whiteboardBenchTargetFromObjectID("whiteboard-object-1")

let container: HTMLDivElement | undefined
let root: Root | undefined

function createAssistantMessage(state: Record<string, unknown>): MessageWithParts {
  const info = {
    id: "message-1",
    sessionID: SESSION_ID,
    role: "assistant",
    parentID: "message-0",
    time: { created: 1 },
    mode: "buddy",
    agent: "buddy",
    modelID: "model-1",
    providerID: "provider-1",
    path: { cwd: "", root: "" },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
  } satisfies AssistantMessageInfo
  return {
    info,
    parts: [
      {
        id: "part-1",
        callID: "call-1",
        sessionID: SESSION_ID,
        messageID: "message-1",
        type: "tool",
        tool: "whiteboard_create_view",
        state,
      },
    ],
  }
}

function committedOpenResult(input: { visible: boolean }): OpenBenchResult {
  const route = {
    status: BENCH_ROUTE_STATUS_OPEN,
    target: WHITEBOARD_TARGET,
    mode: BENCH_CHAT_LAYOUT_DOCKED,
  } satisfies BenchRouteSnapshot
  return {
    outcome: "committed",
    changed: false,
    decision: { action: "ignore", policyID: "already-open" },
    projection: effectiveWorkspaceProjection(
      route,
      {
        docked: input.visible
          ? createExpandedWorkspaceState(null)
          : createCollapsedWorkspaceState(),
        lastDrawer: DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
      },
      null,
    ),
  }
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  container?.remove()
  root = undefined
  container = undefined
  resetTranscriptRepositoryForTests()
})

function LiveWhiteboardPreviewProbe(props: { messages: MessageWithParts[] }) {
  const messages = useLiveWhiteboardMessages(props.messages)
  const preview = buildProgressiveWhiteboardPreviewFromMessages({
    messages,
    baseElements: [],
  })
  return <output>{preview?.elements.map((element) => element.id).join(",")}</output>
}

describe("whiteboard Bench auto-open", () => {
  test("starts once for an active whiteboard tool key", () => {
    expect(
      shouldStartWhiteboardBenchAutoOpen({
        activeToolKey: ACTIVE_TOOL_KEY,
        sessionID: SESSION_ID,
        handledToolKeys: new Set(),
        inFlightToolKey: undefined,
      }),
    ).toBe(true)

    expect(
      shouldStartWhiteboardBenchAutoOpen({
        activeToolKey: ACTIVE_TOOL_KEY,
        sessionID: SESSION_ID,
        handledToolKeys: new Set([ACTIVE_TOOL_KEY]),
        inFlightToolKey: undefined,
      }),
    ).toBe(false)

    expect(
      shouldStartWhiteboardBenchAutoOpen({
        activeToolKey: ACTIVE_TOOL_KEY,
        sessionID: SESSION_ID,
        handledToolKeys: new Set(),
        inFlightToolKey: ACTIVE_TOOL_KEY,
      }),
    ).toBe(false)
  })

  test("builds a Bench target directly from the whiteboard object id", () => {
    const target = {
      type: "object",
      ref: {
        kind: "whiteboard",
        objectID: "whiteboard-object-1",
        revisionID: null,
        itemID: null,
      },
      viewID: "current",
    } satisfies BenchTarget

    expect(whiteboardBenchTargetFromObjectID("whiteboard-object-1")).toEqual(target)
    expect(whiteboardBenchAutoOpenIdentity(ACTIVE_TOOL_KEY)).toEqual({
      policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
      eventKey: ACTIVE_TOOL_KEY,
    })
  })

  test("acknowledges auto-open only after the requested whiteboard is visible", () => {
    expect(
      resolveWhiteboardBenchAutoOpenResult(
        committedOpenResult({ visible: true }),
        WHITEBOARD_TARGET,
      ),
    ).toBe("complete")
    expect(
      resolveWhiteboardBenchAutoOpenResult(
        committedOpenResult({ visible: false }),
        WHITEBOARD_TARGET,
      ),
    ).toBe("retry")
  })

  test("retries transient workspace outcomes and stops on terminal failures", () => {
    const projection = committedOpenResult({ visible: false }).projection
    expect(
      resolveWhiteboardBenchAutoOpenResult(
        {
          outcome: "superseded",
          reason: "newer_command",
          projection,
        },
        WHITEBOARD_TARGET,
      ),
    ).toBe("retry")
    expect(
      resolveWhiteboardBenchAutoOpenResult(
        {
          outcome: "inactive",
          reason: "session_inactive",
          projection,
        },
        WHITEBOARD_TARGET,
      ),
    ).toBe("retry")
    expect(
      resolveWhiteboardBenchAutoOpenResult(
        {
          outcome: "blocked",
          reason: "leave_guard_blocked",
          projection,
        },
        WHITEBOARD_TARGET,
      ),
    ).toBe("stop")
  })

  test("closes a denied new-board preview without reserving a persistent object", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const opened: TransientBenchSurface[] = []
    const closed: TransientBenchSurface[] = []
    const transientValue = {
      activeSurface: null,
      host: null,
      open: (surface: TransientBenchSurface) => {
        opened.push(surface)
      },
      close: (surface: TransientBenchSurface) => {
        closed.push(surface)
      },
    }
    const render = (messages: MessageWithParts[]) => (
      <TransientBenchSurfaceProvider value={transientValue}>
        <WhiteboardBenchAutoOpen
          directory={DIRECTORY}
          sessionID={SESSION_ID}
          messages={messages}
        />
      </TransientBenchSurfaceProvider>
    )

    await act(async () => {
      root?.render(
        render([
          createAssistantMessage({
            status: "running",
            input: { objectID: null },
            raw: '{"objectID":null}',
          }),
        ]),
      )
    })

    expect(opened).toHaveLength(1)
    expect(opened[0]).toEqual({
      type: "whiteboard-opening",
      toolKey: ACTIVE_TOOL_KEY,
    })

    await act(async () => {
      root?.render(
        render([
          createAssistantMessage({
            status: "error",
            input: { objectID: null },
            error: "The user rejected permission to use this specific tool call",
          }),
        ]),
      )
    })

    expect(closed).toEqual([opened[0]])
  })

  test("keeps an existing populated board mounted while an update streams", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const opened: TransientBenchSurface[] = []
    const transientValue = {
      activeSurface: null,
      host: null,
      open: (surface: TransientBenchSurface) => {
        opened.push(surface)
      },
      close: () => {},
    }

    await act(async () => {
      root?.render(
        <TransientBenchSurfaceProvider value={transientValue}>
          <WhiteboardBenchAutoOpen
            directory={DIRECTORY}
            sessionID={SESSION_ID}
            messages={[
              createAssistantMessage({
                status: "running",
                input: { objectID: "whiteboard-object-1" },
                raw: JSON.stringify({
                  objectID: "whiteboard-object-1",
                  elements: JSON.stringify([
                    { type: "rectangle", id: "streamed-node", x: 0, y: 0 },
                  ]),
                }),
              }),
            ]}
          />
        </TransientBenchSurfaceProvider>,
      )
    })

    expect(opened).toHaveLength(0)
  })

  test("renders each completed element from part-level tool deltas", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    const message = createAssistantMessage({
      status: "pending",
      input: {},
      raw: "",
    })
    applyTranscriptMessageUpdated(DIRECTORY, message.info)
    for (const part of message.parts) {
      applyTranscriptPartUpdated(DIRECTORY, part)
    }
    const staleMessages = getTranscriptMessages(DIRECTORY, SESSION_ID)
    const raw = JSON.stringify({
      objectID: null,
      boardAction: "continue_current_board",
      elements: JSON.stringify([
        { type: "rectangle", id: "first", x: 0, y: 0 },
        { type: "rectangle", id: "second", x: 160, y: 0 },
      ]),
    })
    const firstElementBoundary = raw.indexOf("},{") + 1
    expect(firstElementBoundary).toBeGreaterThan(0)

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<LiveWhiteboardPreviewProbe messages={staleMessages} />)
    })
    expect(container.textContent).toBe("")

    await act(async () => {
      applyTranscriptPartDelta(DIRECTORY, {
        sessionID: SESSION_ID,
        messageID: "message-1",
        partID: "part-1",
        field: "state.raw",
        delta: raw.slice(0, firstElementBoundary),
      })
    })
    expect(container.textContent).toBe("first")

    await act(async () => {
      applyTranscriptPartDelta(DIRECTORY, {
        sessionID: SESSION_ID,
        messageID: "message-1",
        partID: "part-1",
        field: "state.raw",
        delta: raw.slice(firstElementBoundary),
      })
    })
    expect(container.textContent).toBe("first,second")
  })
})
