import { describe, expect, test } from "bun:test"
import {
  createBrowserPlatform,
  setRuntimePlatform,
} from "../src/context/platform"
import {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  BENCH_CHAT_LAYOUT_DOCKED,
  benchTargetKey,
  type BenchAutoOpenIdentity,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import {
  DirectoryWorkspaceClientActionLedger,
  readBenchClientActionEvent,
  readBenchClientLeaseEvent,
  type BenchClientActionV2,
} from "../src/lib/directory-workspace-client-actions"
import type { BenchClientActionCompletionDraft } from "../src/lib/directory-workspace-lifecycle"
import {
  BENCH_ROUTE_STATUS_OPEN,
  WORKSPACE_DRAWER_NONE,
  WORKSPACE_VISIBILITY_EXPANDED,
  type DirectoryWorkspaceCommand,
  type DirectoryWorkspaceCommandResult,
  type DrawerKind,
  type EffectiveWorkspaceProjection,
} from "../src/state/directory-workspace-store"

const DIRECTORY = "/workspace/client-actions"
const SESSION_ID = "session-client-actions"
const OTHER_SESSION_ID = "session-other"
const TARGET = {
  type: "workspace-file",
  path: "notes.md",
  viewer: "markdown",
} satisfies BenchTarget
const HTML_WIDGET_TARGET = {
  type: "object",
  ref: {
    kind: "html-widget",
    objectID: "widget-client-actions",
    revisionID: null,
    itemID: null,
  },
  viewID: "runtime",
} satisfies BenchTarget
const WHITEBOARD_TARGET = {
  type: "object",
  ref: {
    kind: "whiteboard",
    objectID: "whiteboard-client-actions",
    revisionID: null,
    itemID: null,
  },
  viewID: "current",
} satisfies BenchTarget

function projectionForTarget(target: BenchTarget): EffectiveWorkspaceProjection {
  return {
    route: {
      status: BENCH_ROUTE_STATUS_OPEN,
      target,
      mode: BENCH_CHAT_LAYOUT_DOCKED,
    },
    dockedState: {
      visibility: WORKSPACE_VISIBILITY_EXPANDED,
      drawer: null,
    },
    bench: {
      visibility: "visible",
      target,
      targetKey: "target-key",
      mode: BENCH_CHAT_LAYOUT_DOCKED,
    },
    drawer: null,
    renderedSurface: "docked-bench",
    pending: { status: "none" },
  }
}

function committedResult(target: BenchTarget): DirectoryWorkspaceCommandResult {
  return {
    outcome: "committed",
    changed: true,
    projection: projectionForTarget(target),
  }
}

function benchAction(input: { actionID: string; sessionID?: string }): BenchClientActionV2 {
  return {
    version: 2,
    actionID: input.actionID,
    directory: DIRECTORY,
    sessionID: input.sessionID ?? SESSION_ID,
    messageID: "msg_client_action",
    callID: null,
    origin: "agent",
    acknowledgement: "required",
    expiresAt: Date.now() + 30_000,
    command: {
      type: "present",
      target: TARGET,
      autoOpen: null,
    },
  }
}

function bestEffortAction(input: {
  actionID: string
  sessionID?: string
  messageID?: string
  eventKey?: string
  policyID?: BenchAutoOpenIdentity["policyID"]
  target?: BenchTarget
}): BenchClientActionV2 {
  return {
    ...benchAction(input),
    messageID: input.messageID ?? "msg_client_action",
    origin: "auto-open",
    acknowledgement: "best-effort",
    command: {
      type: "present",
      target: input.target ?? HTML_WIDGET_TARGET,
      autoOpen: {
        policyID: input.policyID ?? BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
        eventKey: input.eventKey ?? input.actionID,
      },
    },
  }
}

function captureAction(
  actionID: string,
  drawer: DrawerKind | null = null,
): BenchClientActionV2 {
  return {
    ...benchAction({ actionID }),
    command: {
      type: "capture_bench_screenshot",
      tabKey: "file:markdown:notes.md",
      target: TARGET,
      drawer,
    },
  }
}

function createHarness(input?: {
  activeSessionID?: string | null
  execute?: (command: DirectoryWorkspaceCommand) => DirectoryWorkspaceCommandResult
  completeClientAction?: (completion: {
    actionID: string
    sessionID: string
    completion: BenchClientActionCompletionDraft
    expectedCapture?: { tabKey: string; target: BenchTarget; drawer: DrawerKind | null }
  }) => boolean
}) {
  let activeSessionID =
    input && "activeSessionID" in input ? (input.activeSessionID ?? undefined) : SESSION_ID
  const executed: DirectoryWorkspaceCommand[] = []
  const executeOptions: Array<{
    origin: "agent" | "user" | "auto-open"
    autoOpen?: BenchAutoOpenIdentity | null
  }> = []
  const completions: Array<{
    actionID: string
    sessionID: string
    completion: BenchClientActionCompletionDraft
    expectedCapture?: { tabKey: string; target: BenchTarget; drawer: DrawerKind | null }
  }> = []
  const ledger = new DirectoryWorkspaceClientActionLedger({
    directory: DIRECTORY,
    controller: {
      execute(command, options) {
        executed.push(command)
        executeOptions.push(options ?? { origin: "user" })
        return input?.execute ? input.execute(command) : committedResult(TARGET)
      },
    },
    lifecycle: {
      async completeClientAction(completion) {
        const { getActiveSessionID: _getActiveSessionID, ...recordedCompletion } = completion
        completions.push(recordedCompletion)
        return input?.completeClientAction ? input.completeClientAction(recordedCompletion) : true
      },
    },
    getActiveSessionID: () => activeSessionID,
  })
  return {
    ledger,
    executed,
    executeOptions,
    completions,
    setActiveSessionID(nextSessionID: string | undefined) {
      activeSessionID = nextSessionID
    },
  }
}

describe("Bench client action parsing", () => {
  test("reads broker lease and action events from global SSE payloads", () => {
    expect(
      readBenchClientLeaseEvent({
        type: "bench.client_lease",
        properties: {
          lease: {
            instanceID: "instance-1",
            generation: 1,
            leaseEpoch: 2,
            directory: DIRECTORY,
          },
        },
      }),
    ).toMatchObject({
      instanceID: "instance-1",
      generation: 1,
      leaseEpoch: 2,
      directory: DIRECTORY,
    })

    expect(
      readBenchClientActionEvent({
        type: "bench.client_action",
        properties: {
          action: benchAction({ actionID: "action-1" }),
        },
      }),
    ).toMatchObject({
      actionID: "action-1",
      command: {
        type: "present",
        target: TARGET,
      },
    })
  })
})

describe("DirectoryWorkspaceClientActionLedger", () => {
  test("executes an unseen action once and records a committed completion", async () => {
    const harness = createHarness()

    await harness.ledger.handle(benchAction({ actionID: "action-1" }))

    expect(harness.executed).toEqual([
      {
        type: "present",
        directory: DIRECTORY,
        target: TARGET,
        mode: "policy",
      },
    ])
    expect(harness.completions).toMatchObject([
      {
        actionID: "action-1",
        sessionID: SESSION_ID,
        completion: {
          outcome: "committed",
          observedVisibility: "visible",
          changed: true,
        },
      },
    ])
  })

  test("records observed workspace state for a superseded required action", async () => {
    const harness = createHarness({
      execute: () => ({
        outcome: "superseded",
        reason: "newer_command",
        projection: projectionForTarget(HTML_WIDGET_TARGET),
      }),
    })

    await harness.ledger.handle(benchAction({ actionID: "action-superseded" }))

    expect(harness.completions).toEqual([
      {
        actionID: "action-superseded",
        sessionID: SESSION_ID,
        completion: {
          outcome: "superseded",
          reason: "newer_command",
          observedRoute: {
            status: BENCH_ROUTE_STATUS_OPEN,
            target: HTML_WIDGET_TARGET,
            mode: BENCH_CHAT_LAYOUT_DOCKED,
          },
          observedVisibility: "visible",
          drawer: null,
        },
      },
    ])
  })

  test("resends duplicate terminal completions without rerunning the command", async () => {
    const harness = createHarness()
    const action = benchAction({ actionID: "action-1" })

    await harness.ledger.handle(action)
    await harness.ledger.handle(action)

    expect(harness.executed).toHaveLength(1)
    expect(harness.completions).toHaveLength(2)
    expect(harness.completions[1]?.completion).toEqual(harness.completions[0]?.completion)
  })

  test("reports inactive_session without executing on active-session mismatch", async () => {
    const harness = createHarness({ activeSessionID: OTHER_SESSION_ID })

    await harness.ledger.handle(benchAction({ actionID: "action-1" }))

    expect(harness.executed).toHaveLength(0)
    expect(harness.completions).toEqual([
      {
        actionID: "action-1",
        sessionID: SESSION_ID,
        completion: {
          outcome: "inactive_session",
          reason: "session_inactive",
        },
      },
    ])
  })

  test("queues required actions while active session state is unknown", async () => {
    const harness = createHarness({ activeSessionID: null })

    await harness.ledger.handle(benchAction({ actionID: "action-1" }))

    expect(harness.executed).toHaveLength(0)
    expect(harness.completions).toHaveLength(0)

    harness.setActiveSessionID(SESSION_ID)
    await harness.ledger.drainPendingSessionActions()

    expect(harness.executed).toEqual([
      {
        type: "present",
        directory: DIRECTORY,
        target: TARGET,
        mode: "policy",
      },
    ])
    expect(harness.completions).toMatchObject([
      {
        actionID: "action-1",
        sessionID: SESSION_ID,
        completion: {
          outcome: "committed",
          observedVisibility: "visible",
        },
      },
    ])
  })

  test("keeps required completion pending until the lifecycle can complete it", async () => {
    let canComplete = false
    const harness = createHarness({
      completeClientAction: () => canComplete,
    })
    const action = benchAction({ actionID: "action-pending-completion" })

    await harness.ledger.handle(action)

    expect(harness.executed).toEqual([
      {
        type: "present",
        directory: DIRECTORY,
        target: TARGET,
        mode: "policy",
      },
    ])
    expect(harness.completions).toHaveLength(1)

    canComplete = true
    await harness.ledger.drainPendingSessionActions()

    expect(harness.executed).toHaveLength(1)
    expect(harness.completions).toHaveLength(2)
    expect(harness.completions[1]).toMatchObject({
      actionID: "action-pending-completion",
      sessionID: SESSION_ID,
      completion: {
        outcome: "committed",
        observedVisibility: "visible",
      },
    })
  })

  test("re-arbitrates completion when the active session changes during submission", async () => {
    let switchSession: (() => void) | undefined
    const harness = createHarness({
      completeClientAction: (input) => {
        if (input.completion.outcome === "committed") {
          switchSession?.()
          return false
        }
        return input.completion.outcome === "inactive_session"
      },
    })
    switchSession = () => harness.setActiveSessionID(OTHER_SESSION_ID)

    await harness.ledger.handle(benchAction({ actionID: "action-session-switch" }))

    expect(harness.executed).toHaveLength(1)
    expect(harness.completions.map((entry) => entry.completion.outcome)).toEqual([
      "committed",
      "inactive_session",
    ])
  })

  test("executes best-effort actions live-only without backend completion", async () => {
    const harness = createHarness()
    const action = bestEffortAction({ actionID: "action-best-effort" })

    await harness.ledger.handle(action)
    await harness.ledger.handle(action)

    expect(harness.executed).toEqual([
      {
        type: "present",
        directory: DIRECTORY,
        target: HTML_WIDGET_TARGET,
        mode: "policy",
      },
    ])
    expect(harness.executeOptions).toEqual([
      {
        origin: "auto-open",
        autoOpen: {
          policyID: BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
          eventKey: "action-best-effort",
        },
      },
    ])
    expect(harness.completions).toHaveLength(0)
  })

  test("coalesces live best-effort actions by canonical event identity", async () => {
    const harness = createHarness()

    await harness.ledger.handle(
      bestEffortAction({ actionID: "auto-open-1", eventKey: "widget:event" }),
    )
    await harness.ledger.handle(
      bestEffortAction({ actionID: "auto-open-2", eventKey: "widget:event" }),
    )

    expect(harness.executed).toHaveLength(1)
  })

  test("reveals only the first active whiteboard update in an agent message", async () => {
    const harness = createHarness()

    await harness.ledger.handle(
      bestEffortAction({
        actionID: "whiteboard-auto-open-1",
        eventKey: "whiteboard:event-1",
        policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
        target: WHITEBOARD_TARGET,
      }),
    )
    await harness.ledger.handle(
      bestEffortAction({
        actionID: "whiteboard-auto-open-2",
        eventKey: "whiteboard:event-2",
        policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
        target: WHITEBOARD_TARGET,
      }),
    )
    await harness.ledger.handle(
      bestEffortAction({
        actionID: "whiteboard-auto-open-3",
        messageID: "msg_next_client_action",
        eventKey: "whiteboard:event-3",
        policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
        target: WHITEBOARD_TARGET,
      }),
    )

    expect(harness.executed).toEqual([
      {
        type: "present",
        directory: DIRECTORY,
        target: WHITEBOARD_TARGET,
        mode: "policy",
      },
      {
        type: "present-background",
        chatKey: `session:${SESSION_ID}`,
        target: WHITEBOARD_TARGET,
        mode: "floating",
      },
      {
        type: "present",
        directory: DIRECTORY,
        target: WHITEBOARD_TARGET,
        mode: "policy",
      },
    ])
  })

  test("updates an inactive chat's tabs for best-effort auto-open without switching chats", async () => {
    const harness = createHarness({ activeSessionID: OTHER_SESSION_ID })

    await harness.ledger.handle(
      bestEffortAction({ actionID: "action-inactive-auto-open", sessionID: SESSION_ID }),
    )

    expect(harness.executed).toEqual([
      {
        type: "present-background",
        chatKey: `session:${SESSION_ID}`,
        target: HTML_WIDGET_TARGET,
        mode: "floating",
      },
    ])
    expect(harness.completions).toHaveLength(0)
  })

  test("captures the full right workspace once and tombstones the acknowledged payload", async () => {
    const titlebar = document.createElement("div")
    const workspace = document.createElement("section")
    const region = document.createElement("div")
    const drawer = document.createElement("aside")
    titlebar.dataset.component = "directory-chat-right-workspace-titlebar"
    titlebar.getBoundingClientRect = () => new DOMRect(10, 0, 340, 40)
    workspace.dataset.component = "directory-chat-right-workspace"
    workspace.dataset.benchVisible = "true"
    workspace.dataset.selector = "files"
    workspace.getBoundingClientRect = () => new DOMRect(10, 40, 340, 220)
    region.dataset.component = "right-workspace-bench-target"
    region.dataset.benchVisible = "true"
    region.dataset.benchTabKey = "file:markdown:notes.md"
    region.dataset.benchTargetKey = benchTargetKey(TARGET)
    drawer.dataset.component = "right-workspace-selector-drawer"
    workspace.append(region, drawer)
    document.body.append(titlebar, workspace)
    const capturedRectangles: Array<{ x: number; y: number; width: number; height: number }> = []
    setRuntimePlatform({
      ...createBrowserPlatform(),
      platform: "desktop",
      async captureBenchScreenshot(rectangle) {
        capturedRectangles.push(rectangle)
        return "iVBORw0KGgo="
      },
    })
    try {
      const harness = createHarness()
      const action = captureAction("action-capture", "files")
      await harness.ledger.handle(action)
      await harness.ledger.handle(action)

      expect(capturedRectangles).toEqual([{ x: 10, y: 0, width: 340, height: 260 }])
      expect(harness.executed).toHaveLength(0)
      expect(harness.completions).toEqual([
        {
          actionID: "action-capture",
          sessionID: SESSION_ID,
          completion: { outcome: "captured", pngBase64: "iVBORw0KGgo=" },
          expectedCapture: {
            tabKey: "file:markdown:notes.md",
            target: TARGET,
            drawer: "files",
          },
        },
      ])
    } finally {
      titlebar.remove()
      workspace.remove()
      setRuntimePlatform(createBrowserPlatform())
    }
  })

  test("captures the immersive workspace but rejects a selected-tab change", async () => {
    const titlebar = document.createElement("div")
    const workspace = document.createElement("section")
    const region = document.createElement("div")
    titlebar.dataset.component = "desktop-titlebar-root-content"
    titlebar.getBoundingClientRect = () => new DOMRect(120, 0, 680, 40)
    workspace.dataset.component = "directory-chat-right-workspace"
    workspace.dataset.benchVisible = "true"
    workspace.dataset.selector = WORKSPACE_DRAWER_NONE
    workspace.getBoundingClientRect = () => new DOMRect(0, 40, 800, 600)
    region.dataset.component = "right-workspace-bench-target"
    region.dataset.benchVisible = "true"
    region.dataset.benchTabKey = "file:markdown:notes.md"
    region.dataset.benchTargetKey = benchTargetKey(TARGET)
    workspace.append(region)
    document.body.append(titlebar, workspace)
    const capturedRectangles: Array<{ x: number; y: number; width: number; height: number }> = []
    setRuntimePlatform({
      ...createBrowserPlatform(),
      platform: "desktop",
      async captureBenchScreenshot(rectangle) {
        capturedRectangles.push(rectangle)
        region.dataset.benchTabKey = "file:markdown:other.md"
        return "iVBORw0KGgo="
      },
    })
    try {
      const harness = createHarness()
      await harness.ledger.handle(captureAction("action-stale-capture"))

      expect(capturedRectangles).toEqual([{ x: 0, y: 0, width: 800, height: 640 }])
      expect(harness.completions).toEqual([
        {
          actionID: "action-stale-capture",
          sessionID: SESSION_ID,
          completion: { outcome: "failed", reason: "capture_failed" },
        },
      ])
    } finally {
      titlebar.remove()
      workspace.remove()
      setRuntimePlatform(createBrowserPlatform())
    }
  })

  test("rejects captured pixels when the drawer changes during capture", async () => {
    const workspace = document.createElement("section")
    const region = document.createElement("div")
    workspace.dataset.component = "directory-chat-right-workspace"
    workspace.dataset.benchVisible = "true"
    workspace.dataset.selector = "files"
    workspace.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600)
    region.dataset.component = "right-workspace-bench-target"
    region.dataset.benchVisible = "true"
    region.dataset.benchTabKey = "file:markdown:notes.md"
    region.dataset.benchTargetKey = benchTargetKey(TARGET)
    workspace.append(region)
    document.body.append(workspace)
    setRuntimePlatform({
      ...createBrowserPlatform(),
      platform: "desktop",
      async captureBenchScreenshot() {
        workspace.dataset.selector = "skills"
        return "iVBORw0KGgo="
      },
    })
    try {
      const harness = createHarness()
      await harness.ledger.handle(captureAction("action-drawer-changed", "files"))

      expect(harness.completions).toEqual([
        {
          actionID: "action-drawer-changed",
          sessionID: SESSION_ID,
          completion: { outcome: "failed", reason: "capture_failed" },
        },
      ])
    } finally {
      workspace.remove()
      setRuntimePlatform(createBrowserPlatform())
    }
  })

  test("keeps terminal entries bounded and allows evicted actions to execute again", async () => {
    const harness = createHarness()

    for (let index = 0; index < 513; index += 1) {
      await harness.ledger.handle(benchAction({ actionID: `action-${index}` }))
    }
    await harness.ledger.handle(benchAction({ actionID: "action-0" }))

    expect(harness.executed).toHaveLength(514)
  })
})
