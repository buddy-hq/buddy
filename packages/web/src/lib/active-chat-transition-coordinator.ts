import {
  beginActiveChatTransition,
  isActiveChatTransition,
  releaseActiveChatLayoutMotionAfterPaint,
  waitForActiveChatDestinationLayout,
  type ActiveChatTransitionID,
} from "@/lib/active-chat-transition-state"
import {
  getLiveDirectoryWorkspace,
  type LiveDirectoryWorkspaceHandle,
} from "@/lib/directory-workspace-registry"
import { canonicalProjectDirectory } from "@/lib/project-directory"
import {
  workspaceChatKeyForSession,
  workspaceChatKeyForTransition,
  type PersistedWorkspaceChatKey,
  type WorkspaceChatKey,
} from "@/lib/workspace-chat-key"
import {
  forkSession,
  selectSession,
  startNewSession,
  startNewSessionDraft,
  type SessionSelectionResult,
} from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import type { SessionInfo } from "@/state/chat-types"
import {
  defaultWorkspacePresentationSlot,
  readPersistedWorkspaceSlot,
  writePersistedWorkspaceSlot,
  type BenchRouteSnapshot,
  type WorkspacePresentationSlot,
} from "@/state/directory-workspace-store"

type ActiveChatIdentity =
  | { kind: "directory" }
  | { kind: "draft" }
  | { kind: "session"; sessionID: string }

type DestinationWorkspaceIntent = {
  chatKey: WorkspaceChatKey
  reset: boolean
}

export type NavigateToChat = (directory: string, route: BenchRouteSnapshot) => void | Promise<void>

export type ActiveChatTransitionResult<T> =
  | {
      outcome: "committed" | "noop"
      transitionID: ActiveChatTransitionID
      value: T
    }
  | {
      outcome: "blocked"
      transitionID: ActiveChatTransitionID
    }
  | {
      outcome: "failed"
      transitionID: ActiveChatTransitionID
      error: unknown
    }
  | {
      outcome: "superseded"
      transitionID: ActiveChatTransitionID
    }

type ActiveChatTransitionInput<T> = {
  directory: string
  destination: DestinationWorkspaceIntent
  identity?: ActiveChatIdentity
  readNoopValue?: () => T
  mutate: () => T | Promise<T>
  navigate?: NavigateToChat
  present?: (value: T) => void | Promise<void>
}

type PreparedSourceWorkspace = {
  directory: string
  chatKey: PersistedWorkspaceChatKey
  sessionID: string | undefined
  handle: LiveDirectoryWorkspaceHandle
}

type WorkspacePreparationResult =
  | { outcome: "committed"; prepared?: PreparedSourceWorkspace }
  | { outcome: "blocked" | "failed" | "superseded" }

type RetainedFrameViewTransition = {
  finished: Promise<void>
}

type RetainedFrameDocument = Document & {
  startViewTransition: (update: () => Promise<void>) => RetainedFrameViewTransition
}

function supportsRetainedFrameViewTransition(value: Document): value is RetainedFrameDocument {
  return "startViewTransition" in value && typeof value.startViewTransition === "function"
}

async function runWithRetainedActiveChatFrame<T>(
  transitionID: ActiveChatTransitionID,
  update: () => Promise<T>,
): Promise<T> {
  if (
    typeof document === "undefined" ||
    document.visibilityState === "hidden" ||
    !supportsRetainedFrameViewTransition(document)
  ) {
    return update()
  }

  const completedUpdates: Array<{ value: T }> = []
  let transition: RetainedFrameViewTransition
  try {
    transition = document.startViewTransition(async () => {
      completedUpdates.push({ value: await update() })
      await waitForActiveChatDestinationLayout(transitionID)
    })
  } catch {
    return update()
  }

  // The async update boundary retains the outgoing pixels until the destination is stable. The
  // native transition then animates only captured compositor snapshots, so the live transcript
  // remains at its final width while the outgoing and incoming workspaces fade and settle.
  await transition.finished

  const completedUpdate = completedUpdates[0]
  if (!completedUpdate) {
    throw new Error("The active chat view transition completed without applying its update.")
  }
  return completedUpdate.value
}

function activeChatState(directory: string): {
  chatKey: PersistedWorkspaceChatKey
  sessionID: string | undefined
} {
  const sessionID = useChatStore.getState().directories[directory]?.sessionID
  return {
    chatKey: workspaceChatKeyForSession(sessionID),
    sessionID,
  }
}

function isCurrentIdentity(directory: string, identity: ActiveChatIdentity): boolean {
  const store = useChatStore.getState()
  const activeDirectory = canonicalProjectDirectory(store.activeDirectory)
  if (activeDirectory !== directory) return false
  if (identity.kind === "directory") return true
  const directoryState = store.directories[directory]
  if (identity.kind === "session") {
    return directoryState?.sessionID === identity.sessionID
  }
  return directoryState?.sessionID === undefined && directoryState?.isDraft === true
}

async function persistedOrDefaultWorkspaceSlot(
  directory: string,
  chatKey: PersistedWorkspaceChatKey,
): Promise<WorkspacePresentationSlot> {
  return (
    (await readPersistedWorkspaceSlot({
      directory,
      chatKey,
    })) ?? defaultWorkspacePresentationSlot()
  )
}

class ActiveChatTransitionCoordinator {
  #serialized: Promise<void> = Promise.resolve()

  run<T>(input: ActiveChatTransitionInput<T>): Promise<ActiveChatTransitionResult<T>> {
    const transitionID = beginActiveChatTransition()
    const execution = this.#serialized.then(
      () => runWithRetainedActiveChatFrame(transitionID, () => this.#execute(transitionID, input)),
      () => runWithRetainedActiveChatFrame(transitionID, () => this.#execute(transitionID, input)),
    )
    this.#serialized = execution.then(
      () => undefined,
      () => undefined,
    )
    void execution.then(
      () => releaseActiveChatLayoutMotionAfterPaint(transitionID),
      () => releaseActiveChatLayoutMotionAfterPaint(transitionID),
    )
    return execution
  }

  async #execute<T>(
    transitionID: ActiveChatTransitionID,
    input: ActiveChatTransitionInput<T>,
  ): Promise<ActiveChatTransitionResult<T>> {
    const directory = canonicalProjectDirectory(input.directory)
    if (!directory) {
      return {
        outcome: "failed",
        transitionID,
        error: new Error("A valid notebook directory is required."),
      }
    }
    if (!isActiveChatTransition(transitionID)) {
      return { outcome: "superseded", transitionID }
    }

    if (input.identity && isCurrentIdentity(directory, input.identity) && input.readNoopValue) {
      const value = input.readNoopValue()
      try {
        if (input.navigate) {
          const liveWorkspace = getLiveDirectoryWorkspace(directory)
          const route =
            liveWorkspace?.getRoute() ??
            (
              await persistedOrDefaultWorkspaceSlot(
                directory,
                workspaceChatKeyForSession(
                  useChatStore.getState().directories[directory]?.sessionID,
                ),
              )
            ).route
          await input.navigate(directory, route)
        }
        if (!isActiveChatTransition(transitionID)) {
          return { outcome: "superseded", transitionID }
        }
        await input.present?.(value)
      } catch (error) {
        return {
          outcome: "failed",
          transitionID,
          error,
        }
      }
      if (!isActiveChatTransition(transitionID)) {
        return { outcome: "superseded", transitionID }
      }
      return {
        outcome: "noop",
        transitionID,
        value,
      }
    }

    const sourceDirectory = canonicalProjectDirectory(useChatStore.getState().activeDirectory)
    const preparation = await this.#prepareSourceWorkspace({
      transitionID,
      sourceDirectory,
      destinationDirectory: directory,
      destination: input.destination,
    })
    if (preparation.outcome !== "committed") {
      if (preparation.outcome === "failed") {
        return {
          outcome: "failed",
          transitionID,
          error: new Error("Unable to prepare the active workspace for the chat change."),
        }
      }
      return {
        outcome: preparation.outcome,
        transitionID,
      }
    }
    const preparedSource = preparation.prepared
    if (!isActiveChatTransition(transitionID)) {
      await this.#restorePreparedSource(preparedSource)
      return { outcome: "superseded", transitionID }
    }

    let value: T
    try {
      value = await input.mutate()
    } catch (error) {
      await this.#restorePreparedSource(preparedSource)
      return {
        outcome: "failed",
        transitionID,
        error,
      }
    }
    if (!isActiveChatTransition(transitionID)) {
      return { outcome: "superseded", transitionID }
    }

    useChatStore.getState().setActiveDirectory(directory)
    const destinationState = activeChatState(directory)
    if (!isActiveChatTransition(transitionID)) {
      return { outcome: "superseded", transitionID }
    }

    try {
      const sameLiveWorkspace =
        preparedSource?.directory === directory ? preparedSource.handle : undefined
      let destinationRoute: BenchRouteSnapshot
      if (sameLiveWorkspace) {
        const restoration = await sameLiveWorkspace.controller.execute(
          {
            type: "restore-chat",
            chatKey: destinationState.chatKey,
          },
          { origin: "user" },
        )
        if (restoration.outcome !== "committed") {
          return restoration.outcome === "blocked"
            ? { outcome: "blocked", transitionID }
            : restoration.outcome === "superseded"
              ? { outcome: "superseded", transitionID }
              : {
                  outcome: "failed",
                  transitionID,
                  error: new Error("Unable to restore the selected chat workspace."),
                }
        }
        await sameLiveWorkspace.persist()
        await sameLiveWorkspace.setActiveSessionContext(destinationState.sessionID)
        destinationRoute = restoration.projection.route
      } else {
        const shouldResetDestination =
          input.destination.reset && input.destination.chatKey === destinationState.chatKey
        const destinationSlot = shouldResetDestination
          ? defaultWorkspacePresentationSlot()
          : await persistedOrDefaultWorkspaceSlot(directory, destinationState.chatKey)
        if (shouldResetDestination) {
          await writePersistedWorkspaceSlot({
            directory,
            chatKey: destinationState.chatKey,
            slot: destinationSlot,
          })
        }
        destinationRoute = destinationSlot.route
        const releasePreparedNavigation =
          preparedSource && preparedSource.directory !== directory && input.navigate
            ? preparedSource.handle.controller.authorizePreparedChatNavigation({
                directory,
                route: destinationRoute,
              })
            : () => undefined
        try {
          await input.navigate?.(directory, destinationRoute)
        } finally {
          releasePreparedNavigation()
        }
      }
      if (!isActiveChatTransition(transitionID)) {
        return { outcome: "superseded", transitionID }
      }
      await input.present?.(value)
    } catch (error) {
      // Navigation or presentation can throw after the source workspace was staged onto a transient
      // chat key. Nothing else clears that staged intent — the controller's `finally` only releases
      // the foreground command — so without this the source workspace reports `transitioning`
      // forever, keeping Bench collapsed and layout motion suppressed for the rest of the session.
      await this.#restorePreparedSource(preparedSource)
      return {
        outcome: "failed",
        transitionID,
        error,
      }
    }
    if (!isActiveChatTransition(transitionID)) {
      return { outcome: "superseded", transitionID }
    }

    return {
      outcome: "committed",
      transitionID,
      value,
    }
  }

  async #prepareSourceWorkspace(input: {
    transitionID: ActiveChatTransitionID
    sourceDirectory: string | undefined
    destinationDirectory: string
    destination: DestinationWorkspaceIntent
  }): Promise<WorkspacePreparationResult> {
    if (!input.sourceDirectory) return { outcome: "committed" }
    const liveWorkspace = getLiveDirectoryWorkspace(input.sourceDirectory)
    if (!liveWorkspace) return { outcome: "committed" }
    const sourceState = activeChatState(input.sourceDirectory)
    const sameDirectory = input.sourceDirectory === input.destinationDirectory
    const destinationChatKey = sameDirectory
      ? input.destination.chatKey
      : workspaceChatKeyForTransition(input.transitionID)
    const result = await liveWorkspace.controller.execute(
      {
        type: "prepare-chat-change",
        outgoingChatKey: sourceState.chatKey,
        destinationChatKey,
        resetDestination: sameDirectory ? input.destination.reset : true,
      },
      { origin: "user" },
    )
    if (!isActiveChatTransition(input.transitionID)) {
      if (result.outcome === "committed") {
        await liveWorkspace.controller.execute(
          { type: "restore-chat", chatKey: sourceState.chatKey },
          { origin: "user" },
        )
      }
      return { outcome: "superseded" }
    }
    if (result.outcome === "blocked") return { outcome: "blocked" }
    if (result.outcome !== "committed") {
      return {
        outcome: result.outcome === "superseded" ? "superseded" : "failed",
      }
    }
    await liveWorkspace.setActiveSessionContext(undefined)
    await liveWorkspace.persist()
    if (!isActiveChatTransition(input.transitionID)) {
      await this.#restorePreparedSource({
        directory: input.sourceDirectory,
        chatKey: sourceState.chatKey,
        sessionID: sourceState.sessionID,
        handle: liveWorkspace,
      })
      return { outcome: "superseded" }
    }
    return {
      outcome: "committed",
      prepared: {
        directory: input.sourceDirectory,
        chatKey: sourceState.chatKey,
        sessionID: sourceState.sessionID,
        handle: liveWorkspace,
      },
    }
  }

  async #restorePreparedSource(prepared: PreparedSourceWorkspace | undefined): Promise<void> {
    if (!prepared || prepared.handle.isDisposed()) return
    await prepared.handle.controller.execute(
      { type: "restore-chat", chatKey: prepared.chatKey },
      { origin: "user" },
    )
    await prepared.handle.persist()
    await prepared.handle.setActiveSessionContext(prepared.sessionID)
  }
}

const activeChatTransitionCoordinator = new ActiveChatTransitionCoordinator()
let workspaceDestinationSequence = 0

function nextTransientWorkspaceChatKey(): WorkspaceChatKey {
  workspaceDestinationSequence += 1
  return workspaceChatKeyForTransition(workspaceDestinationSequence)
}

function currentDirectoryDestination(directory: string): DestinationWorkspaceIntent {
  return {
    chatKey: workspaceChatKeyForSession(useChatStore.getState().directories[directory]?.sessionID),
    reset: false,
  }
}

export function activateChatDirectory(input: {
  directory: string
  navigate?: NavigateToChat
}): Promise<ActiveChatTransitionResult<{ directory: string }>> {
  return activeChatTransitionCoordinator.run({
    directory: input.directory,
    destination: currentDirectoryDestination(input.directory),
    identity: { kind: "directory" },
    readNoopValue: () => ({ directory: input.directory }),
    mutate: () => ({ directory: input.directory }),
    navigate: input.navigate,
  })
}

export function startActiveChatDraft(input: {
  directory: string
  navigate?: NavigateToChat
}): Promise<ActiveChatTransitionResult<ReturnType<typeof startNewSessionDraft>>> {
  return activeChatTransitionCoordinator.run({
    directory: input.directory,
    destination: {
      chatKey: workspaceChatKeyForSession(undefined),
      reset: true,
    },
    identity: { kind: "draft" },
    readNoopValue: () => ({
      outcome: "draft",
      directory: input.directory,
    }),
    mutate: () => startNewSessionDraft(input.directory),
    navigate: input.navigate,
  })
}

export function startActiveChatSession(input: {
  directory: string
  navigate?: NavigateToChat
}): Promise<ActiveChatTransitionResult<SessionInfo>> {
  return activeChatTransitionCoordinator.run({
    directory: input.directory,
    destination: {
      chatKey: nextTransientWorkspaceChatKey(),
      reset: true,
    },
    mutate: () => startNewSession(input.directory),
    navigate: input.navigate,
  })
}

export function selectActiveChatSession(input: {
  directory: string
  sessionID: string
  navigate?: NavigateToChat
}): Promise<ActiveChatTransitionResult<SessionSelectionResult>> {
  return activeChatTransitionCoordinator.run({
    directory: input.directory,
    destination: {
      chatKey: workspaceChatKeyForSession(input.sessionID),
      reset: false,
    },
    identity: { kind: "session", sessionID: input.sessionID },
    readNoopValue: () => ({
      outcome: "requested",
      directory: input.directory,
      requestedSessionID: input.sessionID,
      sessionID: input.sessionID,
    }),
    mutate: async () => {
      const selection = await selectSession(input.directory, input.sessionID)
      if (selection.outcome === "failed") throw selection.error
      return selection
    },
    navigate: input.navigate,
  })
}

export function forkActiveChatSession(input: {
  directory: string
  sessionID?: string
  messageID?: string
  navigate?: NavigateToChat
}): Promise<ActiveChatTransitionResult<SessionInfo>> {
  return activeChatTransitionCoordinator.run({
    directory: input.directory,
    destination: {
      chatKey: nextTransientWorkspaceChatKey(),
      reset: true,
    },
    mutate: () =>
      forkSession(input.directory, {
        ...(input.sessionID ? { sessionID: input.sessionID } : {}),
        ...(input.messageID ? { messageID: input.messageID } : {}),
      }),
    navigate: input.navigate,
  })
}

export function selectActiveChatSessionAndPresent<T>(input: {
  directory: string
  sessionID: string
  navigate?: NavigateToChat
  present: () => T | Promise<T>
}): Promise<
  ActiveChatTransitionResult<{
    selection: SessionSelectionResult
    presentation: T | undefined
  }>
> {
  return activeChatTransitionCoordinator.run({
    directory: input.directory,
    destination: {
      chatKey: workspaceChatKeyForSession(input.sessionID),
      reset: false,
    },
    identity: { kind: "session", sessionID: input.sessionID },
    readNoopValue: () => ({
      selection: {
        outcome: "requested",
        directory: input.directory,
        requestedSessionID: input.sessionID,
        sessionID: input.sessionID,
      },
      presentation: undefined,
    }),
    mutate: async () => {
      const selection = await selectSession(input.directory, input.sessionID)
      if (selection.outcome === "failed") throw selection.error
      const value: {
        selection: SessionSelectionResult
        presentation: T | undefined
      } = {
        selection,
        presentation: undefined,
      }
      return value
    },
    navigate: input.navigate,
    present: async (value) => {
      if (value.selection.outcome !== "requested") return
      value.presentation = await input.present()
    },
  })
}

export function runPreparedActiveChatMutation<T>(input: {
  directory: string
  mutate: () => T | Promise<T>
  navigate?: NavigateToChat
}): Promise<ActiveChatTransitionResult<T>> {
  return activeChatTransitionCoordinator.run({
    ...input,
    destination: {
      chatKey: nextTransientWorkspaceChatKey(),
      reset: false,
    },
  })
}
