import type { QueryClient } from "@tanstack/react-query"
import {
  runPreparedActiveChatMutation,
  startActiveChatDraft,
} from "@/lib/active-chat-transition-coordinator"
import { sessionFamilyIDs } from "@/lib/session-family"
import { deleteSession, loadMessages, updateSession } from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import {
  directoryChatQueryKeys,
  upsertDirectorySessionQueryData,
} from "@/state/directory-chat-query"
import {
  getModelSelectionScopeKey,
  getSelectedModelKey,
  getSelectedVariantKey,
  useModelSelectionStore,
  type WorkspaceModelSelectionSeed,
} from "@/state/model-selection-store"
import { getPromptScopeKey, usePromptStore } from "@/state/prompt-store"
import { useUiPreferences } from "@/state/ui-preferences"

/**
 * Session-list mutations shared by every surface that renders the chat sidebar.
 *
 * The sidebar is mounted by both the chat workspace and the settings route. Each used to carry
 * its own copy of these handlers, and the copies drifted: the settings route stopped clearing
 * prompt drafts, stopped refetching permissions/questions, and stopped seeding a replacement
 * draft. Archiving the same session produced different state depending on which route was
 * mounted. Both surfaces now call through here so that cannot happen again.
 */

type SessionListMutation = {
  queryClient: QueryClient
  directory: string
  sessionID: string
  /**
   * Model/variant carried into the replacement draft when a removal empties the directory.
   * Chat surfaces pass the composer's live selection; surfaces without a composer omit it and
   * the removed session's own stored selection is carried instead.
   */
  draftModelSelection?: WorkspaceModelSelectionSeed
  /** Reload the retained active chat when the caller renders its transcript. */
  refreshActiveTranscript?: boolean
}

function readStoredModelSelection(
  directory: string,
  sessionID: string,
): WorkspaceModelSelectionSeed {
  const state = useModelSelectionStore.getState()
  const key = getModelSelectionScopeKey(directory, sessionID)
  return {
    model: getSelectedModelKey(state, key),
    variant: getSelectedVariantKey(state, key),
  }
}

/**
 * Applies a removal (archive or delete) and repairs every piece of state that referenced the
 * removed sessions: prompt drafts, per-session UI state, cached permissions/questions, and the
 * directory's active session.
 *
 * Returns false when the transition coordinator declined to commit the mutation.
 */
async function commitSessionListRemoval(input: {
  queryClient: QueryClient
  directory: string
  targetSessionID: string
  affectedSessionIDs: string[]
  mutate: () => Promise<void>
  draftModelSelection?: WorkspaceModelSelectionSeed
  refreshActiveTranscript?: boolean
}): Promise<boolean> {
  const stateBeforeMutation = useChatStore.getState()
  const activeSessionBeforeMutation =
    stateBeforeMutation.activeDirectory === input.directory
      ? stateBeforeMutation.directories[input.directory]?.sessionID
      : undefined
  const affectsActiveSession =
    activeSessionBeforeMutation !== undefined &&
    input.affectedSessionIDs.includes(activeSessionBeforeMutation)

  const draftModelSelection =
    input.draftModelSelection ??
    readStoredModelSelection(
      input.directory,
      affectsActiveSession ? activeSessionBeforeMutation : input.targetSessionID,
    )

  if (affectsActiveSession) {
    const result = await runPreparedActiveChatMutation({
      directory: input.directory,
      mutate: input.mutate,
    })
    if (result.outcome === "failed") throw result.error
    if (result.outcome !== "committed") return false
  } else {
    await input.mutate()
  }

  const removeSessionDraft = usePromptStore.getState().removeSessionDraft
  const clearDirectorySessionState = useUiPreferences.getState().clearDirectorySessionState
  for (const affectedSessionID of input.affectedSessionIDs) {
    removeSessionDraft(getPromptScopeKey(input.directory, affectedSessionID))
    clearDirectorySessionState(input.directory, affectedSessionID)
  }

  await Promise.all([
    input.queryClient.refetchQueries({
      queryKey: directoryChatQueryKeys.sessions(input.directory),
      exact: true,
    }),
    input.queryClient.refetchQueries({
      queryKey: directoryChatQueryKeys.permissions(input.directory),
      exact: true,
    }),
    input.queryClient.refetchQueries({
      queryKey: directoryChatQueryKeys.questions(input.directory),
      exact: true,
    }),
  ])

  const activeSessionID = useChatStore.getState().directories[input.directory]?.sessionID
  if (!activeSessionID) {
    await startActiveChatDraft({ directory: input.directory })
    useModelSelectionStore.getState().seedWorkspaceSelection(input.directory, draftModelSelection)
    await Promise.all([
      input.queryClient.refetchQueries({
        queryKey: directoryChatQueryKeys.permissions(input.directory),
        exact: true,
      }),
      input.queryClient.refetchQueries({
        queryKey: directoryChatQueryKeys.questions(input.directory),
        exact: true,
      }),
    ])
    return true
  }

  if (
    input.refreshActiveTranscript === true &&
    !input.affectedSessionIDs.includes(activeSessionID)
  ) {
    await loadMessages(input.directory, activeSessionID)
    useUiPreferences.getState().clearUnread(input.directory, activeSessionID)
  }
  return true
}

export async function archiveSessionFromList(input: SessionListMutation): Promise<boolean> {
  return commitSessionListRemoval({
    queryClient: input.queryClient,
    directory: input.directory,
    targetSessionID: input.sessionID,
    affectedSessionIDs: [input.sessionID],
    draftModelSelection: input.draftModelSelection,
    refreshActiveTranscript: input.refreshActiveTranscript,
    mutate: async () => {
      await updateSession({
        directory: input.directory,
        sessionID: input.sessionID,
        archivedAt: Date.now(),
      })
    },
  })
}

export async function deleteSessionFromList(input: SessionListMutation): Promise<boolean> {
  const sessions = useChatStore.getState().directories[input.directory]?.sessions ?? []
  return commitSessionListRemoval({
    queryClient: input.queryClient,
    directory: input.directory,
    targetSessionID: input.sessionID,
    affectedSessionIDs: sessionFamilyIDs(sessions, input.sessionID),
    draftModelSelection: input.draftModelSelection,
    refreshActiveTranscript: input.refreshActiveTranscript,
    mutate: async () => {
      await deleteSession({
        directory: input.directory,
        sessionID: input.sessionID,
      })
    },
  })
}

export async function renameSessionInList(input: {
  queryClient: QueryClient
  directory: string
  sessionID: string
  title: string
}): Promise<void> {
  const title = input.title.trim()
  if (!title) return

  const updated = await updateSession({
    directory: input.directory,
    sessionID: input.sessionID,
    title,
  })
  upsertDirectorySessionQueryData(input.queryClient, input.directory, updated)
  useChatStore.getState().applySessionUpdated(input.directory, updated)
}
