import {
  parseTJsonObject,
  parseTNumber,
  parseTString,
  type TJsonObject,
} from "@/components/chat/tools/types"
import {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  BENCH_MODE_REQUEST_POLICY,
  benchTargetKey,
  isBenchContentTarget,
  readBenchTarget,
  resolveBenchSurfaceDefaults,
  type BenchAutoOpenIdentity,
  type BenchTarget,
} from "@/lib/bench-navigation"
import type {
  BenchClientActionCompletionDraft,
  BenchClientLease,
} from "@/lib/directory-workspace-lifecycle"
import {
  WORKSPACE_DRAWER_NONE,
  isDrawerKind,
  type DrawerKind,
  type DirectoryWorkspaceCommand,
  type DirectoryWorkspaceCommandResult,
  type BenchRouteSnapshot,
} from "@/state/directory-workspace-store"
import { getPlatform } from "@/context/platform"
import { workspaceChatKeyForSession } from "@/lib/workspace-chat-key"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"

const BENCH_CLIENT_ACTION_VERSION = 2
const BENCH_CLIENT_ACTION_LEDGER_LIMIT = 512
const BENCH_CLIENT_ACTION_TYPE = "bench.client_action"
const BENCH_CLIENT_LEASE_TYPE = "bench.client_lease"
const LEDGER_STATUS_EXECUTING = "executing"
const LEDGER_STATUS_PENDING_COMPLETION_SESSION = "pending-completion-session"
const LEDGER_STATUS_PENDING_SESSION = "pending-session"
const LEDGER_STATUS_TERMINAL = "terminal"
const BEST_EFFORT_COALESCING_KEY_SEPARATOR = "\0"
const BENCH_CAPTURE_REGION_SELECTOR =
  '[data-component="right-workspace-bench-target"][data-bench-visible="true"]'
const BENCH_WORKSPACE_SELECTOR =
  '[data-component="directory-chat-right-workspace"][data-bench-visible="true"]'
const BENCH_TITLEBAR_SELECTOR =
  '[data-component="directory-chat-right-workspace-titlebar"]:not([hidden]), [data-component="desktop-titlebar-root-content"]'
const BENCH_CAPTURE_PRIVACY_ATTRIBUTE = "data-bench-capture-privacy"
const BENCH_CAPTURE_PRIVACY_ACTIVE = "true"

let activeBenchCapturePrivacyMasks = 0

function activateBenchCapturePrivacyMask(): () => void {
  activeBenchCapturePrivacyMasks += 1
  document.documentElement.setAttribute(
    BENCH_CAPTURE_PRIVACY_ATTRIBUTE,
    BENCH_CAPTURE_PRIVACY_ACTIVE,
  )
  let released = false
  return () => {
    if (released) return
    released = true
    activeBenchCapturePrivacyMasks = Math.max(0, activeBenchCapturePrivacyMasks - 1)
    if (activeBenchCapturePrivacyMasks === 0) {
      document.documentElement.removeAttribute(BENCH_CAPTURE_PRIVACY_ATTRIBUTE)
    }
  }
}

function waitForBenchCapturePrivacyPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

type BenchClientObservedRoute =
  | { status: "closed" }
  | {
      status: "open"
      target: BenchTarget
      mode: Extract<BenchRouteSnapshot, { status: "open" }>["mode"]
    }
type BenchClientObservedState = {
  observedRoute: BenchClientObservedRoute
  observedVisibility: DirectoryWorkspaceCommandResult["projection"]["bench"]["visibility"]
  drawer: DrawerKind | null
}

type BenchClientActionV2 = {
  version: typeof BENCH_CLIENT_ACTION_VERSION
  actionID: string
  directory: string
  sessionID: string
  messageID: string
  callID: string | null
  origin: "agent" | "auto-open"
  acknowledgement: "required" | "best-effort"
  expiresAt: number
  command:
    | {
        type: "present"
        target: BenchTarget
        autoOpen: BenchAutoOpenIdentity | null
      }
    | { type: "focus_tab"; tabKey: string; target: BenchTarget }
    | { type: "close" }
    | {
        type: "capture_bench_screenshot"
        tabKey: string
        target: BenchTarget
        drawer: DrawerKind | null
      }
}

type LedgerEntry =
  | {
      status: typeof LEDGER_STATUS_EXECUTING
    }
  | {
      status: typeof LEDGER_STATUS_PENDING_SESSION
      action: BenchClientActionV2
    }
  | {
      status: typeof LEDGER_STATUS_PENDING_COMPLETION_SESSION
      action: BenchClientActionV2
      completion: BenchClientActionCompletionDraft
    }
  | {
      status: typeof LEDGER_STATUS_TERMINAL
      completion: BenchClientActionCompletionDraft | null
      usedAt: number
    }

type PendingSessionDrainEntry =
  | {
      type: "action"
      action: BenchClientActionV2
    }
  | {
      type: "completion"
      action: BenchClientActionV2
      completion: BenchClientActionCompletionDraft
    }

type DirectoryWorkspaceClientActionLedgerInput = {
  directory: string
  controller: DirectoryWorkspaceCommandExecutor
  lifecycle: DirectoryWorkspaceActionCompletionSink
  getActiveSessionID: () => string | undefined
}

type DirectoryWorkspaceCommandExecutor = {
  execute(
    command: DirectoryWorkspaceCommand,
    options?: { origin: "agent" | "user" | "auto-open"; autoOpen?: BenchAutoOpenIdentity | null },
  ): DirectoryWorkspaceCommandResult | Promise<DirectoryWorkspaceCommandResult>
}

type DirectoryWorkspaceActionCompletionSink = {
  completeClientAction(input: {
    actionID: string
    sessionID: string
    completion: BenchClientActionCompletionDraft
    expectedCapture?: { tabKey: string; target: BenchTarget; drawer: DrawerKind | null }
    getActiveSessionID: () => string | undefined
  }): Promise<boolean>
}

function readString<TValue>(value: TValue): string | undefined {
  const text = parseTString(value)
  return text ? text : undefined
}

function readNullableString<TValue>(value: TValue): string | null | undefined {
  if (value === null) return null
  return readString(value)
}

function readBenchAutoOpenIdentity<TValue>(
  value: TValue,
): BenchAutoOpenIdentity | null | undefined {
  if (value === null) return null
  const record = parseTJsonObject(value)
  if (!record) return undefined
  const policyID =
    record.policyID === BENCH_AUTO_OPEN_POLICY_WHITEBOARD ||
    record.policyID === BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET
      ? record.policyID
      : undefined
  const eventKey = readString(record.eventKey)
  return policyID && eventKey ? { policyID, eventKey } : undefined
}

function readBenchClientAction<TValue>(value: TValue): BenchClientActionV2 | undefined {
  const record = parseTJsonObject(value)
  if (!record) return undefined
  if (record.version !== BENCH_CLIENT_ACTION_VERSION) return undefined
  const actionID = readString(record.actionID)
  const directory = readString(record.directory)
  const sessionID = readString(record.sessionID)
  const messageID = readString(record.messageID)
  const callID = readNullableString(record.callID)
  const origin =
    record.origin === "agent" || record.origin === "auto-open" ? record.origin : undefined
  const acknowledgement =
    record.acknowledgement === "required" || record.acknowledgement === "best-effort"
      ? record.acknowledgement
      : undefined
  const expiresAt = parseTNumber(record.expiresAt)
  const command = parseTJsonObject(record.command)
  if (
    !actionID ||
    !directory ||
    !sessionID ||
    !messageID ||
    callID === undefined ||
    !origin ||
    !acknowledgement ||
    !expiresAt ||
    !command
  ) {
    return undefined
  }
  if (command.type === "close") {
    return {
      version: BENCH_CLIENT_ACTION_VERSION,
      actionID,
      directory,
      sessionID,
      messageID,
      callID,
      origin,
      acknowledgement,
      expiresAt,
      command: { type: "close" },
    }
  }
  const target = readBenchTarget(command.target)
  if (!target) return undefined
  if (command.type === "focus_tab") {
    const tabKey = readString(command.tabKey)
    if (!tabKey) return undefined
    return {
      version: BENCH_CLIENT_ACTION_VERSION,
      actionID,
      directory,
      sessionID,
      messageID,
      callID,
      origin,
      acknowledgement,
      expiresAt,
      command: { type: "focus_tab", tabKey, target },
    }
  }
  if (command.type === "capture_bench_screenshot") {
    const tabKey = readString(command.tabKey)
    const drawer =
      command.drawer === null ? null : isDrawerKind(command.drawer) ? command.drawer : undefined
    if (!tabKey || drawer === undefined) return undefined
    return {
      version: BENCH_CLIENT_ACTION_VERSION,
      actionID,
      directory,
      sessionID,
      messageID,
      callID,
      origin,
      acknowledgement,
      expiresAt,
      command: { type: "capture_bench_screenshot", tabKey, target, drawer },
    }
  }
  if (command.type !== "present") return undefined
  const autoOpen = readBenchAutoOpenIdentity(command.autoOpen)
  if (autoOpen === undefined) return undefined
  return {
    version: BENCH_CLIENT_ACTION_VERSION,
    actionID,
    directory,
    sessionID,
    messageID,
    callID,
    origin,
    acknowledgement,
    expiresAt,
    command: {
      type: "present",
      target,
      autoOpen,
    },
  }
}

function readBenchClientLease<TValue>(value: TValue): BenchClientLease | undefined {
  const record = parseTJsonObject(value)
  if (!record) return undefined
  const instanceID = readString(record.instanceID)
  const generation = parseTNumber(record.generation)
  const leaseEpoch = parseTNumber(record.leaseEpoch)
  const directory = readString(record.directory)
  if (!instanceID || generation === undefined || leaseEpoch === undefined || !directory) {
    return undefined
  }
  return {
    instanceID,
    generation,
    leaseEpoch,
    directory,
  }
}

function readEventProperties<TInput>(input: TInput, type: string): TJsonObject | undefined {
  const record = parseTJsonObject(input)
  if (!record) return undefined
  if (record.type !== type) return undefined
  return parseTJsonObject(record.properties)
}

function readBenchClientActionEvent<TInput>(input: TInput): BenchClientActionV2 | undefined {
  const properties = readEventProperties(input, BENCH_CLIENT_ACTION_TYPE)
  return properties ? readBenchClientAction(properties.action) : undefined
}

function readBenchClientLeaseEvent<TInput>(input: TInput): BenchClientLease | undefined {
  const properties = readEventProperties(input, BENCH_CLIENT_LEASE_TYPE)
  return properties ? readBenchClientLease(properties.lease) : undefined
}

function completionFromResult(
  result: DirectoryWorkspaceCommandResult,
): BenchClientActionCompletionDraft {
  const observedState = contentObservedState(result.projection)
  if (result.outcome === "committed") {
    return {
      outcome: "committed",
      ...observedState,
      changed: result.changed,
    }
  }
  if (result.outcome === "blocked") {
    return {
      outcome: "blocked",
      reason: result.reason,
      ...observedState,
    }
  }
  if (result.outcome === "failed") {
    return {
      outcome: "failed",
      reason: result.reason,
      ...observedState,
    }
  }
  if (result.outcome === "inactive") {
    return {
      outcome: "inactive_session",
      reason: result.reason,
      ...observedState,
    }
  }
  return {
    outcome: "superseded",
    reason: result.reason,
    ...observedState,
  }
}

function contentObservedState(
  projection: DirectoryWorkspaceCommandResult["projection"],
): BenchClientObservedState {
  const route = projection.route
  if (route.status === "closed") {
    return {
      observedRoute: route,
      observedVisibility: projection.bench.visibility,
      drawer: projection.drawer,
    }
  }
  if (!isBenchContentTarget(route.target)) {
    return {
      observedRoute: { status: "closed" },
      observedVisibility: "closed",
      drawer: null,
    }
  }
  return {
    observedRoute: { status: route.status, target: route.target, mode: route.mode },
    observedVisibility: projection.bench.visibility,
    drawer: projection.drawer,
  }
}

function inactiveSessionCompletion(): BenchClientActionCompletionDraft {
  return {
    outcome: "inactive_session",
    reason: "session_inactive",
  }
}

function contextSyncFailedCompletion(): BenchClientActionCompletionDraft {
  return {
    outcome: "failed",
    reason: "context_sync_failed",
  }
}

function captureFailureCompletion(
  reason: "capture_failed" | "capture_unavailable",
): BenchClientActionCompletionDraft {
  return { outcome: "failed", reason }
}

async function captureVisibleBench(
  command: Extract<BenchClientActionV2["command"], { type: "capture_bench_screenshot" }>,
): Promise<BenchClientActionCompletionDraft> {
  if (command.target.type === "browser") {
    return captureFailureCompletion("capture_unavailable")
  }
  const captureBenchScreenshot = getPlatform().captureBenchScreenshot
  if (!captureBenchScreenshot) return captureFailureCompletion("capture_unavailable")
  const region = document.querySelector(BENCH_CAPTURE_REGION_SELECTOR)
  const workspace = document.querySelector(BENCH_WORKSPACE_SELECTOR)
  if (!(region instanceof HTMLElement) || !(workspace instanceof HTMLElement)) {
    return captureFailureCompletion("capture_unavailable")
  }
  const expectedTargetKey = benchTargetKey(command.target)
  const expectedDrawer = command.drawer ?? WORKSPACE_DRAWER_NONE
  if (
    region.dataset.benchTabKey !== command.tabKey ||
    region.dataset.benchTargetKey !== expectedTargetKey ||
    workspace.dataset.selector !== expectedDrawer
  ) {
    return captureFailureCompletion("capture_failed")
  }
  const workspaceBounds = workspace.getBoundingClientRect()
  const titlebar = document.querySelector(BENCH_TITLEBAR_SELECTOR)
  const titlebarBounds = titlebar instanceof HTMLElement ? titlebar.getBoundingClientRect() : null
  const x = Math.floor(Math.min(workspaceBounds.left, titlebarBounds?.left ?? workspaceBounds.left))
  const y = Math.floor(Math.min(workspaceBounds.top, titlebarBounds?.top ?? workspaceBounds.top))
  const right = Math.ceil(
    Math.max(workspaceBounds.right, titlebarBounds?.right ?? workspaceBounds.right),
  )
  const bottom = Math.ceil(
    Math.max(workspaceBounds.bottom, titlebarBounds?.bottom ?? workspaceBounds.bottom),
  )
  const width = right - x
  const height = bottom - y
  if (width <= 0 || height <= 0) return captureFailureCompletion("capture_unavailable")
  const releasePrivacyMask = activateBenchCapturePrivacyMask()
  try {
    await waitForBenchCapturePrivacyPaint()
    if (
      document.querySelector(BENCH_CAPTURE_REGION_SELECTOR) !== region ||
      document.querySelector(BENCH_WORKSPACE_SELECTOR) !== workspace ||
      region.dataset.benchTabKey !== command.tabKey ||
      region.dataset.benchTargetKey !== expectedTargetKey ||
      workspace.dataset.selector !== expectedDrawer
    ) {
      return captureFailureCompletion("capture_failed")
    }
    const pngBase64 = await captureBenchScreenshot({ x, y, width, height })
    if (
      document.querySelector(BENCH_CAPTURE_REGION_SELECTOR) !== region ||
      document.querySelector(BENCH_WORKSPACE_SELECTOR) !== workspace ||
      region.dataset.benchTabKey !== command.tabKey ||
      region.dataset.benchTargetKey !== expectedTargetKey ||
      workspace.dataset.selector !== expectedDrawer
    ) {
      return captureFailureCompletion("capture_failed")
    }
    return { outcome: "captured", pngBase64 }
  } catch {
    return captureFailureCompletion("capture_failed")
  } finally {
    releasePrivacyMask()
  }
}

function isActionExpired(action: BenchClientActionV2): boolean {
  return action.expiresAt <= Date.now()
}

function bestEffortAutoOpenIdentity(
  action: BenchClientActionV2,
): BenchAutoOpenIdentity | undefined {
  if (action.acknowledgement !== "best-effort") return undefined
  if (action.command.type !== "present") return undefined
  return action.command.autoOpen ?? undefined
}

function bestEffortCoalescingKey(action: BenchClientActionV2): string | undefined {
  const identity = bestEffortAutoOpenIdentity(action)
  if (!identity || action.command.type !== "present") return undefined
  return [identity.policyID, action.sessionID, identity.eventKey].join(
    BEST_EFFORT_COALESCING_KEY_SEPARATOR,
  )
}

function whiteboardForegroundClaimKey(action: BenchClientActionV2): string | undefined {
  const identity = bestEffortAutoOpenIdentity(action)
  if (identity?.policyID !== BENCH_AUTO_OPEN_POLICY_WHITEBOARD) return undefined
  return [action.sessionID, action.messageID].join(BEST_EFFORT_COALESCING_KEY_SEPARATOR)
}

export class DirectoryWorkspaceClientActionLedger {
  readonly #directory: string
  readonly #controller: DirectoryWorkspaceCommandExecutor
  readonly #lifecycle: DirectoryWorkspaceActionCompletionSink
  readonly #getActiveSessionID: () => string | undefined
  #entries = new Map<string, LedgerEntry>()
  #bestEffortActionIDByKey = new Map<string, string>()
  #whiteboardForegroundClaims = new Set<string>()
  #terminalSequence = 0

  constructor(input: DirectoryWorkspaceClientActionLedgerInput) {
    this.#directory = input.directory
    this.#controller = input.controller
    this.#lifecycle = input.lifecycle
    this.#getActiveSessionID = input.getActiveSessionID
    logBenchToggleStep("client-action-ledger-create", {
      directory: input.directory,
    })
  }

  dispose(): void {
    logBenchToggleStep("client-action-ledger-dispose", {
      directory: this.#directory,
      entryCount: this.#entries.size,
      pendingBestEffortCount: this.#bestEffortActionIDByKey.size,
    })
    this.#entries.clear()
    this.#bestEffortActionIDByKey.clear()
    this.#whiteboardForegroundClaims.clear()
  }

  async handle(action: BenchClientActionV2): Promise<void> {
    logBenchToggleStep("client-action-ledger-handle-entry", {
      ledgerDirectory: this.#directory,
      action,
      activeSessionID: this.#getActiveSessionID(),
      existing: this.#entries.get(action.actionID),
    })
    if (action.directory !== this.#directory) {
      logBenchToggleStep("client-action-ledger-handle-directory-mismatch", {
        ledgerDirectory: this.#directory,
        action,
      })
      return
    }
    const existing = this.#entries.get(action.actionID)
    if (existing?.status === LEDGER_STATUS_EXECUTING) {
      logBenchToggleStep("client-action-ledger-handle-existing-executing", {
        action,
      })
      return
    }
    if (existing?.status === LEDGER_STATUS_TERMINAL) {
      existing.usedAt = this.#nextTerminalSequence()
      logBenchToggleStep("client-action-ledger-handle-existing-terminal", {
        action,
        completion: existing.completion,
      })
      if (action.acknowledgement === "required" && existing.completion) {
        await this.#complete(action, existing.completion)
      }
      return
    }
    if (existing?.status === LEDGER_STATUS_PENDING_COMPLETION_SESSION) {
      logBenchToggleStep("client-action-ledger-handle-existing-pending-completion", {
        action,
        completion: existing.completion,
      })
      await this.#finishCompletion(existing.action, existing.completion)
      return
    }
    if (isActionExpired(action)) {
      logBenchToggleStep("client-action-ledger-handle-expired", {
        action,
        now: Date.now(),
      })
      this.#entries.delete(action.actionID)
      this.#removePendingBestEffort(action)
      return
    }
    if (action.acknowledgement === "best-effort") {
      const key = bestEffortCoalescingKey(action)
      if (!key) return
      const claimedActionID = this.#bestEffortActionIDByKey.get(key)
      if (claimedActionID && claimedActionID !== action.actionID) {
        if (this.#entries.has(claimedActionID)) return
        this.#bestEffortActionIDByKey.delete(key)
      }
      this.#bestEffortActionIDByKey.set(key, action.actionID)
    }
    const activeSessionID = this.#getActiveSessionID()
    if (activeSessionID === undefined) {
      logBenchToggleStep("client-action-ledger-handle-no-active-session", {
        action,
      })
      this.#queuePendingSessionAction(action)
      return
    }
    if (
      action.acknowledgement === "best-effort" &&
      action.command.type === "present" &&
      !bestEffortAutoOpenIdentity(action)
    ) {
      logBenchToggleStep("client-action-ledger-handle-best-effort-dropped", {
        action,
      })
      return
    }

    this.#entries.set(action.actionID, { status: LEDGER_STATUS_EXECUTING })
    logBenchToggleStep("client-action-ledger-handle-execute-start", {
      action,
      activeSessionID,
    })
    const completion = await this.#execute(action, activeSessionID)
    logBenchToggleStep("client-action-ledger-handle-execute-completion", {
      action,
      completion,
    })
    await this.#finishCompletion(action, completion)
  }

  async drainPendingSessionActions(): Promise<void> {
    logBenchToggleStep("client-action-ledger-drain-pending-entry", {
      directory: this.#directory,
      activeSessionID: this.#getActiveSessionID(),
      entryCount: this.#entries.size,
    })
    const pendingEntries: PendingSessionDrainEntry[] = []
    for (const entry of this.#entries.values()) {
      if (entry.status === LEDGER_STATUS_PENDING_SESSION) {
        pendingEntries.push({ type: "action", action: entry.action })
        continue
      }
      if (entry.status === LEDGER_STATUS_PENDING_COMPLETION_SESSION) {
        pendingEntries.push({
          type: "completion",
          action: entry.action,
          completion: entry.completion,
        })
      }
    }
    logBenchToggleStep("client-action-ledger-drain-pending-collected", {
      directory: this.#directory,
      pendingEntries,
    })
    for (const entry of pendingEntries) {
      if (entry.type === "action") {
        await this.handle(entry.action)
        continue
      }
      await this.#finishCompletion(entry.action, entry.completion)
    }
  }

  async #finishCompletion(
    action: BenchClientActionV2,
    completion: BenchClientActionCompletionDraft,
  ): Promise<void> {
    logBenchToggleStep("client-action-ledger-finish-completion-entry", {
      action,
      completion,
      activeSessionID: this.#getActiveSessionID(),
    })
    if (isActionExpired(action)) {
      logBenchToggleStep("client-action-ledger-finish-completion-expired", {
        action,
        completion,
        now: Date.now(),
      })
      this.#entries.delete(action.actionID)
      this.#removePendingBestEffort(action)
      return
    }
    if (action.acknowledgement === "best-effort") {
      logBenchToggleStep("client-action-ledger-finish-completion-best-effort-terminal", {
        action,
        completion,
      })
      this.#recordTerminal(action, completion)
      return
    }
    let baseCompletion = completion
    while (!isActionExpired(action)) {
      const completionSessionID = this.#getActiveSessionID()
      if (completionSessionID === undefined) {
        logBenchToggleStep("client-action-ledger-finish-completion-no-session", {
          action,
          completion: baseCompletion,
        })
        this.#entries.set(action.actionID, {
          status: LEDGER_STATUS_PENDING_COMPLETION_SESSION,
          action,
          completion: baseCompletion,
        })
        return
      }
      const finalCompletion =
        completionSessionID === action.sessionID ? baseCompletion : inactiveSessionCompletion()
      logBenchToggleStep("client-action-ledger-finish-completion-before-complete", {
        action,
        completion: baseCompletion,
        completionSessionID,
        finalCompletion,
      })

      let completed: boolean
      try {
        completed = await this.#complete(action, finalCompletion)
      } catch {
        if (
          baseCompletion.outcome === "failed" &&
          baseCompletion.reason === "context_sync_failed"
        ) {
          completed = false
        } else {
          baseCompletion = contextSyncFailedCompletion()
          continue
        }
      }
      if (completed) {
        logBenchToggleStep("client-action-ledger-finish-completion-terminal", {
          action,
          completionToRecord: finalCompletion,
        })
        this.#recordTerminal(action, finalCompletion)
        return
      }
      if (this.#getActiveSessionID() !== completionSessionID) continue

      logBenchToggleStep("client-action-ledger-finish-completion-pending-after-failed-complete", {
        action,
        completionToRecord: baseCompletion,
      })
      this.#entries.set(action.actionID, {
        status: LEDGER_STATUS_PENDING_COMPLETION_SESSION,
        action,
        completion: baseCompletion,
      })
      return
    }

    this.#entries.delete(action.actionID)
    this.#removePendingBestEffort(action)
  }

  async #execute(
    action: BenchClientActionV2,
    activeSessionID: string,
  ): Promise<BenchClientActionCompletionDraft> {
    logBenchToggleStep("client-action-ledger-execute-entry", {
      action,
      activeSessionID,
    })
    if (action.sessionID !== activeSessionID) {
      const autoOpen = bestEffortAutoOpenIdentity(action)
      if (
        autoOpen &&
        action.command.type === "present" &&
        action.acknowledgement === "best-effort"
      ) {
        const defaults = resolveBenchSurfaceDefaults(action.command.target)
        return completionFromResult(
          await this.#controller.execute(
            {
              type: "present-background",
              chatKey: workspaceChatKeyForSession(action.sessionID),
              target: action.command.target,
              mode: defaults.mode,
            },
            { origin: "auto-open", autoOpen },
          ),
        )
      }
      logBenchToggleStep("client-action-ledger-execute-inactive-session", {
        action,
        activeSessionID,
      })
      return inactiveSessionCompletion()
    }
    if (action.command.type === "close") {
      const result = await this.#controller.execute(
        { type: "close" },
        { origin: action.acknowledgement === "best-effort" ? "auto-open" : "agent" },
      )
      logBenchToggleStep("client-action-ledger-execute-close-result", {
        action,
        result,
      })
      return completionFromResult(result)
    }
    if (action.command.type === "focus_tab") {
      const result = await this.#controller.execute(
        { type: "focus-tab", tabKey: action.command.tabKey },
        { origin: "agent" },
      )
      return completionFromResult(result)
    }
    if (action.command.type === "capture_bench_screenshot") {
      return captureVisibleBench(action.command)
    }
    if (action.command.target.type === "browser" && !getPlatform().inAppBrowser) {
      return { outcome: "failed", reason: "navigation_failed" }
    }
    const autoOpen = bestEffortAutoOpenIdentity(action)
    const whiteboardClaimKey = whiteboardForegroundClaimKey(action)
    if (whiteboardClaimKey && !this.#claimWhiteboardForeground(whiteboardClaimKey)) {
      const defaults = resolveBenchSurfaceDefaults(action.command.target)
      return completionFromResult(
        await this.#controller.execute(
          {
            type: "present-background",
            chatKey: workspaceChatKeyForSession(action.sessionID),
            target: action.command.target,
            mode: defaults.mode,
          },
          { origin: "auto-open", autoOpen },
        ),
      )
    }
    logBenchToggleStep("client-action-ledger-execute-present-before-controller", {
      action,
      autoOpen,
    })
    const result = await this.#controller.execute(
      {
        type: "present",
        directory: action.directory,
        target: action.command.target,
        mode: BENCH_MODE_REQUEST_POLICY,
      },
      {
        origin: action.acknowledgement === "best-effort" ? "auto-open" : "agent",
        autoOpen,
      },
    )
    logBenchToggleStep("client-action-ledger-execute-present-result", {
      action,
      autoOpen,
      result,
    })
    return completionFromResult(result)
  }

  #claimWhiteboardForeground(key: string): boolean {
    if (this.#whiteboardForegroundClaims.has(key)) return false
    this.#whiteboardForegroundClaims.add(key)
    if (this.#whiteboardForegroundClaims.size > BENCH_CLIENT_ACTION_LEDGER_LIMIT) {
      const oldestKey = this.#whiteboardForegroundClaims.values().next().value
      if (oldestKey !== undefined) this.#whiteboardForegroundClaims.delete(oldestKey)
    }
    return true
  }

  async #complete(
    action: BenchClientActionV2,
    completion: BenchClientActionCompletionDraft,
  ): Promise<boolean> {
    logBenchToggleStep("client-action-ledger-complete-entry", {
      action,
      completion,
    })
    const completed = await this.#lifecycle.completeClientAction(
      Object.assign(
        {
          actionID: action.actionID,
          sessionID: action.sessionID,
          completion,
          getActiveSessionID: this.#getActiveSessionID,
        },
        completion.outcome === "captured" && action.command.type === "capture_bench_screenshot"
          ? {
              expectedCapture: {
                tabKey: action.command.tabKey,
                target: action.command.target,
                drawer: action.command.drawer,
              },
            }
          : undefined,
      ),
    )
    logBenchToggleStep("client-action-ledger-complete-result", {
      action,
      completion,
      completed,
    })
    return completed
  }

  #recordTerminal(action: BenchClientActionV2, completion: BenchClientActionCompletionDraft): void {
    const retainedCompletion =
      action.command.type === "capture_bench_screenshot" && completion.outcome === "captured"
        ? null
        : completion
    logBenchToggleStep("client-action-ledger-record-terminal", {
      actionID: action.actionID,
      outcome: completion.outcome,
      retainedCompletion: retainedCompletion !== null,
    })
    this.#entries.set(action.actionID, {
      status: LEDGER_STATUS_TERMINAL,
      completion: retainedCompletion,
      usedAt: this.#nextTerminalSequence(),
    })
    this.#evictTerminalEntries()
  }

  #queuePendingSessionAction(action: BenchClientActionV2): void {
    logBenchToggleStep("client-action-ledger-queue-pending-session-entry", {
      action,
    })
    this.#entries.set(action.actionID, {
      status: LEDGER_STATUS_PENDING_SESSION,
      action,
    })
    logBenchToggleStep("client-action-ledger-queue-pending-session-exit", {
      action,
      entryCount: this.#entries.size,
    })
  }

  #removePendingBestEffort(action: BenchClientActionV2): void {
    const key = bestEffortCoalescingKey(action)
    if (!key) return
    if (this.#bestEffortActionIDByKey.get(key) === action.actionID) {
      this.#bestEffortActionIDByKey.delete(key)
      logBenchToggleStep("client-action-ledger-remove-pending-best-effort", {
        action,
        key,
      })
    }
  }

  #nextTerminalSequence(): number {
    this.#terminalSequence += 1
    return this.#terminalSequence
  }

  #evictTerminalEntries(): void {
    const terminalEntries = Array.from(this.#entries.entries()).filter(
      (entry): entry is [string, Extract<LedgerEntry, { status: typeof LEDGER_STATUS_TERMINAL }>] =>
        entry[1].status === LEDGER_STATUS_TERMINAL,
    )
    if (terminalEntries.length <= BENCH_CLIENT_ACTION_LEDGER_LIMIT) return
    const evicted = terminalEntries
      .toSorted((left, right) => left[1].usedAt - right[1].usedAt)
      .slice(0, terminalEntries.length - BENCH_CLIENT_ACTION_LEDGER_LIMIT)
    logBenchToggleStep("client-action-ledger-evict-terminal-entries", {
      terminalEntryCount: terminalEntries.length,
      evictedActionIDs: evicted.map(([actionID]) => actionID),
    })
    for (const [actionID] of evicted) {
      const entry = this.#entries.get(actionID)
      if (entry?.status === LEDGER_STATUS_TERMINAL) {
        for (const [key, claimedActionID] of this.#bestEffortActionIDByKey) {
          if (claimedActionID === actionID) this.#bestEffortActionIDByKey.delete(key)
        }
      }
      this.#entries.delete(actionID)
    }
  }
}

export { readBenchClientActionEvent, readBenchClientLeaseEvent }
export type { BenchClientActionV2 }
