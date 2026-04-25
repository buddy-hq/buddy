import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useChatStore } from "../src/state/chat-store"
import type { GlobalEvent } from "../src/state/chat-types"

const actualChatActions = await import("../src/state/chat-actions")
const actualDirectoryChatQuery = await import("../src/state/directory-chat-query")
const actualChatPromptHelpers = await import("../src/lib/directory-chat/chat-prompt-helpers")
const actualChatSync = await import("../src/state/chat-sync")

type SyncHandlers = {
  directory?: string
  onOpen?: () => void
  onEvent: (event: GlobalEvent) => void
  onError?: (error: unknown) => void
  onStatus?: (status: "connecting" | "connected" | "error") => void
}

const resyncDirectoryMock = mock(async (_directory: string) => undefined)
const resyncDirectoryAfterReconnectMock = mock(async (_directory: string) => undefined)
const stopSyncMock = mock(() => undefined)

let syncHandlers: SyncHandlers | undefined

mock.module("../src/state/chat-actions", () => ({
  ...actualChatActions,
  resyncDirectory: resyncDirectoryMock,
  resyncDirectoryAfterReconnect: resyncDirectoryAfterReconnectMock,
}))

mock.module("../src/state/directory-chat-query", () => ({
  ...actualDirectoryChatQuery,
  removeDirectoryPermissionQueryData() {},
  removeDirectoryQuestionQueryData() {},
  setDirectoryPermissionsQueryData() {},
  setDirectoryQuestionsQueryData() {},
  setDirectorySessionsQueryData() {},
  upsertDirectoryPermissionQueryData() {},
  upsertDirectoryQuestionQueryData() {},
  upsertDirectorySessionQueryData() {},
}))

mock.module("../src/lib/directory-chat/chat-prompt-helpers", () => ({
  ...actualChatPromptHelpers,
  readSessionErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  },
}))

mock.module("../src/state/chat-sync", () => ({
  ...actualChatSync,
  startChatSync(handlers: SyncHandlers) {
    syncHandlers = handlers
    return {
      stop: stopSyncMock,
    }
  },
}))

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function resetChatStore() {
  useChatStore.setState({
    openProjects: [],
    activeDirectory: undefined,
    pendingActiveDirectory: undefined,
    entryError: undefined,
    lastSessionByDirectory: {},
    selectedModelByDirectory: {},
    directories: {},
    streamStatus: "idle",
  })
}

describe("useChatSync", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    queryClient = new QueryClient()
    resetChatStore()
    resyncDirectoryMock.mockClear()
    resyncDirectoryAfterReconnectMock.mockClear()
    stopSyncMock.mockClear()
    syncHandlers = undefined
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    queryClient.clear()
    container.remove()
    resetChatStore()
  })

  test("quietly resyncs when a server instance is disposed", async () => {
    const { useChatSync } = await import("../src/lib/directory-chat/use-chat-sync")
    const setDirectoryError = mock((_directory: string, _error: string) => undefined)

    function Probe() {
      useChatSync({
        decodedDirectory: "/repo",
        hasRegisteredProject: true,
        applySessionUpdated() {},
        applySessionStatus() {},
        applyMessageUpdated() {},
        applyMessageRemoved() {},
        applyPartUpdated() {},
        applyPartRemoved() {},
        applyPartDelta() {},
        applyPermissionAsked() {},
        applyPermissionReplied() {},
        applyQuestionAsked() {},
        applyQuestionResolved() {},
        clearDirectoryError() {},
        setDirectoryError,
        setStreamStatus() {},
        setSystemPromptRefreshToken() {},
        refreshSlashCommands() {},
        refreshMcpStatus() {},
      })

      return null
    }

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    expect(syncHandlers).toBeDefined()

    await act(async () => {
      syncHandlers?.onEvent({
        directory: "/repo",
        payload: {
          type: "server.instance.disposed",
          properties: {
            directory: "/repo",
          },
        },
      })
      await flushEffects()
    })

    expect(resyncDirectoryMock).toHaveBeenCalledTimes(1)
    expect(resyncDirectoryMock).toHaveBeenCalledWith("/repo")
    expect(setDirectoryError).not.toHaveBeenCalled()
  })

  test("does not resync on stream open or server connected events", async () => {
    const { useChatSync } = await import("../src/lib/directory-chat/use-chat-sync")

    function Probe() {
      useChatSync({
        decodedDirectory: "/repo",
        hasRegisteredProject: true,
        applySessionUpdated() {},
        applySessionStatus() {},
        applyMessageUpdated() {},
        applyMessageRemoved() {},
        applyPartUpdated() {},
        applyPartRemoved() {},
        applyPartDelta() {},
        applyPermissionAsked() {},
        applyPermissionReplied() {},
        applyQuestionAsked() {},
        applyQuestionResolved() {},
        clearDirectoryError() {},
        setDirectoryError() {},
        setStreamStatus() {},
        setSystemPromptRefreshToken() {},
        refreshSlashCommands() {},
        refreshMcpStatus() {},
      })

      return null
    }

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    await act(async () => {
      syncHandlers?.onOpen?.()
      syncHandlers?.onEvent({
        directory: "/repo",
        payload: {
          type: "server.connected",
          properties: {},
        },
      })
      await flushEffects()
    })

    expect(resyncDirectoryMock).not.toHaveBeenCalled()
    expect(resyncDirectoryAfterReconnectMock).not.toHaveBeenCalled()
  })

  test("resyncs after reconnecting a previously opened stream", async () => {
    const { useChatSync } = await import("../src/lib/directory-chat/use-chat-sync")

    function Probe() {
      useChatSync({
        decodedDirectory: "/repo",
        hasRegisteredProject: true,
        applySessionUpdated() {},
        applySessionStatus() {},
        applyMessageUpdated() {},
        applyMessageRemoved() {},
        applyPartUpdated() {},
        applyPartRemoved() {},
        applyPartDelta() {},
        applyPermissionAsked() {},
        applyPermissionReplied() {},
        applyQuestionAsked() {},
        applyQuestionResolved() {},
        clearDirectoryError() {},
        setDirectoryError() {},
        setStreamStatus() {},
        setSystemPromptRefreshToken() {},
        refreshSlashCommands() {},
        refreshMcpStatus() {},
      })

      return null
    }

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    await act(async () => {
      syncHandlers?.onStatus?.("connected")
      syncHandlers?.onStatus?.("error")
      syncHandlers?.onStatus?.("connected")
      await flushEffects()
    })

    expect(resyncDirectoryAfterReconnectMock).toHaveBeenCalledWith("/repo")
  })

  test("applies message and part removals from sync events", async () => {
    const { useChatSync } = await import("../src/lib/directory-chat/use-chat-sync")
    const applyMessageRemoved = mock(() => undefined)
    const applyPartRemoved = mock(() => undefined)

    function Probe() {
      useChatSync({
        decodedDirectory: "/repo",
        hasRegisteredProject: true,
        applySessionUpdated() {},
        applySessionStatus() {},
        applyMessageUpdated() {},
        applyMessageRemoved,
        applyPartUpdated() {},
        applyPartRemoved,
        applyPartDelta() {},
        applyPermissionAsked() {},
        applyPermissionReplied() {},
        applyQuestionAsked() {},
        applyQuestionResolved() {},
        clearDirectoryError() {},
        setDirectoryError() {},
        setStreamStatus() {},
        setSystemPromptRefreshToken() {},
        refreshSlashCommands() {},
        refreshMcpStatus() {},
      })

      return null
    }

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    await act(async () => {
      syncHandlers?.onEvent({
        directory: "/repo",
        payload: {
          type: "message.removed",
          properties: {
            sessionID: "ses_1",
            messageID: "msg_1",
          },
        },
      })
      syncHandlers?.onEvent({
        directory: "/repo",
        payload: {
          type: "message.part.removed",
          properties: {
            sessionID: "ses_1",
            messageID: "msg_2",
            partID: "prt_1",
          },
        },
      })
      await flushEffects()
    })

    expect(applyMessageRemoved).toHaveBeenCalledWith("/repo", {
      sessionID: "ses_1",
      messageID: "msg_1",
    })
    expect(applyPartRemoved).toHaveBeenCalledWith("/repo", {
      sessionID: "ses_1",
      messageID: "msg_2",
      partID: "prt_1",
    })
  })
})
