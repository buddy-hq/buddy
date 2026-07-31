import type { NavigateOptions } from "@tanstack/react-router"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  buildBenchNavigation,
  isSessionOwnedBenchTarget,
  isSameBenchTarget,
  readBenchOpenPolicyStateFromLocation,
  resolveBenchOpenPolicy,
  resolveBenchSurfaceDefaults,
  type BenchAutoOpenIdentity,
  type BenchMode,
  type BenchOpenDecision,
  type BenchOpenPolicyState,
  type BenchOpenRequest,
} from "@/lib/bench-navigation"
import { encodeDirectory } from "@/lib/directory-token"
import {
  allowBenchLeave,
  type BenchLeaveGuardInput,
  type BenchLeaveGuardResult,
  type BenchLeaveOrigin,
} from "@/lib/bench-leave-guard"
import {
  BENCH_ROUTE_STATUS_CLOSED,
  BENCH_ROUTE_STATUS_OPEN,
  WORKSPACE_PENDING_KIND_CHAT_TRANSITION,
  WORKSPACE_PENDING_KIND_NAVIGATION,
  WORKSPACE_PENDING_KIND_WORKSPACE_ONLY,
  WORKSPACE_COMMAND_QUEUE_LIMIT,
  WORKSPACE_HYDRATION_PENDING,
  createCollapsedWorkspaceState,
  createExpandedWorkspaceState,
  effectiveWorkspaceProjection,
  isSameBenchRouteSnapshot,
  workspacePresentationSlotForChat,
  type BenchRouteSnapshot,
  type DirectoryWorkspaceCommand,
  type DirectoryWorkspaceCommandResult,
  type DirectoryWorkspaceStore,
  type DockedWorkspaceState,
  type EffectiveWorkspaceProjection,
} from "@/state/directory-workspace-store"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"

const WORKSPACE_COMMAND_ID_PREFIX = "workspace-command"
const WORKSPACE_ATTEMPT_ID_PREFIX = "workspace-attempt"
const WORKSPACE_DIRECT_ATTEMPT_ID_PREFIX = "workspace-direct-attempt"

type DirectoryWorkspaceLocation = {
  pathname: string
  search: unknown
}

type DirectoryWorkspaceNavigate = (options: NavigateOptions) => Promise<DirectoryWorkspaceLocation>

type NavigationTerminalOutcome = "allowed" | "blocked" | "failed" | "superseded"

type RegisteredNavigationAttempt = {
  attemptID: string
  commandID: string
  origin: Exclude<BenchLeaveOrigin, "route">
  expectedDirectory: string
  expectedRoute: BenchRouteSnapshot
  leaveGuardSettled: boolean
}

type NavigationAttemptOutcome = {
  attemptID: string
  commandID: string | null
  outcome: NavigationTerminalOutcome
}

type DirectoryWorkspaceControllerInput = {
  directory: string
  store: DirectoryWorkspaceStore
  getRoute: () => BenchRouteSnapshot
  navigate: DirectoryWorkspaceNavigate
  blocker: DirectoryWorkspaceBlocker
}

type DirectoryWorkspaceCommandOptions = {
  origin: Exclude<BenchLeaveOrigin, "route">
  autoOpen?: BenchAutoOpenIdentity | null
}

function isForegroundCommand(options: DirectoryWorkspaceCommandOptions): boolean {
  return options.origin !== "auto-open"
}

type QueuedHydrationCommand = {
  kind: "command"
  command: DirectoryWorkspaceCommand
  options: DirectoryWorkspaceCommandOptions
  resolve: (result: DirectoryWorkspaceCommandResult) => void
}

type QueuedHydrationOpen = {
  kind: "open"
  request: BenchOpenRequest
  options: DirectoryWorkspaceCommandOptions
  resolve: (result: DirectoryWorkspaceOpenResult) => void
}

type QueuedHydrationWork = QueuedHydrationCommand | QueuedHydrationOpen

type DirectoryWorkspaceCommittedOpenResult = {
  decision: BenchOpenDecision
} & Extract<DirectoryWorkspaceCommandResult, { outcome: "committed" }>
type DirectoryWorkspaceTerminalOpenResult = Exclude<
  DirectoryWorkspaceCommandResult,
  { outcome: "committed" }
>
type DirectoryWorkspaceOpenResult =
  | DirectoryWorkspaceCommittedOpenResult
  | DirectoryWorkspaceTerminalOpenResult
type DirectoryWorkspaceGuardLeave = (
  input: BenchLeaveGuardInput,
) => BenchLeaveGuardResult | Promise<BenchLeaveGuardResult>

function openExecutionResult(
  decision: BenchOpenDecision,
  result: DirectoryWorkspaceCommandResult,
): DirectoryWorkspaceOpenResult {
  if (result.outcome === "committed") {
    return { ...result, decision }
  }
  return result
}

let commandIDSequence = 0
let attemptIDSequence = 0

function createSequencedID(prefix: string, sequence: number): string {
  return `${prefix}-${sequence}`
}

function createWorkspaceCommandID(): string {
  const randomID = globalThis.crypto?.randomUUID?.()
  if (randomID) return `${WORKSPACE_COMMAND_ID_PREFIX}-${randomID}`
  commandIDSequence += 1
  return createSequencedID(WORKSPACE_COMMAND_ID_PREFIX, commandIDSequence)
}

function createWorkspaceAttemptID(prefix = WORKSPACE_ATTEMPT_ID_PREFIX): string {
  const randomID = globalThis.crypto?.randomUUID?.()
  if (randomID) return `${prefix}-${randomID}`
  attemptIDSequence += 1
  return createSequencedID(prefix, attemptIDSequence)
}

function routeSnapshotToOpenPolicyState(
  directory: string,
  route: BenchRouteSnapshot,
): BenchOpenPolicyState {
  if (route.status === BENCH_ROUTE_STATUS_CLOSED) return { status: BENCH_ROUTE_STATUS_CLOSED }
  return {
    status: BENCH_ROUTE_STATUS_OPEN,
    directory,
    target: route.target,
    mode: route.mode,
    layoutProfile: resolveBenchSurfaceDefaults(route.target).layoutProfile,
  }
}

function openPolicyStateToRouteSnapshot(state: BenchOpenPolicyState): BenchRouteSnapshot {
  if (state.status === BENCH_ROUTE_STATUS_CLOSED) return { status: BENCH_ROUTE_STATUS_CLOSED }
  return {
    status: BENCH_ROUTE_STATUS_OPEN,
    target: state.target,
    mode: state.mode,
  }
}

function readBenchRouteSnapshotFromLocation(input: {
  directory: string
  pathname: string
  search: unknown
}): BenchRouteSnapshot {
  return openPolicyStateToRouteSnapshot(readBenchOpenPolicyStateFromLocation(input))
}

function buildChatNavigation(directory: string, replace = true): NavigateOptions {
  return {
    to: "/$directory/chat",
    params: { directory: encodeDirectory(directory) },
    replace,
    viewTransition: false,
  }
}

/**
 * Slot restoration replaces history: a chat switch is not a place the user can go "back" to.
 * Cross-surface entry points (Settings, the entry page) navigate *into* a notebook and must keep
 * pushing, so `replace` is the caller's decision rather than a property of the route.
 */
function buildWorkspaceRouteNavigation(input: {
  directory: string
  route: BenchRouteSnapshot
  replace?: boolean
}): NavigateOptions {
  const replace = input.replace ?? true
  if (input.route.status === BENCH_ROUTE_STATUS_CLOSED) {
    return buildChatNavigation(input.directory, replace)
  }
  return {
    ...buildBenchNavigation({
      directory: input.directory,
      target: input.route.target,
      mode: input.route.mode,
    }),
    replace,
    viewTransition: false,
  }
}

function disableBenchNavigationViewTransition(navigateOptions: NavigateOptions): NavigateOptions {
  return {
    ...navigateOptions,
    viewTransition: false,
  }
}

function projectionFromStore(input: {
  route: BenchRouteSnapshot
  store: DirectoryWorkspaceStore
}): EffectiveWorkspaceProjection {
  const state = input.store.getState()
  return effectiveWorkspaceProjection(
    input.route,
    { docked: state.docked, lastDrawer: state.lastDrawer },
    state.pendingIntent,
  )
}

function committedProjectionResult(input: {
  changed: boolean
  projection: EffectiveWorkspaceProjection
}): Extract<DirectoryWorkspaceCommandResult, { outcome: "committed" }> {
  return {
    outcome: "committed",
    changed: input.changed,
    projection: input.projection,
  }
}

function didProjectionChange(input: {
  previous: EffectiveWorkspaceProjection
  next: EffectiveWorkspaceProjection
}): boolean {
  return (
    !isSameBenchRouteSnapshot(input.previous.route, input.next.route) ||
    input.previous.renderedSurface !== input.next.renderedSurface ||
    input.previous.drawer !== input.next.drawer ||
    input.previous.bench.visibility !== input.next.bench.visibility ||
    input.previous.bench.targetKey !== input.next.bench.targetKey ||
    input.previous.bench.mode !== input.next.bench.mode ||
    input.previous.dockedState.visibility !== input.next.dockedState.visibility ||
    input.previous.dockedState.drawer !== input.next.dockedState.drawer
  )
}

function blockedProjectionResult(
  projection: EffectiveWorkspaceProjection,
): Extract<DirectoryWorkspaceCommandResult, { outcome: "blocked" }> {
  return {
    outcome: "blocked",
    reason: "leave_guard_blocked",
    projection,
  }
}

function failedProjectionResult(
  projection: EffectiveWorkspaceProjection,
): Extract<DirectoryWorkspaceCommandResult, { outcome: "failed" }> {
  return {
    outcome: "failed",
    reason: "navigation_failed",
    projection,
  }
}

function inactiveProjectionResult(
  projection: EffectiveWorkspaceProjection,
): Extract<DirectoryWorkspaceCommandResult, { outcome: "inactive" }> {
  return {
    outcome: "inactive",
    reason: "session_inactive",
    projection,
  }
}

function supersededProjectionResult(
  projection: EffectiveWorkspaceProjection,
): Extract<DirectoryWorkspaceCommandResult, { outcome: "superseded" }> {
  return {
    outcome: "superseded",
    reason: "newer_command",
    projection,
  }
}

function isGuardedRouteChange(input: {
  currentDirectory: string
  nextDirectory: string
  current: BenchRouteSnapshot
  next: BenchRouteSnapshot
}): boolean {
  if (input.current.status !== BENCH_ROUTE_STATUS_OPEN) return false
  if (input.currentDirectory !== input.nextDirectory) return true
  if (input.next.status === BENCH_ROUTE_STATUS_CLOSED) return true
  return !isSameBenchTarget(input.current.target, input.next.target)
}

function commandWorkspaceCommit(command: DirectoryWorkspaceCommand): DockedWorkspaceState {
  switch (command.type) {
    case "close":
    case "collapse":
    case "prepare-chat-change":
      return createCollapsedWorkspaceState()
    case "restore-chat":
    case "promote-chat":
      return createCollapsedWorkspaceState()
    case "open-drawer":
      return createExpandedWorkspaceState(command.drawer)
    case "close-drawer":
      return createExpandedWorkspaceState(null)
    case "present":
    case "reveal":
      return createExpandedWorkspaceState(null)
    case "set-mode":
      return command.mode === BENCH_CHAT_LAYOUT_DOCKED
        ? createExpandedWorkspaceState(null)
        : createCollapsedWorkspaceState()
  }
}

export class DirectoryWorkspaceBlocker {
  readonly #directory: string
  readonly #getCurrentRoute: () => BenchRouteSnapshot
  readonly #guardLeave: DirectoryWorkspaceGuardLeave
  #registeredAttempts = new Map<string, RegisteredNavigationAttempt>()
  #controllerAttempts = new Map<string, Pick<NavigationAttemptOutcome, "attemptID" | "commandID">>()
  #activeAttempts = new Map<string, Pick<NavigationAttemptOutcome, "attemptID" | "commandID">>()
  #outcomes = new Map<string, NavigationAttemptOutcome>()
  #disposed = false

  constructor(input: {
    directory: string
    getCurrentRoute: () => BenchRouteSnapshot
    guardLeave: DirectoryWorkspaceGuardLeave
  }) {
    this.#directory = input.directory
    this.#getCurrentRoute = input.getCurrentRoute
    this.#guardLeave = input.guardLeave
  }

  registerControllerAttempt(input: {
    commandID: string
    attemptID: string
    origin: Exclude<BenchLeaveOrigin, "route">
    expectedDirectory: string
    expectedRoute: BenchRouteSnapshot
    leaveGuardSettled?: boolean
  }): void {
    this.#registeredAttempts.set(input.attemptID, {
      ...input,
      leaveGuardSettled: input.leaveGuardSettled ?? false,
    })
    this.#controllerAttempts.set(input.attemptID, {
      attemptID: input.attemptID,
      commandID: input.commandID,
    })
  }

  readOutcome(attemptID: string): NavigationAttemptOutcome | undefined {
    return this.#outcomes.get(attemptID)
  }

  supersedeControllerAttempts(): void {
    for (const attempt of this.#controllerAttempts.values()) {
      this.#recordOutcome({ ...attempt, outcome: "superseded" })
    }
    this.#controllerAttempts.clear()
    this.#registeredAttempts.clear()
    for (const attempt of this.#activeAttempts.values()) {
      if (attempt.commandID !== null) continue
      this.#recordOutcome({ ...attempt, outcome: "superseded" })
    }
    this.#activeAttempts.clear()
  }

  finishControllerAttempt(attemptID: string): void {
    this.#controllerAttempts.delete(attemptID)
    this.#registeredAttempts.delete(attemptID)
    this.#activeAttempts.delete(attemptID)
    this.#outcomes.delete(attemptID)
  }

  dispose(): void {
    this.#disposed = true
    this.supersedeControllerAttempts()
    this.#outcomes.clear()
  }

  isDisposed(): boolean {
    return this.#disposed
  }

  async guardChatTransition(input: {
    next: BenchRouteSnapshot
    origin: Exclude<BenchLeaveOrigin, "route">
  }): Promise<BenchLeaveGuardResult> {
    if (this.#disposed) {
      return {
        status: "block",
        reason: "sync_error",
        message: "The workspace is no longer active.",
      }
    }
    const current = this.#getCurrentRoute()
    if (current.status !== BENCH_ROUTE_STATUS_OPEN) return allowBenchLeave()
    if (
      !isSessionOwnedBenchTarget(current.target) &&
      !isGuardedRouteChange({
        currentDirectory: this.#directory,
        nextDirectory: this.#directory,
        current,
        next: input.next,
      })
    ) {
      return allowBenchLeave()
    }
    return this.#guardLeave({
      intent: input.next.status === BENCH_ROUTE_STATUS_OPEN ? "replace-target" : "close",
      origin: input.origin,
      current: current.target,
      next: input.next.status === BENCH_ROUTE_STATUS_OPEN ? input.next.target : null,
    })
  }

  async shouldBlockNavigation(nextLocation: DirectoryWorkspaceLocation): Promise<boolean> {
    if (this.#disposed) return true

    const current = this.#getCurrentRoute()
    let registeredAttempt: RegisteredNavigationAttempt | null = null
    let registeredNext: BenchRouteSnapshot | null = null
    for (const attempt of this.#registeredAttempts.values()) {
      const attemptNext = readBenchRouteSnapshotFromLocation({
        directory: attempt.expectedDirectory,
        pathname: nextLocation.pathname,
        search: nextLocation.search,
      })
      if (!isSameBenchRouteSnapshot(attempt.expectedRoute, attemptNext)) continue
      registeredAttempt = attempt
      registeredNext = attemptNext
      this.#registeredAttempts.delete(attempt.attemptID)
      break
    }
    const nextDirectory = registeredAttempt?.expectedDirectory ?? this.#directory
    const next =
      registeredAttempt && registeredNext
        ? registeredNext
        : readBenchRouteSnapshotFromLocation({
            directory: this.#directory,
            pathname: nextLocation.pathname,
            search: nextLocation.search,
          })

    if (!registeredAttempt) {
      this.supersedeControllerAttempts()
    }

    if (
      !isGuardedRouteChange({
        currentDirectory: this.#directory,
        nextDirectory,
        current,
        next,
      })
    ) {
      if (registeredAttempt) {
        this.#recordOutcome({
          attemptID: registeredAttempt.attemptID,
          commandID: registeredAttempt.commandID,
          outcome: "allowed",
        })
      }
      return false
    }

    if (registeredAttempt?.leaveGuardSettled) {
      this.#recordOutcome({
        attemptID: registeredAttempt.attemptID,
        commandID: registeredAttempt.commandID,
        outcome: "allowed",
      })
      return false
    }

    const attemptID =
      registeredAttempt?.attemptID ?? createWorkspaceAttemptID(WORKSPACE_DIRECT_ATTEMPT_ID_PREFIX)
    const commandID = registeredAttempt?.commandID ?? null
    const origin = registeredAttempt?.origin ?? "route"
    this.#activeAttempts.set(attemptID, { attemptID, commandID })

    const guardResult =
      current.status === BENCH_ROUTE_STATUS_OPEN
        ? await this.#guardLeave({
            intent: next.status === BENCH_ROUTE_STATUS_OPEN ? "replace-target" : "close",
            origin,
            current: current.target,
            next: next.status === BENCH_ROUTE_STATUS_OPEN ? next.target : null,
          })
        : allowBenchLeave()

    if (this.#disposed || !this.#activeAttempts.has(attemptID)) {
      this.#recordOutcome({ attemptID, commandID, outcome: "superseded" })
      return true
    }

    if (guardResult.status === "block") {
      this.#recordOutcome({ attemptID, commandID, outcome: "blocked" })
      this.#activeAttempts.delete(attemptID)
      return true
    }

    this.#recordOutcome({ attemptID, commandID, outcome: "allowed" })
    this.#activeAttempts.delete(attemptID)
    return false
  }

  #recordOutcome(outcome: NavigationAttemptOutcome): void {
    if (outcome.commandID === null) return
    this.#outcomes.set(outcome.attemptID, outcome)
  }
}

export class DirectoryWorkspaceController {
  readonly #directory: string
  readonly #store: DirectoryWorkspaceStore
  readonly #getRoute: () => BenchRouteSnapshot
  readonly #navigate: DirectoryWorkspaceNavigate
  readonly #blocker: DirectoryWorkspaceBlocker
  #activeCommandID: string | null = null
  #activeForegroundCommandID: string | null = null
  #queuedHydrationCommands: QueuedHydrationWork[] = []
  #disposed = false

  constructor(input: DirectoryWorkspaceControllerInput) {
    this.#directory = input.directory
    this.#store = input.store
    this.#getRoute = input.getRoute
    this.#navigate = input.navigate
    this.#blocker = input.blocker
  }

  dispose(): void {
    logBenchToggleStep("workspace-controller-dispose-entry", {
      directory: this.#directory,
      activeCommandID: this.#activeCommandID,
      queuedHydrationCommands: this.#queuedHydrationCommands.length,
    })
    this.#disposed = true
    this.#activeCommandID = null
    this.#activeForegroundCommandID = null
    this.#blocker.dispose()
    const projection = this.#currentProjection()
    for (const queued of this.#queuedHydrationCommands.splice(0)) {
      const result = inactiveProjectionResult(projection)
      if (queued.kind === "open") {
        queued.resolve(result)
      } else {
        queued.resolve(result)
      }
    }
    logBenchToggleStep("workspace-controller-dispose-exit", {
      directory: this.#directory,
      projection,
    })
  }

  isDisposed(): boolean {
    return this.#disposed
  }

  authorizePreparedChatNavigation(input: {
    directory: string
    route: BenchRouteSnapshot
  }): () => void {
    if (this.#disposed) return () => undefined
    const commandID = createWorkspaceCommandID()
    const attemptID = createWorkspaceAttemptID()
    this.#blocker.supersedeControllerAttempts()
    this.#blocker.registerControllerAttempt({
      commandID,
      attemptID,
      origin: "user",
      expectedDirectory: input.directory,
      expectedRoute: input.route,
      leaveGuardSettled: true,
    })
    return () => {
      this.#blocker.finishControllerAttempt(attemptID)
    }
  }

  async execute(
    command: DirectoryWorkspaceCommand,
    options: DirectoryWorkspaceCommandOptions = { origin: "user" },
  ): Promise<DirectoryWorkspaceCommandResult> {
    if (command.type === "present") {
      const openResult = await this.executeOpen(
        {
          directory: command.directory,
          target: command.target,
          mode: command.mode,
          autoOpen: options.autoOpen ?? null,
        },
        options,
      )
      return openResult
    }

    logBenchToggleStep("workspace-controller-execute-entry", () => ({
      directory: this.#directory,
      command,
      options,
      disposed: this.#disposed,
      hydration: this.#store.getState().hydration,
      activeCommandID: this.#activeCommandID,
      queuedHydrationCommands: this.#queuedHydrationCommands.length,
      route: this.#getRoute(),
      projection: this.#currentProjection(),
    }))
    if (this.#disposed) {
      const result = inactiveProjectionResult(this.#currentProjection())
      logBenchToggleStep("workspace-controller-execute-disposed-result", {
        directory: this.#directory,
        command,
        result,
      })
      return result
    }
    if (this.#shouldDeferToForegroundCommand(options)) {
      const result = supersededProjectionResult(this.#currentProjection())
      logBenchToggleStep("workspace-controller-execute-background-superseded", {
        directory: this.#directory,
        command,
        options,
        activeForegroundCommandID: this.#activeForegroundCommandID,
        result,
      })
      return result
    }
    if (this.#store.getState().hydration.status === WORKSPACE_HYDRATION_PENDING) {
      logBenchToggleStep("workspace-controller-execute-hydration-pending", {
        directory: this.#directory,
        command,
        queueLength: this.#queuedHydrationCommands.length,
      })
      return this.#queueHydrationCommand(command, options)
    }

    const commandID = createWorkspaceCommandID()
    this.#activeCommandID = commandID
    this.#beginForegroundCommand(commandID, options)
    this.#blocker.supersedeControllerAttempts()
    logBenchToggleStep("workspace-controller-execute-command-created", {
      directory: this.#directory,
      commandID,
      command,
      route: this.#getRoute(),
    })

    try {
      if (
        command.type === "reveal" ||
        command.type === "collapse" ||
        command.type === "open-drawer" ||
        command.type === "close-drawer"
      ) {
        logBenchToggleStep("workspace-controller-execute-workspace-only-branch", {
          directory: this.#directory,
          commandID,
          command,
        })
        return this.#executeWorkspaceOnlyCommand(commandID, command)
      }

      if (command.type === "prepare-chat-change") {
        return await this.#executePrepareChatChangeCommand(commandID, command, options)
      }

      if (command.type === "restore-chat") {
        return await this.#executeRestoreChatCommand(commandID, command, options)
      }

      if (command.type === "promote-chat") {
        const previousProjection = this.#currentProjection()
        this.#store.getState().promoteChatSlot({
          from: command.from,
          to: command.to,
        })
        const projection = this.#currentProjection()
        return committedProjectionResult({
          changed: didProjectionChange({ previous: previousProjection, next: projection }),
          projection,
        })
      }

      if (command.type === "close") {
        logBenchToggleStep("workspace-controller-execute-close-branch", {
          directory: this.#directory,
          commandID,
        })
        return await this.#executeCloseCommand(commandID, options)
      }

      logBenchToggleStep("workspace-controller-execute-set-mode-branch", {
        directory: this.#directory,
        commandID,
        command,
      })
      return await this.#executeSetModeCommand(commandID, command.mode, options)
    } finally {
      this.#finishForegroundCommand(commandID)
    }
  }

  async executeOpen(
    request: BenchOpenRequest,
    options: DirectoryWorkspaceCommandOptions = { origin: "user" },
  ): Promise<DirectoryWorkspaceOpenResult> {
    logBenchToggleStep("workspace-controller-execute-open-entry", () => ({
      directory: this.#directory,
      request,
      options,
      disposed: this.#disposed,
      hydration: this.#store.getState().hydration,
      activeCommandID: this.#activeCommandID,
      route: this.#getRoute(),
      projection: this.#currentProjection(),
    }))
    if (this.#disposed) {
      return inactiveProjectionResult(this.#currentProjection())
    }
    if (this.#shouldDeferToForegroundCommand(options)) {
      const result = supersededProjectionResult(this.#currentProjection())
      logBenchToggleStep("workspace-controller-execute-open-background-superseded", {
        directory: this.#directory,
        request,
        options,
        activeForegroundCommandID: this.#activeForegroundCommandID,
        result,
      })
      return result
    }
    if (this.#store.getState().hydration.status === WORKSPACE_HYDRATION_PENDING) {
      return this.#queueHydrationOpen(request, options)
    }

    const commandID = createWorkspaceCommandID()
    this.#activeCommandID = commandID
    this.#beginForegroundCommand(commandID, options)
    this.#blocker.supersedeControllerAttempts()
    try {
      return await this.#executePresentCommand(
        commandID,
        {
          type: "present",
          directory: request.directory,
          target: request.target,
          mode: request.mode,
        },
        {
          ...options,
          autoOpen: request.autoOpen,
        },
      )
    } finally {
      this.#finishForegroundCommand(commandID)
    }
  }

  drainHydrationQueue(): void {
    logBenchToggleStep("workspace-controller-drain-hydration-queue-entry", {
      directory: this.#directory,
      disposed: this.#disposed,
      hydration: this.#store.getState().hydration,
      queuedHydrationCommands: this.#queuedHydrationCommands.length,
    })
    if (this.#disposed) return
    if (this.#store.getState().hydration.status === WORKSPACE_HYDRATION_PENDING) return
    const queuedCommands = this.#queuedHydrationCommands.splice(0)
    logBenchToggleStep("workspace-controller-drain-hydration-queue-draining", {
      directory: this.#directory,
      drainedCommands: queuedCommands.length,
    })
    for (const queued of queuedCommands) {
      if (queued.kind === "open") {
        void this.executeOpen(queued.request, queued.options).then(queued.resolve, () =>
          queued.resolve(inactiveProjectionResult(this.#currentProjection())),
        )
      } else {
        void this.execute(queued.command, queued.options).then(queued.resolve, () =>
          queued.resolve(inactiveProjectionResult(this.#currentProjection())),
        )
      }
    }
  }

  #hasQueuedForegroundCommand(): boolean {
    return this.#queuedHydrationCommands.some((queued) => isForegroundCommand(queued.options))
  }

  #shouldDeferToForegroundCommand(options: DirectoryWorkspaceCommandOptions): boolean {
    return (
      !isForegroundCommand(options) &&
      (this.#activeForegroundCommandID !== null || this.#hasQueuedForegroundCommand())
    )
  }

  #beginForegroundCommand(commandID: string, options: DirectoryWorkspaceCommandOptions): void {
    if (isForegroundCommand(options)) {
      this.#activeForegroundCommandID = commandID
    }
  }

  #finishForegroundCommand(commandID: string): void {
    if (this.#activeForegroundCommandID === commandID) {
      this.#activeForegroundCommandID = null
    }
  }

  #supersedeQueuedBackgroundWorkForForeground(): void {
    const queuedWork = this.#queuedHydrationCommands.splice(0)
    for (const queued of queuedWork) {
      if (isForegroundCommand(queued.options)) {
        this.#queuedHydrationCommands.push(queued)
        continue
      }
      this.#supersedeQueuedWork(queued)
    }
  }

  #queueHydrationCommand(
    command: DirectoryWorkspaceCommand,
    options: DirectoryWorkspaceCommandOptions,
  ): Promise<DirectoryWorkspaceCommandResult> {
    return new Promise((resolve) => {
      if (isForegroundCommand(options)) {
        this.#supersedeQueuedBackgroundWorkForForeground()
      }
      logBenchToggleStep("workspace-controller-queue-hydration-command-entry", {
        directory: this.#directory,
        command,
        options,
        queueLength: this.#queuedHydrationCommands.length,
      })
      if (this.#queuedHydrationCommands.length >= WORKSPACE_COMMAND_QUEUE_LIMIT) {
        const evicted = this.#queuedHydrationCommands.shift()
        logBenchToggleStep("workspace-controller-queue-hydration-command-evict", {
          directory: this.#directory,
          evictedKind: evicted?.kind,
        })
        this.#supersedeQueuedWork(evicted)
      }
      this.#queuedHydrationCommands.push({
        kind: "command",
        command,
        options,
        resolve,
      })
      logBenchToggleStep("workspace-controller-queue-hydration-command-exit", {
        directory: this.#directory,
        command,
        queueLength: this.#queuedHydrationCommands.length,
      })
    })
  }

  #queueHydrationOpen(
    request: BenchOpenRequest,
    options: DirectoryWorkspaceCommandOptions,
  ): Promise<DirectoryWorkspaceOpenResult> {
    return new Promise((resolve) => {
      if (isForegroundCommand(options)) {
        this.#supersedeQueuedBackgroundWorkForForeground()
      }
      if (this.#queuedHydrationCommands.length >= WORKSPACE_COMMAND_QUEUE_LIMIT) {
        const evicted = this.#queuedHydrationCommands.shift()
        this.#supersedeQueuedWork(evicted)
      }
      this.#queuedHydrationCommands.push({
        kind: "open",
        request,
        options,
        resolve,
      })
    })
  }

  #supersedeQueuedWork(queued: QueuedHydrationWork | undefined): void {
    if (!queued) return
    const result = supersededProjectionResult(this.#currentProjection())
    if (queued.kind === "open") {
      queued.resolve(result)
    } else {
      queued.resolve(result)
    }
  }

  #executeWorkspaceOnlyCommand(
    commandID: string,
    command: DirectoryWorkspaceCommand,
  ): DirectoryWorkspaceCommandResult {
    const route = this.#routeForNextCommand()
    const previousProjection = this.#currentProjection()
    const workspaceCommit =
      command.type === "close-drawer" && route.status === BENCH_ROUTE_STATUS_CLOSED
        ? createCollapsedWorkspaceState()
        : commandWorkspaceCommit(command)
    logBenchToggleStep("workspace-controller-workspace-only-before-pending", () => ({
      directory: this.#directory,
      commandID,
      command,
      route,
      previousProjection,
      workspaceCommit,
      storeState: this.#store.getState(),
    }))
    this.#store.getState().setPendingIntent({
      kind: WORKSPACE_PENDING_KIND_WORKSPACE_ONLY,
      commandID,
      previousProjection,
      workspaceCommit,
    })
    logBenchToggleStep("workspace-controller-workspace-only-after-pending", () => ({
      directory: this.#directory,
      commandID,
      command,
      projection: this.#currentProjection(),
      storeState: this.#store.getState(),
    }))
    this.#store.getState().commitDockedState({ commandID, docked: workspaceCommit })
    logBenchToggleStep("workspace-controller-workspace-only-after-commit", () => ({
      directory: this.#directory,
      commandID,
      command,
      projection: this.#currentProjection(),
      storeState: this.#store.getState(),
    }))
    const projection = this.#currentProjection()
    const changed = didProjectionChange({ previous: previousProjection, next: projection })
    const result = committedProjectionResult({ changed, projection })
    logBenchToggleStep("workspace-controller-workspace-only-after-record-result", () => ({
      directory: this.#directory,
      commandID,
      command,
      changed,
      result,
      storeState: this.#store.getState(),
    }))
    if (command.type === "open-drawer") {
      this.#store.getState().setLastDrawer(command.drawer)
      logBenchToggleStep("workspace-controller-workspace-only-after-last-drawer", () => ({
        directory: this.#directory,
        commandID,
        command,
        storeState: this.#store.getState(),
      }))
    }
    return result
  }

  async #executePresentCommand(
    commandID: string,
    command: Extract<DirectoryWorkspaceCommand, { type: "present" }>,
    options: DirectoryWorkspaceCommandOptions,
  ): Promise<DirectoryWorkspaceOpenResult> {
    const currentRoute = this.#routeForNextCommand()
    const currentProjection = this.#currentProjection()
    const currentVisible = currentProjection.bench.visibility === "visible"
    logBenchToggleStep("workspace-controller-present-entry", {
      directory: this.#directory,
      commandID,
      command,
      options,
      currentRoute,
      currentProjection,
      currentVisible,
    })
    const decision = resolveBenchOpenPolicy({
      request: {
        directory: command.directory,
        target: command.target,
        mode: command.mode,
        autoOpen: options.autoOpen ?? null,
      } satisfies BenchOpenRequest,
      current: routeSnapshotToOpenPolicyState(this.#directory, currentRoute),
      currentVisible,
      defaults: resolveBenchSurfaceDefaults(command.target),
      autoOpenSuppressed: false,
    })
    logBenchToggleStep("workspace-controller-present-policy-decision", {
      directory: this.#directory,
      commandID,
      command,
      decision,
    })

    if (decision.action === "ignore") {
      if (
        decision.policyID === "already-open" &&
        currentRoute.status === BENCH_ROUTE_STATUS_OPEN &&
        currentRoute.mode === BENCH_CHAT_LAYOUT_DOCKED &&
        currentProjection.bench.visibility === "parked"
      ) {
        return openExecutionResult(
          decision,
          this.#executeWorkspaceOnlyCommand(commandID, { type: "reveal" }),
        )
      }

      const result = committedProjectionResult({ changed: false, projection: currentProjection })
      logBenchToggleStep("workspace-controller-present-ignore-result", {
        directory: this.#directory,
        commandID,
        command,
        decision,
        result,
      })
      return openExecutionResult(decision, result)
    }

    logBenchToggleStep("workspace-controller-present-navigation-request", {
      directory: this.#directory,
      commandID,
      command,
      decision,
    })
    return openExecutionResult(
      decision,
      await this.#executeNavigationCommand({
        commandID,
        expectedDirectory: decision.directory,
        expectedRoute: {
          status: BENCH_ROUTE_STATUS_OPEN,
          target: decision.target,
          mode: decision.mode,
        },
        workspaceCommit:
          decision.mode === BENCH_CHAT_LAYOUT_DOCKED
            ? createExpandedWorkspaceState(null)
            : createCollapsedWorkspaceState(),
        navigateOptions: {
          ...buildBenchNavigation({
            directory: decision.directory,
            target: decision.target,
            mode: decision.mode,
          }),
          replace: currentRoute.status === BENCH_ROUTE_STATUS_OPEN,
        },
        origin: options.origin,
      }),
    )
  }

  async #executeCloseCommand(
    commandID: string,
    options: DirectoryWorkspaceCommandOptions,
  ): Promise<DirectoryWorkspaceCommandResult> {
    const currentRoute = this.#routeForNextCommand()
    logBenchToggleStep("workspace-controller-close-entry", () => ({
      directory: this.#directory,
      commandID,
      currentRoute,
      projection: this.#currentProjection(),
    }))
    if (currentRoute.status === BENCH_ROUTE_STATUS_CLOSED) {
      return this.#executeWorkspaceOnlyCommand(commandID, { type: "collapse" })
    }

    return this.#executeNavigationCommand({
      commandID,
      expectedDirectory: this.#directory,
      expectedRoute: { status: BENCH_ROUTE_STATUS_CLOSED },
      workspaceCommit: createCollapsedWorkspaceState(),
      navigateOptions: buildChatNavigation(this.#directory),
      origin: options.origin,
    })
  }

  async #executePrepareChatChangeCommand(
    commandID: string,
    command: Extract<DirectoryWorkspaceCommand, { type: "prepare-chat-change" }>,
    options: DirectoryWorkspaceCommandOptions,
  ): Promise<DirectoryWorkspaceCommandResult> {
    const currentRoute = this.#routeForNextCommand()
    const previousProjection = this.#currentProjection()
    const currentPendingIntent = this.#store.getState().pendingIntent
    const destinationSlot = command.resetDestination
      ? {
          route: { status: BENCH_ROUTE_STATUS_CLOSED } satisfies BenchRouteSnapshot,
          docked: createCollapsedWorkspaceState(),
          lastDrawer: this.#store.getState().lastDrawer,
        }
      : workspacePresentationSlotForChat(this.#store.getState().slots, command.destinationChatKey)
    if (currentPendingIntent?.kind !== WORKSPACE_PENDING_KIND_CHAT_TRANSITION) {
      const guardResult = await this.#blocker.guardChatTransition({
        next: destinationSlot.route,
        origin: options.origin,
      })
      if (guardResult.status === "block") {
        return blockedProjectionResult(previousProjection)
      }
    }
    if (this.#disposed || this.#activeCommandID !== commandID) {
      return supersededProjectionResult(this.#currentProjection())
    }
    if (
      currentPendingIntent?.kind !== WORKSPACE_PENDING_KIND_CHAT_TRANSITION &&
      this.#store.getState().activeChatKey === command.outgoingChatKey
    ) {
      this.#store.getState().captureChatSlot({
        chatKey: command.outgoingChatKey,
        route: currentRoute,
      })
    }
    this.#store.getState().stageChatTransition({
      commandID,
      chatKey: command.destinationChatKey,
      reset: command.resetDestination,
      previousProjection,
    })
    const projection = this.#currentProjection()
    return committedProjectionResult({
      changed: didProjectionChange({ previous: previousProjection, next: projection }),
      projection,
    })
  }

  async #executeRestoreChatCommand(
    commandID: string,
    command: Extract<DirectoryWorkspaceCommand, { type: "restore-chat" }>,
    options: DirectoryWorkspaceCommandOptions,
  ): Promise<DirectoryWorkspaceCommandResult> {
    const state = this.#store.getState()
    const previousProjection = this.#currentProjection()
    const leaveGuardSettled = state.pendingIntent?.kind === WORKSPACE_PENDING_KIND_CHAT_TRANSITION
    if (state.activeChatKey !== command.chatKey) {
      state.stageChatTransition({
        commandID,
        chatKey: command.chatKey,
        reset: false,
        previousProjection,
      })
    }
    const slot = workspacePresentationSlotForChat(this.#store.getState().slots, command.chatKey)
    const currentRoute = this.#routeForNextCommand()
    if (isSameBenchRouteSnapshot(currentRoute, slot.route)) {
      this.#store.getState().setPendingIntent({
        kind: WORKSPACE_PENDING_KIND_WORKSPACE_ONLY,
        commandID,
        previousProjection,
        workspaceCommit: slot.docked,
      })
      this.#store.getState().commitDockedState({
        commandID,
        docked: slot.docked,
      })
      const projection = this.#currentProjection()
      return committedProjectionResult({
        changed: didProjectionChange({ previous: previousProjection, next: projection }),
        projection,
      })
    }

    const result = await this.#executeNavigationCommand({
      commandID,
      expectedDirectory: this.#directory,
      expectedRoute: slot.route,
      workspaceCommit: slot.docked,
      navigateOptions: buildWorkspaceRouteNavigation({
        directory: this.#directory,
        route: slot.route,
      }),
      origin: options.origin,
      leaveGuardSettled,
    })
    if (result.outcome !== "committed" && result.outcome !== "superseded") {
      this.#commitRestoreFallback(commandID, previousProjection)
    }
    return result
  }

  /**
   * A restore navigation that neither committed nor was superseded leaves the destination chat
   * without a presentation. Commit a collapsed slot under the still-live command ID so the
   * projection cannot keep reporting a chat transition, and so the destination never inherits the
   * outgoing chat's Bench route. A superseded restore is skipped: the newer command owns the store.
   */
  #commitRestoreFallback(
    commandID: string,
    previousProjection: EffectiveWorkspaceProjection,
  ): void {
    const docked = createCollapsedWorkspaceState()
    this.#store.getState().setPendingIntent({
      kind: WORKSPACE_PENDING_KIND_WORKSPACE_ONLY,
      commandID,
      previousProjection,
      workspaceCommit: docked,
    })
    this.#store.getState().commitDockedState({
      commandID,
      docked,
      route: { status: BENCH_ROUTE_STATUS_CLOSED },
    })
  }

  async #executeSetModeCommand(
    commandID: string,
    mode: BenchMode,
    options: DirectoryWorkspaceCommandOptions,
  ): Promise<DirectoryWorkspaceCommandResult> {
    const currentRoute = this.#routeForNextCommand()
    logBenchToggleStep("workspace-controller-set-mode-entry", () => ({
      directory: this.#directory,
      commandID,
      mode,
      options,
      currentRoute,
      projection: this.#currentProjection(),
    }))
    if (currentRoute.status === BENCH_ROUTE_STATUS_CLOSED) {
      return this.#executeWorkspaceOnlyCommand(commandID, {
        type: mode === BENCH_CHAT_LAYOUT_DOCKED ? "reveal" : "collapse",
      })
    }

    if (currentRoute.mode === mode) {
      const projection = this.#currentProjection()
      const result = committedProjectionResult({ changed: false, projection })
      logBenchToggleStep("workspace-controller-set-mode-noop-result", {
        directory: this.#directory,
        commandID,
        mode,
        result,
      })
      return result
    }

    return this.#executeNavigationCommand({
      commandID,
      expectedDirectory: this.#directory,
      expectedRoute: {
        status: BENCH_ROUTE_STATUS_OPEN,
        target: currentRoute.target,
        mode,
      },
      workspaceCommit:
        mode === BENCH_CHAT_LAYOUT_DOCKED
          ? createExpandedWorkspaceState(null)
          : createCollapsedWorkspaceState(),
      navigateOptions: {
        ...buildBenchNavigation({
          directory: this.#directory,
          target: currentRoute.target,
          mode,
        }),
        replace: true,
      },
      origin: options.origin,
    })
  }

  async #executeNavigationCommand(input: {
    commandID: string
    expectedDirectory: string
    expectedRoute: BenchRouteSnapshot
    workspaceCommit: DockedWorkspaceState
    navigateOptions: NavigateOptions
    origin: Exclude<BenchLeaveOrigin, "route">
    leaveGuardSettled?: boolean
  }): Promise<DirectoryWorkspaceCommandResult> {
    const previousProjection = this.#currentProjection()
    const attemptID = createWorkspaceAttemptID()
    const navigateOptions = disableBenchNavigationViewTransition(input.navigateOptions)
    logBenchToggleStep("workspace-controller-navigation-before-pending", () => ({
      directory: this.#directory,
      input: { ...input, navigateOptions },
      attemptID,
      previousProjection,
      storeState: this.#store.getState(),
    }))
    this.#store.getState().setPendingIntent({
      kind: WORKSPACE_PENDING_KIND_NAVIGATION,
      commandID: input.commandID,
      attemptID,
      previousProjection,
      expectedRoute: input.expectedRoute,
      workspaceCommit: input.workspaceCommit,
    })
    logBenchToggleStep("workspace-controller-navigation-after-pending", () => ({
      directory: this.#directory,
      input: { ...input, navigateOptions },
      attemptID,
      projection: this.#currentProjection(),
      storeState: this.#store.getState(),
    }))
    this.#blocker.registerControllerAttempt({
      commandID: input.commandID,
      attemptID,
      origin: input.origin,
      expectedDirectory: input.expectedDirectory,
      expectedRoute: input.expectedRoute,
      leaveGuardSettled: input.leaveGuardSettled,
    })

    let navigatedLocation: DirectoryWorkspaceLocation
    try {
      logBenchToggleStep("workspace-controller-navigation-before-navigate", {
        directory: this.#directory,
        input: { ...input, navigateOptions },
        attemptID,
      })
      navigatedLocation = await this.#navigate(navigateOptions)
      logBenchToggleStep("workspace-controller-navigation-after-navigate", {
        directory: this.#directory,
        input: { ...input, navigateOptions },
        attemptID,
        route: this.#getRoute(),
      })
    } catch (error) {
      logBenchToggleStep("workspace-controller-navigation-navigate-error", {
        directory: this.#directory,
        input: { ...input, navigateOptions },
        attemptID,
        error,
      })
      return this.#finishNavigationFailure(input.commandID, attemptID)
    }

    if (this.#disposed || this.#activeCommandID !== input.commandID) {
      this.#store.getState().clearPendingIntent(input.commandID)
      logBenchToggleStep("workspace-controller-navigation-superseded-after-navigate", {
        directory: this.#directory,
        input,
        attemptID,
        disposed: this.#disposed,
        activeCommandID: this.#activeCommandID,
      })
      const result = supersededProjectionResult(previousProjection)
      return this.#finishNavigationAttempt(attemptID, result)
    }

    const navigationOutcome = this.#blocker.readOutcome(attemptID)
    if (
      navigationOutcome?.outcome === "superseded" ||
      (navigationOutcome && navigationOutcome.commandID !== input.commandID)
    ) {
      this.#store.getState().clearPendingIntent(input.commandID)
      const result = supersededProjectionResult(previousProjection)
      return this.#finishNavigationAttempt(attemptID, result)
    }

    const finalRoute = readBenchRouteSnapshotFromLocation({
      directory: input.expectedDirectory,
      pathname: navigatedLocation.pathname,
      search: navigatedLocation.search,
    })
    if (!isSameBenchRouteSnapshot(finalRoute, input.expectedRoute)) {
      const blockerOutcome = this.#blocker.readOutcome(attemptID)
      this.#store.getState().clearPendingIntent(input.commandID)
      logBenchToggleStep("workspace-controller-navigation-route-mismatch", {
        directory: this.#directory,
        input,
        attemptID,
        finalRoute,
        blockerOutcome,
      })
      const result =
        blockerOutcome?.outcome === "blocked"
          ? blockedProjectionResult(previousProjection)
          : blockerOutcome?.outcome === "superseded"
            ? supersededProjectionResult(previousProjection)
            : failedProjectionResult(previousProjection)
      return this.#finishNavigationAttempt(attemptID, result)
    }

    if (input.expectedDirectory !== this.#directory) {
      this.#store.getState().clearPendingIntent(input.commandID)
      const result = committedProjectionResult({ changed: true, projection: previousProjection })
      logBenchToggleStep("workspace-controller-navigation-cross-directory-result", {
        directory: this.#directory,
        input,
        attemptID,
        finalRoute,
        result,
      })
      return this.#finishNavigationAttempt(attemptID, result)
    }

    logBenchToggleStep("workspace-controller-navigation-before-commit", {
      directory: this.#directory,
      input,
      attemptID,
      finalRoute,
    })
    this.#store.getState().commitDockedState({
      commandID: input.commandID,
      docked: input.workspaceCommit,
      route: finalRoute,
    })
    const projection = this.#projectionForRoute(finalRoute)
    const changed = didProjectionChange({ previous: previousProjection, next: projection })
    const result = committedProjectionResult({ changed, projection })
    logBenchToggleStep("workspace-controller-navigation-after-record-result", () => ({
      directory: this.#directory,
      input,
      attemptID,
      changed,
      result,
      storeState: this.#store.getState(),
    }))
    return this.#finishNavigationAttempt(attemptID, result)
  }

  #finishNavigationFailure(commandID: string, attemptID: string): DirectoryWorkspaceCommandResult {
    this.#store.getState().clearPendingIntent(commandID)
    const blockerOutcome = this.#blocker.readOutcome(attemptID)
    const projection = this.#currentProjection()
    const result = this.#disposed
      ? inactiveProjectionResult(projection)
      : this.#activeCommandID !== commandID || blockerOutcome?.outcome === "superseded"
        ? supersededProjectionResult(projection)
        : blockerOutcome?.outcome === "blocked"
          ? blockedProjectionResult(projection)
          : failedProjectionResult(projection)
    logBenchToggleStep("workspace-controller-navigation-failure-result", {
      directory: this.#directory,
      commandID,
      attemptID,
      blockerOutcome,
      result,
    })
    return this.#finishNavigationAttempt(attemptID, result)
  }

  #finishNavigationAttempt(
    attemptID: string,
    result: DirectoryWorkspaceCommandResult,
  ): DirectoryWorkspaceCommandResult {
    this.#blocker.finishControllerAttempt(attemptID)
    return result
  }

  #currentProjection(): EffectiveWorkspaceProjection {
    return projectionFromStore({ route: this.#getRoute(), store: this.#store })
  }

  #projectionForRoute(route: BenchRouteSnapshot): EffectiveWorkspaceProjection {
    return projectionFromStore({ route, store: this.#store })
  }

  #routeForNextCommand(): BenchRouteSnapshot {
    const pendingIntent = this.#store.getState().pendingIntent
    if (pendingIntent?.kind === WORKSPACE_PENDING_KIND_NAVIGATION) {
      return pendingIntent.expectedRoute
    }
    return this.#getRoute()
  }
}

export {
  buildChatNavigation,
  buildWorkspaceRouteNavigation,
  readBenchRouteSnapshotFromLocation,
  type DirectoryWorkspaceCommandOptions,
  type DirectoryWorkspaceLocation,
  type DirectoryWorkspaceOpenResult,
}
