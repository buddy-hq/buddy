import "../happydom"
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { QueryClient } from "@tanstack/react-query"
import type { SessionInfo } from "../src/state/chat-types"

mock.module("@/components/skills/skill-icon-assets", () => ({
  resolveSkillIconURL: () => undefined,
}))

const [
  { archiveSessionFromList, deleteSessionFromList, renameSessionInList },
  { directoryChatQueryKeys },
  { setRuntimeServerConnection },
  { resetActiveChatTransitionStateForTests },
  { resetLiveDirectoryWorkspaceRegistryForTests },
  { useChatStore },
  { getModelSelectionScopeKey, useModelSelectionStore },
  { getPromptScopeKey, usePromptStore },
  { useUiPreferences },
] = await Promise.all([
  import("../src/lib/session-list-actions"),
  import("../src/state/directory-chat-query"),
  import("../src/context/server"),
  import("../src/lib/active-chat-transition-state"),
  import("../src/lib/directory-workspace-registry"),
  import("../src/state/chat-store"),
  import("../src/state/model-selection-store"),
  import("../src/state/prompt-store"),
  import("../src/state/ui-preferences"),
])

const DIRECTORY = "/workspace/session-list-actions"
const ROOT_SESSION_ID = "session-root"
const CHILD_SESSION_ID = "session-child"
const SUCCESSOR_SESSION_ID = "session-successor"
const MODEL_KEY = "anthropic/claude-sonnet"
const MODEL_VARIANT = "high"

function session(id: string, updated: number, parentID?: string): SessionInfo {
  return Object.assign(
    {
      id,
      title: id,
      time: {
        created: updated,
        updated,
      },
    },
    parentID === undefined ? undefined : { parentID },
  )
}

describe("session list actions", () => {
  const previousFetch = globalThis.fetch
  let fetchCallCount = 0

  beforeEach(() => {
    fetchCallCount = 0
    localStorage.clear()
    useChatStore.getState().resetRuntimeState()
    usePromptStore.setState({
      draftsByKey: {},
      historyByDirectory: {},
      historyNavigationByKey: {},
    })
    useUiPreferences.setState({
      pinnedByDirectory: {},
      unreadByDirectory: {},
    })
    useModelSelectionStore.setState({
      selectionSourceByKey: {},
      restoredSelectionCreatedAtByKey: {},
      selectedAgentByKey: {},
      selectedModelByKey: {},
      selectedVariantByKey: {},
      recentModelKeys: [],
    })
    resetLiveDirectoryWorkspaceRegistryForTests()
    resetActiveChatTransitionStateForTests()
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    globalThis.fetch = Object.assign(
      async () => {
        fetchCallCount += 1
        return new Response(JSON.stringify(true), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )
  })

  afterEach(() => {
    globalThis.fetch = previousFetch
    setRuntimeServerConnection({ url: "", isEmbeddedBackend: false })
    resetLiveDirectoryWorkspaceRegistryForTests()
    resetActiveChatTransitionStateForTests()
  })

  test("repairs family state and seeds the replacement draft after deleting the active family", async () => {
    const root = session(ROOT_SESSION_ID, 2)
    const child = session(CHILD_SESSION_ID, 1, root.id)
    const chatStore = useChatStore.getState()
    chatStore.setActiveDirectory(DIRECTORY)
    chatStore.setSessions(DIRECTORY, [root, child])
    chatStore.setActiveSession(DIRECTORY, child.id)

    for (const sessionID of [root.id, child.id]) {
      const promptKey = getPromptScopeKey(DIRECTORY, sessionID)
      usePromptStore.getState().replaceDraft(promptKey, {
        value: `draft for ${sessionID}`,
        parts: [],
        attachments: [],
        cursor: 0,
      })
      usePromptStore.getState().setHistoryNavigation(promptKey, {
        historyIndex: 0,
        savedDraft: null,
      })
      useUiPreferences.getState().togglePinned(DIRECTORY, sessionID)
      useUiPreferences.getState().markUnread(DIRECTORY, sessionID)
    }

    const childModelScope = getModelSelectionScopeKey(DIRECTORY, child.id)
    useModelSelectionStore.getState().setSelectedModel(childModelScope, MODEL_KEY)
    useModelSelectionStore.getState().setSelectedVariant(childModelScope, MODEL_VARIANT)

    const queryClient = new QueryClient()
    const refetchQueries = spyOn(queryClient, "refetchQueries")

    await expect(
      deleteSessionFromList({
        queryClient,
        directory: DIRECTORY,
        sessionID: root.id,
      }),
    ).resolves.toBeTrue()

    expect(useChatStore.getState().directories[DIRECTORY]).toMatchObject({
      isDraft: true,
      sessionID: undefined,
      sessions: [],
    })
    for (const sessionID of [root.id, child.id]) {
      const promptKey = getPromptScopeKey(DIRECTORY, sessionID)
      expect(usePromptStore.getState().draftsByKey[promptKey]).toBeUndefined()
      expect(usePromptStore.getState().historyNavigationByKey[promptKey]).toBeUndefined()
      expect(useUiPreferences.getState().isPinned(DIRECTORY, sessionID)).toBeFalse()
      expect(useUiPreferences.getState().isUnread(DIRECTORY, sessionID)).toBeFalse()
    }

    const workspaceModelScope = getModelSelectionScopeKey(DIRECTORY)
    expect(useModelSelectionStore.getState()).toMatchObject({
      selectedModelByKey: { [workspaceModelScope]: MODEL_KEY },
      selectedVariantByKey: { [workspaceModelScope]: MODEL_VARIANT },
    })

    const refetchedQueryKeys = refetchQueries.mock.calls.map(([filters]) => filters?.queryKey)
    expect(refetchedQueryKeys).toEqual([
      directoryChatQueryKeys.sessions(DIRECTORY),
      directoryChatQueryKeys.permissions(DIRECTORY),
      directoryChatQueryKeys.questions(DIRECTORY),
      directoryChatQueryKeys.permissions(DIRECTORY),
      directoryChatQueryKeys.questions(DIRECTORY),
    ])

    queryClient.clear()
  })

  test("does not reload a retained transcript when the caller does not render it", async () => {
    const root = session(ROOT_SESSION_ID, 2)
    const child = session(CHILD_SESSION_ID, 1, root.id)
    const successor = session(SUCCESSOR_SESSION_ID, 3)
    const chatStore = useChatStore.getState()
    chatStore.setActiveDirectory(DIRECTORY)
    chatStore.setSessions(DIRECTORY, [successor, root, child])
    chatStore.setActiveSession(DIRECTORY, successor.id)

    const queryClient = new QueryClient()

    await expect(
      deleteSessionFromList({
        queryClient,
        directory: DIRECTORY,
        sessionID: root.id,
      }),
    ).resolves.toBeTrue()

    expect(useChatStore.getState().directories[DIRECTORY]).toMatchObject({
      sessionID: successor.id,
      sessions: [successor],
    })
    expect(fetchCallCount).toBe(1)

    queryClient.clear()
  })

  test("reloads the retained transcript when the caller renders it", async () => {
    const root = session(ROOT_SESSION_ID, 2)
    const successor = session(SUCCESSOR_SESSION_ID, 3)
    const chatStore = useChatStore.getState()
    chatStore.setActiveDirectory(DIRECTORY)
    chatStore.setSessions(DIRECTORY, [successor, root])
    chatStore.setActiveSession(DIRECTORY, successor.id)
    useUiPreferences.getState().markUnread(DIRECTORY, successor.id)

    // The delete answers `true`; the follow-up transcript load wants a message list.
    globalThis.fetch = Object.assign(
      async () => {
        fetchCallCount += 1
        return new Response(JSON.stringify(fetchCallCount === 1 ? true : []), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )

    const queryClient = new QueryClient()

    await expect(
      deleteSessionFromList({
        queryClient,
        directory: DIRECTORY,
        sessionID: root.id,
        refreshActiveTranscript: true,
      }),
    ).resolves.toBeTrue()

    // The delete itself, plus the loadMessages the chat surface needs for the session it keeps
    // rendering. Without the flag the sibling test above stops at one.
    expect(fetchCallCount).toBe(2)
    expect(useUiPreferences.getState().isUnread(DIRECTORY, successor.id)).toBeFalse()

    queryClient.clear()
  })

  test("archives only the target session and repairs its state", async () => {
    const root = session(ROOT_SESSION_ID, 2)
    const successor = session(SUCCESSOR_SESSION_ID, 3)
    const chatStore = useChatStore.getState()
    chatStore.setActiveDirectory(DIRECTORY)
    chatStore.setSessions(DIRECTORY, [successor, root])
    chatStore.setActiveSession(DIRECTORY, successor.id)

    for (const sessionID of [root.id, successor.id]) {
      usePromptStore.getState().replaceDraft(getPromptScopeKey(DIRECTORY, sessionID), {
        value: `draft for ${sessionID}`,
        parts: [],
        attachments: [],
        cursor: 0,
      })
      useUiPreferences.getState().togglePinned(DIRECTORY, sessionID)
    }

    globalThis.fetch = Object.assign(
      async () => {
        fetchCallCount += 1
        return new Response(JSON.stringify(session(ROOT_SESSION_ID, 4)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )

    const queryClient = new QueryClient()
    const refetchQueries = spyOn(queryClient, "refetchQueries")

    await expect(
      archiveSessionFromList({
        queryClient,
        directory: DIRECTORY,
        sessionID: root.id,
      }),
    ).resolves.toBeTrue()

    // Archive affects one session, never the whole family — the sibling must keep its state.
    expect(
      usePromptStore.getState().draftsByKey[getPromptScopeKey(DIRECTORY, root.id)],
    ).toBeUndefined()
    expect(useUiPreferences.getState().isPinned(DIRECTORY, root.id)).toBeFalse()
    expect(
      usePromptStore.getState().draftsByKey[getPromptScopeKey(DIRECTORY, successor.id)],
    ).toBeDefined()
    expect(useUiPreferences.getState().isPinned(DIRECTORY, successor.id)).toBeTrue()

    expect(refetchQueries.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      directoryChatQueryKeys.sessions(DIRECTORY),
      directoryChatQueryKeys.permissions(DIRECTORY),
      directoryChatQueryKeys.questions(DIRECTORY),
    ])

    queryClient.clear()
  })

  test("renames a session and ignores a blank title", async () => {
    const root = session(ROOT_SESSION_ID, 2)
    const chatStore = useChatStore.getState()
    chatStore.setActiveDirectory(DIRECTORY)
    chatStore.setSessions(DIRECTORY, [root])
    chatStore.setActiveSession(DIRECTORY, root.id)

    const renamed = Object.assign(session(ROOT_SESSION_ID, 5), { title: "Renamed thread" })
    globalThis.fetch = Object.assign(
      async () => {
        fetchCallCount += 1
        return new Response(JSON.stringify(renamed), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )

    const queryClient = new QueryClient()

    await renameSessionInList({
      queryClient,
      directory: DIRECTORY,
      sessionID: root.id,
      title: "  Renamed thread  ",
    })

    expect(fetchCallCount).toBe(1)
    expect(useChatStore.getState().directories[DIRECTORY]?.sessions[0]?.title).toBe(
      "Renamed thread",
    )

    // A whitespace-only title is a no-op, not a request that blanks the title.
    await renameSessionInList({
      queryClient,
      directory: DIRECTORY,
      sessionID: root.id,
      title: "   ",
    })

    expect(fetchCallCount).toBe(1)

    queryClient.clear()
  })
})
