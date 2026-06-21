import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"
import type {
  BenchLeaveGuardInput,
  BenchLeaveGuardResult,
} from "@/lib/bench-leave-guard"
import { allowBenchLeave } from "@/lib/bench-leave-guard"
import { benchTargetKey, type BenchTarget } from "@/lib/bench-navigation"
import type {
  DirectoryWorkspaceHydrationState,
  DrawerKind,
  EffectiveWorkspaceProjection,
} from "@/state/directory-workspace-store"
import type {
  BenchClientActionsCompleteData,
  BenchContextPublishData,
  EventStreamData,
} from "@buddy/sdk/types"

type BenchReadContextOutput = BenchContextPublishData["body"]["value"]
type BenchReadContextOpenOutput = Extract<BenchReadContextOutput, { status: "open" }>
type BenchReadSurfaceContextOpenOutput = Omit<BenchReadContextOpenOutput, "drawer"> &
  Partial<Pick<BenchReadContextOpenOutput, "drawer">>
type BenchClientLeaseIdentity = BenchContextPublishData["body"]["lease"]
type BenchClientLease = BenchClientLeaseIdentity & {
  directory: string
}
type BenchEventStreamLeaseQuery = Pick<
  NonNullable<EventStreamData["query"]>,
  "workspaceInstanceID" | "connectionGeneration"
>
type BenchClientActionCompletion = BenchClientActionsCompleteData["body"]
type BenchCommittedClientActionCompletion = Extract<
  BenchClientActionCompletion,
  { outcome: "committed" }
>
type BenchTerminalClientActionCompletion = Exclude<
  BenchClientActionCompletion,
  BenchCommittedClientActionCompletion
>
type BenchClientActionCompletionDraft =
  | Omit<BenchCommittedClientActionCompletion, "lease" | "publicationSequence" | "context">
  | Omit<BenchTerminalClientActionCompletion, "lease">

type BenchSurfaceSnapshot = {
  target: BenchTarget
  targetKey: string
  semanticRevision: number
  context: BenchReadSurfaceContextOpenOutput
}

type BenchSurfaceSynchronizationReason = "watcher" | "turn-complete" | "context-flush"

type BenchSurfaceSynchronizationResult = {
  changed: boolean
}

type BenchSurfaceRegistrationInput = {
  target: BenchTarget
  getSnapshot: () => BenchSurfaceSnapshot
  subscribe: (listener: () => void) => () => void
  synchronize?: (
    reason: BenchSurfaceSynchronizationReason,
  ) => Promise<BenchSurfaceSynchronizationResult>
  guardLeave?: (
    input: BenchLeaveGuardInput,
  ) => BenchLeaveGuardResult | Promise<BenchLeaveGuardResult>
}

type BenchSurfaceRegistration = BenchSurfaceRegistrationInput & {
  registrationID: string
  targetKey: string
  order: number
  unsubscribe: () => void
}

type BenchContextPublishSnapshot =
  | {
      status: "closed"
      publicationKey: string
      value: BenchReadContextOutput
    }
  | {
      status: "open"
      publicationKey: string
      value: BenchReadContextOutput
    }

const DIRECTORY_WORKSPACE_REGISTRATION_ID_PREFIX = "bench-surface-registration"
const DIRECTORY_WORKSPACE_INSTANCE_ID_PREFIX = "bench-workspace"
const DIRECTORY_WORKSPACE_FALLBACK_REVISION = 0
const WORKSPACE_PATH_SEPARATOR = "/"

let registrationIDSequence = 0
let workspaceInstanceIDSequence = 0

function nextRegistrationID(): string {
  const randomID = globalThis.crypto?.randomUUID?.()
  if (randomID) return `${DIRECTORY_WORKSPACE_REGISTRATION_ID_PREFIX}-${randomID}`
  registrationIDSequence += 1
  return `${DIRECTORY_WORKSPACE_REGISTRATION_ID_PREFIX}-${registrationIDSequence}`
}

function nextWorkspaceInstanceID(): string {
  const randomID = globalThis.crypto?.randomUUID?.()
  if (randomID) return `${DIRECTORY_WORKSPACE_INSTANCE_ID_PREFIX}-${randomID}`
  workspaceInstanceIDSequence += 1
  return `${DIRECTORY_WORKSPACE_INSTANCE_ID_PREFIX}-${workspaceInstanceIDSequence}`
}

function drawerPublicationValue(drawer: DrawerKind | null): string {
  return drawer ?? "none"
}

function closedPublicationKey(input: {
  directory: string
  sessionID: string
  visibility: EffectiveWorkspaceProjection["bench"]["visibility"]
}): string {
  return [input.directory, input.sessionID, "closed", input.visibility].join("\u0000")
}

function openPublicationKey(input: {
  directory: string
  sessionID: string
  targetKey: string
  visibility: EffectiveWorkspaceProjection["bench"]["visibility"]
  drawer: DrawerKind | null
  semanticRevision: number
}): string {
  return [
    input.directory,
    input.sessionID,
    input.targetKey,
    input.visibility,
    drawerPublicationValue(input.drawer),
    String(input.semanticRevision),
  ].join("\u0000")
}

function publishIdempotencyKey(input: {
  publicationKey: string
  lease: BenchClientLeaseIdentity
  publicationSequence: number
}): string {
  return [
    input.publicationKey,
    input.lease.instanceID,
    String(input.lease.generation),
    String(input.lease.leaseEpoch),
    String(input.publicationSequence),
  ].join("\u0000")
}

function closedBenchContext(): BenchReadContextOutput {
  return { status: "closed" }
}

function drawerContext(drawer: DrawerKind | null): BenchReadContextOpenOutput["drawer"] {
  return drawer
    ? {
        kind: drawer,
        presentation: "drawer",
      }
    : null
}

function withDrawerContext(input: {
  context: BenchReadSurfaceContextOpenOutput
  drawer: DrawerKind | null
}): BenchReadContextOpenOutput {
  const { drawer: _drawer, ...context } = input.context
  return {
    ...context,
    drawer: drawerContext(input.drawer),
  }
}

function snapshotMatchesBenchTarget(input: {
  snapshot: BenchSurfaceSnapshot
  target: BenchTarget
}): boolean {
  const targetKey = benchTargetKey(input.target)
  return (
    input.snapshot.targetKey === targetKey &&
    input.snapshot.context.targetKey === targetKey &&
    benchTargetKey(input.snapshot.target) === targetKey
  )
}

function normalizeWorkspaceFilePath(path: string): string {
  return path.replaceAll("\\", WORKSPACE_PATH_SEPARATOR).replace(/^\.?\//u, "")
}

function workspaceFileSignalMatchesTarget(input: {
  signalPath: string
  targetPath: string
}): boolean {
  const signalPath = normalizeWorkspaceFilePath(input.signalPath)
  const targetPath = normalizeWorkspaceFilePath(input.targetPath)
  return (
    signalPath === targetPath ||
    targetPath.startsWith(`${signalPath}${WORKSPACE_PATH_SEPARATOR}`)
  )
}

function contextTargetDiagnosticValue(
  target: BenchReadContextOpenOutput["target"],
): Record<string, unknown> {
  if (target.type === "workspace-file") {
    return {
      type: target.type,
      path: target.path,
      route: target.route,
      status: target.status,
    }
  }

  return {
    type: target.type,
    kind: target.ref.kind,
    objectID: target.ref.objectID,
    revisionID: target.ref.revisionID,
    itemID: target.ref.itemID,
    viewID: target.viewID,
    route: target.route,
    status: target.status,
  }
}

function contextTargetDiagnostic(value: BenchReadContextOutput): Record<string, unknown> {
  if (value.status === "closed") return { status: value.status }
  return {
    status: value.status,
    targetKey: value.targetKey,
    target: contextTargetDiagnosticValue(value.target),
  }
}

function surfaceContextDiagnostic(value: BenchReadSurfaceContextOpenOutput): Record<string, unknown> {
  return {
    status: value.status,
    targetKey: value.targetKey,
    target: contextTargetDiagnosticValue(value.target),
  }
}

function snapshotDiagnostic(snapshot: BenchContextPublishSnapshot | null): Record<string, unknown> {
  if (!snapshot) return { status: "missing" }
  return {
    status: snapshot.status,
    publicationKey: snapshot.publicationKey,
    value: contextTargetDiagnostic(snapshot.value),
  }
}

export class DirectoryWorkspaceLifecycleService {
  readonly #directory: string
  readonly #getProjection: () => EffectiveWorkspaceProjection
  readonly #getHydrationStatus: () => DirectoryWorkspaceHydrationState["status"]
  readonly #getRouteFallbackContext: (
    route: EffectiveWorkspaceProjection["route"],
  ) => BenchReadSurfaceContextOpenOutput | null
  readonly #instanceID = nextWorkspaceInstanceID()
  #registrations = new Map<string, BenchSurfaceRegistration>()
  #fallbackProvider:
    | (() => BenchReadSurfaceContextOpenOutput)
    | null = null
  #publishQueue: Promise<void> = Promise.resolve()
  #activeSessionID: string | undefined
  #requestedActiveSessionID: string | undefined
  #lastActiveSessionID: string | undefined
  #pendingClosedSessionIDs = new Set<string>()
  #lastPublishedKeyBySession = new Map<string, string>()
  #publicationSequenceBySession = new Map<string, number>()
  #connectionGeneration = 0
  #lease: BenchClientLease | null = null
  #disposed = false
  #disposePromise: Promise<void> | null = null
  #registrationOrderSequence = 0

  constructor(input: {
    directory: string
    getProjection: () => EffectiveWorkspaceProjection
    getHydrationStatus: () => DirectoryWorkspaceHydrationState["status"]
    getRouteFallbackContext: (
      route: EffectiveWorkspaceProjection["route"],
    ) => BenchReadSurfaceContextOpenOutput | null
  }) {
    this.#directory = input.directory
    this.#getProjection = input.getProjection
    this.#getHydrationStatus = input.getHydrationStatus
    this.#getRouteFallbackContext = input.getRouteFallbackContext
  }

  dispose(): Promise<void> {
    if (this.#disposePromise) return this.#disposePromise
    this.#disposed = true
    const sessionID =
      this.#activeSessionID ?? this.#requestedActiveSessionID ?? this.#lastActiveSessionID
    const lease = this.#lease
    for (const registration of this.#registrations.values()) {
      registration.unsubscribe()
    }
    this.#registrations.clear()
    this.#fallbackProvider = null

    const closeContext = this.#publishQueue.then(
      () => this.#publishClosedBeforeDisposal({ sessionID, lease }),
      () => this.#publishClosedBeforeDisposal({ sessionID, lease }),
    )
    this.#publishQueue = closeContext.then(
      () => undefined,
      () => undefined,
    )
    this.#disposePromise = closeContext.finally(() => {
      this.#activeSessionID = undefined
      this.#requestedActiveSessionID = undefined
      this.#lastActiveSessionID = undefined
      this.#pendingClosedSessionIDs.clear()
      this.#lastPublishedKeyBySession.clear()
      this.#publicationSequenceBySession.clear()
    })
    return this.#disposePromise
  }

  setActiveSessionID(sessionID: string | undefined): Promise<void> {
    if (this.#disposed) return Promise.resolve()
    this.#requestedActiveSessionID = sessionID
    const transition = this.#publishQueue.then(
      () => this.#transitionActiveSessionID(sessionID),
      () => this.#transitionActiveSessionID(sessionID),
    )
    this.#publishQueue = transition.then(
      () => undefined,
      () => undefined,
    )
    return transition
  }

  beginEventStreamLease(): BenchEventStreamLeaseQuery {
    this.#connectionGeneration += 1
    this.#lease = null
    this.#publicationSequenceBySession.clear()
    this.#lastPublishedKeyBySession.clear()
    return {
      workspaceInstanceID: this.#instanceID,
      connectionGeneration: this.#connectionGeneration,
    }
  }

  acceptLease(lease: BenchClientLease): void {
    if (this.#disposed) return
    if (lease.instanceID !== this.#instanceID) return
    if (lease.generation !== this.#connectionGeneration) return
    if (lease.directory !== this.#directory) return
    this.#lease = lease
    const synchronize = this.#publishQueue.then(
      () => this.#synchronizeAcceptedLease(),
      () => this.#synchronizeAcceptedLease(),
    )
    this.#publishQueue = synchronize.then(
      () => undefined,
      () => undefined,
    )
  }

  async releaseLease(): Promise<void> {
    const lease = this.#lease
    if (!lease) return
    this.#lease = null
    await getBuddyClient(this.#directory).bench.clientLease.release({
      instanceID: lease.instanceID,
      generation: lease.generation,
      leaseEpoch: lease.leaseEpoch,
    })
  }

  setFallbackProvider(
    provider: () => BenchReadSurfaceContextOpenOutput,
  ): () => void {
    this.#fallbackProvider = provider
    return () => {
      if (this.#fallbackProvider === provider) {
        this.#fallbackProvider = null
      }
    }
  }

  registerSurface(input: BenchSurfaceRegistrationInput): () => void {
    const registrationID = nextRegistrationID()
    this.#registrationOrderSequence += 1
    const registration: BenchSurfaceRegistration = {
      ...input,
      registrationID,
      targetKey: benchTargetKey(input.target),
      order: this.#registrationOrderSequence,
      unsubscribe: input.subscribe(() => {
        void this.publishCurrent()
      }),
    }

    this.#registrations.set(registrationID, registration)
    void this.publishCurrent()

    return () => {
      const current = this.#registrations.get(registrationID)
      if (current !== registration) return
      current.unsubscribe()
      this.#registrations.delete(registrationID)
      void this.publishCurrent()
    }
  }

  async guardLeave(input: BenchLeaveGuardInput): Promise<BenchLeaveGuardResult> {
    const registration = this.#selectedRegistration()
    if (!registration?.guardLeave) return allowBenchLeave()
    return registration.guardLeave(input)
  }

  async flushContextBeforePrompt(input: { sessionID: string }): Promise<void> {
    if (this.#disposed) return
    const publish = this.#publishQueue.then(
      () => this.#synchronizeAndPublishCurrentSnapshot(input.sessionID, { force: true }),
      () => this.#synchronizeAndPublishCurrentSnapshot(input.sessionID, { force: true }),
    )
    this.#publishQueue = publish.then(
      () => undefined,
      () => undefined,
    )
    await publish
  }

  async publishCurrent(): Promise<void> {
    const sessionID = this.#activeSessionID
    if (!sessionID) return
    await this.#publishForSession(sessionID, { force: false })
  }

  async publishClosed(input: { sessionID: string }): Promise<void> {
    await this.#enqueuePublish({
      sessionID: input.sessionID,
      snapshot: {
        status: "closed",
        publicationKey: closedPublicationKey({
          directory: this.#directory,
          sessionID: input.sessionID,
          visibility: "closed",
        }),
        value: closedBenchContext(),
      },
      force: false,
    })
  }

  async synchronizeWorkspaceFile(input: {
    path: string
    reason: BenchSurfaceSynchronizationReason
  }): Promise<void> {
    if (this.#disposed) return
    const synchronize = this.#publishQueue.then(
      () => this.#synchronizeWorkspaceFileAndPublish(input),
      () => this.#synchronizeWorkspaceFileAndPublish(input),
    )
    this.#publishQueue = synchronize.then(
      () => undefined,
      () => undefined,
    )
    await synchronize
  }

  async synchronizeCurrentWorkspaceFile(input: {
    reason: BenchSurfaceSynchronizationReason
  }): Promise<void> {
    if (this.#disposed) return
    const synchronize = this.#publishQueue.then(
      () => this.#synchronizeCurrentWorkspaceFileAndPublish(input.reason),
      () => this.#synchronizeCurrentWorkspaceFileAndPublish(input.reason),
    )
    this.#publishQueue = synchronize.then(
      () => undefined,
      () => undefined,
    )
    await synchronize
  }

  async completeClientAction(input: {
    actionID: string
    sessionID: string
    completion: BenchClientActionCompletionDraft
    getActiveSessionID: () => string | undefined
  }): Promise<boolean> {
    if (this.#disposed) return false
    const completedSnapshot =
      input.completion.outcome === "committed"
        ? this.#readPublishSnapshotForObservation({
            sessionID: input.sessionID,
            route: input.completion.observedRoute,
            visibility: input.completion.observedVisibility,
            drawer: input.completion.drawer,
          })
        : null
    logBenchToggleStep("workspace-lifecycle-complete-client-action-captured", () => ({
      directory: this.#directory,
      actionID: input.actionID,
      sessionID: input.sessionID,
      completion: input.completion,
      snapshot: snapshotDiagnostic(completedSnapshot),
    }))
    const complete = this.#publishQueue.then(
      () => this.#completeClientAction(input, completedSnapshot),
      () => this.#completeClientAction(input, completedSnapshot),
    )
    this.#publishQueue = complete.then(
      () => undefined,
      () => undefined,
    )
    return complete
  }

  async #publishForSession(
    sessionID: string,
    options: { force: boolean },
  ): Promise<void> {
    if (this.#disposed) return
    const publish = this.#publishQueue.then(
      () => this.#publishCurrentSnapshot(sessionID, options),
      () => this.#publishCurrentSnapshot(sessionID, options),
    )
    this.#publishQueue = publish.then(
      () => undefined,
      () => undefined,
    )
    await publish
  }

  async #synchronizeAndPublishCurrentSnapshot(
    sessionID: string,
    options: { force: boolean },
  ): Promise<void> {
    await this.#synchronizeCurrentWorkspaceFile("context-flush")
    await this.#publishCurrentSnapshot(sessionID, options)
  }

  async #synchronizeWorkspaceFileAndPublish(input: {
    path: string
    reason: BenchSurfaceSynchronizationReason
  }): Promise<void> {
    const changed = await this.#synchronizeWorkspaceFile(input)
    if (!changed) return
    const sessionID = this.#activeSessionID
    if (!sessionID) return
    await this.#publishCurrentSnapshot(sessionID, { force: false })
  }

  async #synchronizeCurrentWorkspaceFileAndPublish(
    reason: BenchSurfaceSynchronizationReason,
  ): Promise<void> {
    const changed = await this.#synchronizeCurrentWorkspaceFile(reason)
    if (!changed) return
    const sessionID = this.#activeSessionID
    if (!sessionID) return
    await this.#publishCurrentSnapshot(sessionID, { force: false })
  }

  async #synchronizeCurrentWorkspaceFile(
    reason: BenchSurfaceSynchronizationReason,
  ): Promise<boolean> {
    const projection = this.#getProjection()
    if (projection.bench.visibility !== "visible" || projection.route.status === "closed") {
      return false
    }
    if (projection.route.target.type !== "workspace-file") return false
    return this.#synchronizeWorkspaceFile({
      path: projection.route.target.path,
      reason,
    })
  }

  async #synchronizeWorkspaceFile(input: {
    path: string
    reason: BenchSurfaceSynchronizationReason
  }): Promise<boolean> {
    const projection = this.#getProjection()
    if (projection.bench.visibility !== "visible" || projection.route.status === "closed") {
      return false
    }

    const target = projection.route.target
    if (target.type !== "workspace-file") return false
    if (
      !workspaceFileSignalMatchesTarget({
        signalPath: input.path,
        targetPath: target.path,
      })
    ) {
      return false
    }

    const registration = this.#selectedRegistration(benchTargetKey(target))
    if (!registration?.synchronize) return false
    if (registration.targetKey !== benchTargetKey(target)) return false

    try {
      const result = await registration.synchronize(input.reason)
      return result.changed
    } catch {
      return false
    }
  }

  async #transitionActiveSessionID(sessionID: string | undefined): Promise<void> {
    if (this.#disposed || this.#requestedActiveSessionID !== sessionID) return

    const outgoingSessionID = this.#activeSessionID
    if (outgoingSessionID && outgoingSessionID !== sessionID) {
      await this.#publishPendingClosedSession(outgoingSessionID)
    }

    if (this.#disposed || this.#requestedActiveSessionID !== sessionID) return
    this.#activeSessionID = sessionID
    if (!sessionID) return
    this.#lastActiveSessionID = sessionID
    await this.#publishCurrentSnapshot(sessionID, { force: false })
  }

  async #synchronizeAcceptedLease(): Promise<void> {
    if (this.#disposed) return
    for (const sessionID of this.#pendingClosedSessionIDs) {
      await this.#publishPendingClosedSession(sessionID)
    }

    if (this.#activeSessionID !== this.#requestedActiveSessionID) {
      await this.#transitionActiveSessionID(this.#requestedActiveSessionID)
      return
    }
    if (this.#activeSessionID) {
      await this.#publishCurrentSnapshot(this.#activeSessionID, { force: false })
    }
  }

  async #publishPendingClosedSession(sessionID: string): Promise<void> {
    const snapshot = {
      status: "closed",
      publicationKey: closedPublicationKey({
        directory: this.#directory,
        sessionID,
        visibility: "closed",
      }),
      value: closedBenchContext(),
    } satisfies BenchContextPublishSnapshot
    this.#pendingClosedSessionIDs.add(sessionID)
    if (this.#lastPublishedKeyBySession.get(sessionID) === snapshot.publicationKey) {
      this.#pendingClosedSessionIDs.delete(sessionID)
      return
    }
    const published = await this.#publishSnapshot(sessionID, snapshot)
    if (!published) return
    this.#lastPublishedKeyBySession.set(sessionID, snapshot.publicationKey)
    this.#pendingClosedSessionIDs.delete(sessionID)
  }

  async #completeClientAction(
    input: {
      actionID: string
      sessionID: string
      completion: BenchClientActionCompletionDraft
      getActiveSessionID: () => string | undefined
    },
    completedSnapshot: BenchContextPublishSnapshot | null,
  ): Promise<boolean> {
    while (!this.#disposed) {
      const activeSessionID = input.getActiveSessionID()
      const reportsInactiveSession = input.completion.outcome === "inactive_session"
      if (
        activeSessionID === undefined ||
        (activeSessionID === input.sessionID) === reportsInactiveSession
      ) {
        return false
      }
      const lease = this.#lease
      if (!lease) return false
      const leaseIdentity = {
        instanceID: lease.instanceID,
        generation: lease.generation,
        leaseEpoch: lease.leaseEpoch,
      }
      let body: BenchClientActionCompletion
      if (input.completion.outcome === "committed") {
        if (!completedSnapshot) return false
        body = {
          ...input.completion,
          lease: leaseIdentity,
          publicationSequence: this.#nextPublicationSequence(input.sessionID),
          context: completedSnapshot.value,
        }
      } else {
        body = {
          ...input.completion,
          lease: leaseIdentity,
        }
      }
      const response = requireBuddyData(
        await getBuddyClient(this.#directory).bench.clientActions.complete({
          actionID: input.actionID,
          body,
        }),
      )
      logBenchToggleStep("workspace-lifecycle-complete-client-action-response", () => ({
        directory: this.#directory,
        actionID: input.actionID,
        sessionID: input.sessionID,
        response,
        completionOutcome: input.completion.outcome,
        lease: leaseIdentity,
        body:
          body.outcome === "committed"
            ? {
                observedRoute: body.observedRoute,
                observedVisibility: body.observedVisibility,
                drawer: body.drawer,
                changed: body.changed,
                publicationSequence: body.publicationSequence,
                context: contextTargetDiagnostic(body.context),
              }
            : body,
      }))
      if (response.status === "conflict") {
        logBenchToggleStep("workspace-lifecycle-complete-client-action-conflict", () => ({
          directory: this.#directory,
          actionID: input.actionID,
          sessionID: input.sessionID,
          activeSessionID,
          completion: input.completion,
          snapshot: snapshotDiagnostic(completedSnapshot),
          lease: leaseIdentity,
        }))
        if (this.#lease === lease) return false
        continue
      }
      if (
        input.completion.outcome === "committed" &&
        completedSnapshot &&
        response.status !== "expired"
      ) {
        this.#lastPublishedKeyBySession.set(input.sessionID, completedSnapshot.publicationKey)
      }
      return true
    }
    return false
  }

  #readCurrentPublishSnapshot(sessionID: string): BenchContextPublishSnapshot {
    if (this.#getHydrationStatus() === "pending") {
      return {
        status: "closed",
        publicationKey: closedPublicationKey({
          directory: this.#directory,
          sessionID,
          visibility: "closed",
        }),
        value: closedBenchContext(),
      }
    }

    const projection = this.#getProjection()
    return this.#readPublishSnapshotForObservation({
      sessionID,
      route: projection.route,
      visibility: projection.bench.visibility,
      drawer: projection.drawer,
    })
  }

  #readPublishSnapshotForObservation(input: {
    sessionID: string
    route: EffectiveWorkspaceProjection["route"]
    visibility: EffectiveWorkspaceProjection["bench"]["visibility"]
    drawer: DrawerKind | null
  }): BenchContextPublishSnapshot {
    if (
      input.visibility !== "visible" ||
      input.route.status === "closed"
    ) {
      return {
        status: "closed",
        publicationKey: closedPublicationKey({
          directory: this.#directory,
          sessionID: input.sessionID,
          visibility: input.visibility,
        }),
        value: closedBenchContext(),
      }
    }

    const observedTarget = input.route.target
    const targetKey = benchTargetKey(observedTarget)
    const registrations = this.#selectedRegistrations(targetKey)
    for (const registration of registrations) {
      const snapshot = registration.getSnapshot()
      if (snapshotMatchesBenchTarget({ snapshot, target: observedTarget })) {
        const output = {
          status: "open",
          publicationKey: openPublicationKey({
            directory: this.#directory,
            sessionID: input.sessionID,
            targetKey,
            visibility: input.visibility,
            drawer: input.drawer,
            semanticRevision: snapshot.semanticRevision,
          }),
          value: withDrawerContext({
            context: snapshot.context,
            drawer: input.drawer,
          }),
        } satisfies BenchContextPublishSnapshot
        logBenchToggleStep("workspace-lifecycle-read-observed-snapshot-registration", () => ({
          directory: this.#directory,
          sessionID: input.sessionID,
          targetKey,
          registrationID: registration.registrationID,
          snapshot: snapshotDiagnostic(output),
        }))
        return output
      }

      logBenchToggleStep("workspace-lifecycle-read-observed-snapshot-registration-target-mismatch", () => ({
        directory: this.#directory,
        sessionID: input.sessionID,
        targetKey,
        registrationID: registration.registrationID,
        snapshotTarget: snapshot.target,
        snapshotTargetKey: snapshot.targetKey,
        expectedTarget: observedTarget,
        snapshot: surfaceContextDiagnostic(snapshot.context),
      }))
    }

    const currentTargetKey = this.#getProjection().bench.targetKey
    const fallbackContext =
      (currentTargetKey === targetKey ? this.#fallbackProvider?.() : null) ??
      this.#getRouteFallbackContext(input.route)
    if (!fallbackContext) {
      const output = {
        status: "closed",
        publicationKey: closedPublicationKey({
          directory: this.#directory,
          sessionID: input.sessionID,
          visibility: input.visibility,
        }),
        value: closedBenchContext(),
      } satisfies BenchContextPublishSnapshot
      logBenchToggleStep("workspace-lifecycle-read-observed-snapshot-missing-context", () => ({
        directory: this.#directory,
        sessionID: input.sessionID,
        targetKey,
        currentTargetKey,
        snapshot: snapshotDiagnostic(output),
      }))
      return output
    }

    const output = {
      status: "open",
      publicationKey: openPublicationKey({
        directory: this.#directory,
        sessionID: input.sessionID,
        targetKey,
        visibility: input.visibility,
        drawer: input.drawer,
        semanticRevision: DIRECTORY_WORKSPACE_FALLBACK_REVISION,
      }),
      value: withDrawerContext({
        context: fallbackContext,
        drawer: input.drawer,
      }),
    } satisfies BenchContextPublishSnapshot
    logBenchToggleStep("workspace-lifecycle-read-observed-snapshot-fallback", () => ({
      directory: this.#directory,
      sessionID: input.sessionID,
      targetKey,
      currentTargetKey,
      usedLiveFallbackProvider: currentTargetKey === targetKey,
      snapshot: snapshotDiagnostic(output),
    }))
    return output
  }

  async #publishCurrentSnapshot(
    sessionID: string,
    options: { force: boolean },
  ): Promise<void> {
    if (this.#disposed) return
    const snapshot = this.#readCurrentPublishSnapshot(sessionID)
    if (!options.force && this.#lastPublishedKeyBySession.get(sessionID) === snapshot.publicationKey) {
      return
    }
    const published = await this.#publishSnapshot(sessionID, snapshot)
    if (published) {
      this.#lastPublishedKeyBySession.set(sessionID, snapshot.publicationKey)
    }
  }

  async #enqueuePublish(input: {
    sessionID: string
    snapshot: BenchContextPublishSnapshot
    force: boolean
  }): Promise<void> {
    if (!input.force && this.#lastPublishedKeyBySession.get(input.sessionID) === input.snapshot.publicationKey) {
      return
    }

    const publish = this.#publishQueue.then(
      () => this.#publishSnapshot(input.sessionID, input.snapshot),
      () => this.#publishSnapshot(input.sessionID, input.snapshot),
    )
    this.#publishQueue = publish.then(
      () => undefined,
      () => undefined,
    )
    const published = await publish
    if (published) {
      this.#lastPublishedKeyBySession.set(input.sessionID, input.snapshot.publicationKey)
    }
  }

  async #publishSnapshot(
    sessionID: string,
    snapshot: BenchContextPublishSnapshot,
    options?: { allowDisposed?: boolean; lease?: BenchClientLease },
  ): Promise<boolean> {
    if (this.#disposed && !options?.allowDisposed) return false
    const lease = options?.lease ?? this.#lease
    if (!lease) return false
    const publicationSequence = this.#nextPublicationSequence(sessionID)
    const leaseIdentity = {
      instanceID: lease.instanceID,
      generation: lease.generation,
      leaseEpoch: lease.leaseEpoch,
    }
    requireBuddyData(
      await getBuddyClient(this.#directory).bench.context.publish({
        sessionID,
        lease: leaseIdentity,
        publicationSequence,
        idempotencyKey: publishIdempotencyKey({
          publicationKey: snapshot.publicationKey,
          lease: leaseIdentity,
          publicationSequence,
        }),
        value: snapshot.value,
      }),
    )
    return true
  }

  async #publishClosedBeforeDisposal(input: {
    sessionID: string | undefined
    lease: BenchClientLease | null
  }): Promise<void> {
    try {
      if (input.lease) {
        const sessionIDs = new Set(this.#pendingClosedSessionIDs)
        if (input.sessionID) sessionIDs.add(input.sessionID)
        for (const sessionID of sessionIDs) {
          await this.#publishSnapshot(
            sessionID,
            {
              status: "closed",
              publicationKey: closedPublicationKey({
                directory: this.#directory,
                sessionID,
                visibility: "closed",
              }),
              value: closedBenchContext(),
            },
            { allowDisposed: true, lease: input.lease },
          )
        }
      }
    } finally {
      if (input.lease && this.#lease === input.lease) {
        this.#lease = null
        await getBuddyClient(this.#directory).bench.clientLease.release({
          instanceID: input.lease.instanceID,
          generation: input.lease.generation,
          leaseEpoch: input.lease.leaseEpoch,
        })
      }
    }
  }

  #nextPublicationSequence(sessionID: string): number {
    const next = (this.#publicationSequenceBySession.get(sessionID) ?? 0) + 1
    this.#publicationSequenceBySession.set(sessionID, next)
    return next
  }

  #selectedRegistrations(
    targetKey = this.#getProjection().bench.targetKey,
  ): BenchSurfaceRegistration[] {
    if (!targetKey) return []

    const selected: BenchSurfaceRegistration[] = []
    for (const registration of this.#registrations.values()) {
      if (registration.targetKey !== targetKey) continue
      selected.push(registration)
    }
    return selected.toSorted((left, right) => right.order - left.order)
  }

  #selectedRegistration(
    targetKey = this.#getProjection().bench.targetKey,
  ): BenchSurfaceRegistration | undefined {
    return this.#selectedRegistrations(targetKey)[0]
  }
}

export type {
  BenchReadContextOpenOutput,
  BenchReadContextOutput,
  BenchReadSurfaceContextOpenOutput,
  BenchClientActionCompletionDraft,
  BenchClientLease,
  BenchSurfaceSynchronizationReason,
  BenchSurfaceSynchronizationResult,
  BenchSurfaceRegistrationInput,
  BenchSurfaceSnapshot,
}
