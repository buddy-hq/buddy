import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState, type UIEvent } from "react"
import { Button } from "@buddy/ui"
import { ChatEmptyState } from "@/components/chat/chat-empty-state"
import { SessionContextUsage } from "@/components/chat/session-context-usage"
import { ChatTranscript } from "@/components/chat/chat-transcript"
import { PermissionDock } from "@/components/chat/permission-dock"
import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import { ChatRightSidebar } from "@/components/layout/chat-right-sidebar"
import { ResizeHandle } from "@/components/layout/resize-handle"
import { getFilename } from "@/components/layout/sidebar-helpers"
import { PromptComposer } from "@/components/prompt/prompt-composer"
import {
  BookOpenIcon,
  LayoutLeftIcon,
  LayoutLeftPartialIcon,
  LayoutRightIcon,
  LayoutRightPartialIcon,
  SettingsIcon,
} from "@/components/layout/sidebar-icons"
import { pickProjectDirectory } from "../lib/directory-picker"
import { decodeDirectory, encodeDirectory } from "../lib/directory-token"
import {
  abortPrompt,
  ensureDirectorySession,
  loadPermissions,
  loadMessages,
  loadSessions,
  replyPermission,
  resyncDirectory,
  selectSession,
  sendPrompt,
  startNewSession,
  updateSession,
} from "../state/chat-actions"
import { useChatStore } from "../state/chat-store"
import { startChatSync } from "../state/chat-sync"
import type {
  GlobalEvent,
  MessageInfo,
  MessagePart,
  PermissionRequest,
  SessionInfo,
} from "../state/chat-types"
import { useUiPreferences } from "../state/ui-preferences"

export const Route = createFileRoute("/$directory/chat")({
  component: DirectoryChatPage,
})

const BOTTOM_THRESHOLD_PX = 96
const SIDEBAR_MIN_WIDTH = 244
const SIDEBAR_DEFAULT_MAX_WIDTH = 1000
const RIGHT_SIDEBAR_MIN_WIDTH = 200
const RIGHT_SIDEBAR_MAX_WIDTH = 480
const RIGHT_SIDEBAR_COLLAPSE_THRESHOLD = 160

async function copyToClipboard(text: string) {
  if (!text) return false
  if (!("clipboard" in navigator)) return false
  await navigator.clipboard.writeText(text)
  return true
}

function buildSessionTrace(input: {
  directory: string
  sessionID?: string
  streamStatus: string
}) {
  const state = useChatStore.getState()
  const directoryState = state.directories[input.directory]
  const session = directoryState?.sessions.find((entry) => entry.id === input.sessionID)

  return JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      directory: input.directory,
      sessionID: input.sessionID,
      streamStatus: input.streamStatus,
      session,
      directoryState: directoryState
        ? {
            sessionTitle: directoryState.sessionTitle,
            sessionStatusByID: directoryState.sessionStatusByID,
            isBusy: directoryState.isBusy,
            isReady: directoryState.isReady,
            error: directoryState.error,
            pendingPermissions: directoryState.pendingPermissions,
            sessions: directoryState.sessions,
            messages: directoryState.messages,
          }
        : undefined,
      projects: state.projects,
      activeDirectory: state.activeDirectory,
      lastSessionByDirectory: state.lastSessionByDirectory,
    },
    null,
    2,
  )
}

function DirectoryChatPage() {
  const params = Route.useParams()
  const navigate = useNavigate()
  const [draft, setDraft] = useState("")
  const transcriptRef = useRef<HTMLElement | null>(null)
  const [stickToBottom, setStickToBottom] = useState(true)

  const decodedDirectory = useMemo(() => {
    try {
      return decodeDirectory(params.directory)
    } catch {
      return ""
    }
  }, [params.directory])

  const projects = useChatStore((state) => state.projects)
  const streamStatus = useChatStore((state) => state.streamStatus)
  const allDirectoryStates = useChatStore((state) => state.directories)
  const directoryState = useChatStore((state) =>
    decodedDirectory ? state.directories[decodedDirectory] : undefined,
  )
  const ensureProject = useChatStore((state) => state.ensureProject)
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const setStreamStatus = useChatStore((state) => state.setStreamStatus)
  const applySessionUpdated = useChatStore((state) => state.applySessionUpdated)
  const applySessionStatus = useChatStore((state) => state.applySessionStatus)
  const applyMessageUpdated = useChatStore((state) => state.applyMessageUpdated)
  const applyPartUpdated = useChatStore((state) => state.applyPartUpdated)
  const applyPartDelta = useChatStore((state) => state.applyPartDelta)
  const applyPermissionAsked = useChatStore((state) => state.applyPermissionAsked)
  const applyPermissionReplied = useChatStore((state) => state.applyPermissionReplied)

  const leftSidebarOpen = useUiPreferences((state) => state.leftSidebarOpen)
  const leftSidebarWidth = useUiPreferences((state) => state.leftSidebarWidth)
  const rightSidebarOpen = useUiPreferences((state) => state.rightSidebarOpen)
  const rightSidebarWidth = useUiPreferences((state) => state.rightSidebarWidth)
  const rightSidebarTab = useUiPreferences((state) => state.rightSidebarTab)
  const pinnedByDirectory = useUiPreferences((state) => state.pinnedByDirectory)
  const unreadByDirectory = useUiPreferences((state) => state.unreadByDirectory)
  const setLeftSidebarOpen = useUiPreferences((state) => state.setLeftSidebarOpen)
  const setLeftSidebarWidth = useUiPreferences((state) => state.setLeftSidebarWidth)
  const setRightSidebarOpen = useUiPreferences((state) => state.setRightSidebarOpen)
  const setRightSidebarWidth = useUiPreferences((state) => state.setRightSidebarWidth)
  const setRightSidebarTab = useUiPreferences((state) => state.setRightSidebarTab)
  const togglePinned = useUiPreferences((state) => state.togglePinned)
  const markUnread = useUiPreferences((state) => state.markUnread)
  const clearUnread = useUiPreferences((state) => state.clearUnread)
  const clearDirectorySessionState = useUiPreferences((state) => state.clearDirectorySessionState)

  const sessionID = directoryState?.sessionID
  const sessions = directoryState?.sessions ?? []
  const sessionTitle =
    sessions.find((session) => session.id === sessionID)?.title ?? directoryState?.sessionTitle ?? "New chat"
  const messages = directoryState?.messages ?? []
  const providers = directoryState?.providers ?? []
  const isBusy = directoryState?.isBusy ?? false
  const isReady = directoryState?.isReady ?? false
  const error = directoryState?.error
  const pendingPermissions = directoryState?.pendingPermissions ?? []
  const sessionsByDirectory = useMemo(
    () =>
      Object.fromEntries(
        projects.map((directory) => [directory, allDirectoryStates[directory]?.sessions ?? []]),
      ) as Record<string, SessionInfo[]>,
    [allDirectoryStates, projects],
  )
  const sessionStatusByDirectory = useMemo(
    () =>
      Object.fromEntries(
        projects.map((directory) => [directory, allDirectoryStates[directory]?.sessionStatusByID ?? {}]),
      ) as Record<string, Record<string, "busy" | "idle">>,
    [allDirectoryStates, projects],
  )
  const unreadSessionMap = unreadByDirectory[decodedDirectory] ?? {}
  const showDevSessionTrace = import.meta.env.DEV
  const leftSidebarMaxWidth =
    typeof window === "undefined" ? SIDEBAR_DEFAULT_MAX_WIDTH : window.innerWidth * 0.3 + 64

  useEffect(() => {
    if (!decodedDirectory) return

    ensureProject(decodedDirectory)
    setActiveDirectory(decodedDirectory)
    void ensureDirectorySession(decodedDirectory)
  }, [decodedDirectory, ensureProject, setActiveDirectory])

  useEffect(() => {
    if (!decodedDirectory) return

    const sync = startChatSync({
      directory: decodedDirectory,
      onStatus(status) {
        setStreamStatus(status)
      },
      onOpen() {
        const knownProjects = useChatStore.getState().projects
        for (const directory of knownProjects) {
          void resyncDirectory(directory)
        }
      },
      onEvent(event: GlobalEvent) {
        const directory = event.directory
        if (!directory || directory === "global") {
          if (event.payload.type === "server.connected") {
            const knownProjects = useChatStore.getState().projects
            for (const projectDirectory of knownProjects) {
              void resyncDirectory(projectDirectory)
            }
          }
          return
        }

        const payload = event.payload
        const properties = payload.properties

        if (payload.type === "session.created" || payload.type === "session.updated") {
          applySessionUpdated(directory, properties.info as SessionInfo)
          return
        }

        if (payload.type === "session.status") {
          const rawStatus = properties.status
          const statusType =
            typeof rawStatus === "string"
              ? rawStatus
              : rawStatus && typeof rawStatus === "object" && "type" in rawStatus
                ? String((rawStatus as { type?: unknown }).type ?? "idle")
                : "idle"

          const normalizedStatus = statusType === "busy" || statusType === "retry" ? "busy" : "idle"
          applySessionStatus(
            directory,
            String(properties.sessionID ?? ""),
            normalizedStatus,
          )
          return
        }

        if (payload.type === "message.updated") {
          const info = properties.info as MessageInfo
          applyMessageUpdated(directory, info)
          const activeSessionID = useChatStore.getState().directories[directory]?.sessionID
          if (info.role === "assistant" && info.sessionID && info.sessionID !== activeSessionID) {
            useUiPreferences.getState().markUnread(directory, info.sessionID)
          }
          return
        }

        if (payload.type === "message.part.updated") {
          applyPartUpdated(directory, properties.part as MessagePart)
          return
        }

        if (payload.type === "message.part.delta") {
          applyPartDelta(directory, {
            sessionID: String(properties.sessionID ?? ""),
            messageID: String(properties.messageID ?? ""),
            partID: String(properties.partID ?? ""),
            field: String(properties.field ?? ""),
            delta: String(properties.delta ?? ""),
          })
          return
        }

        if (payload.type === "permission.asked") {
          applyPermissionAsked(directory, properties as PermissionRequest)
          return
        }

        if (payload.type === "permission.replied") {
          applyPermissionReplied(directory, String(properties.requestID ?? ""))
        }
      },
    })

    return () => {
      sync.stop()
      setStreamStatus("idle")
    }
  }, [
    decodedDirectory,
    applyMessageUpdated,
    applyPermissionAsked,
    applyPermissionReplied,
    applyPartDelta,
    applyPartUpdated,
    applySessionStatus,
    applySessionUpdated,
    setStreamStatus,
  ])

  useEffect(() => {
    setStickToBottom(true)
  }, [sessionID])

  useEffect(() => {
    if (!decodedDirectory || !sessionID) return
    clearUnread(decodedDirectory, sessionID)
  }, [clearUnread, decodedDirectory, sessionID])

  useEffect(() => {
    if (!stickToBottom) return
    const container = transcriptRef.current
    if (!container) return
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "auto",
    })
  }, [messages, isBusy, stickToBottom])

  function onTranscriptScroll(event: UIEvent<HTMLElement>) {
    const node = event.currentTarget
    const distanceFromBottom = node.scrollHeight - (node.scrollTop + node.clientHeight)
    setStickToBottom(distanceFromBottom <= BOTTOM_THRESHOLD_PX)
  }

  async function onSend() {
    if (!decodedDirectory) return
    const content = draft.trim()
    if (!content) return

    setDraft("")
    try {
      await sendPrompt(decodedDirectory, content)
    } catch {
      setDraft(content)
    }
  }

  async function onAbort() {
    if (!decodedDirectory) return
    await abortPrompt(decodedDirectory)
  }

  async function onNewSession() {
    if (!decodedDirectory) return
    try {
      await startNewSession(decodedDirectory)
    } catch {
      // Store already captures and displays errors.
    }
  }

  async function onSelectSession(targetDirectory: string, nextSessionID?: string) {
    if (!targetDirectory) return
    if (!nextSessionID) {
      if (targetDirectory !== decodedDirectory) {
        onSwitchDirectory(targetDirectory)
      }
      return
    }
    try {
      await selectSession(targetDirectory, nextSessionID)
      clearUnread(targetDirectory, nextSessionID)
      if (targetDirectory !== decodedDirectory) {
        onSwitchDirectory(targetDirectory)
      }
    } catch {
      // Store already captures and displays errors.
    }
  }

  async function onPermissionReply(requestID: string, reply: "once" | "always" | "reject") {
    if (!decodedDirectory) return
    try {
      await replyPermission({
        directory: decodedDirectory,
        requestID,
        reply,
      })
    } catch {
      // store error is handled by action callers elsewhere; keep UI non-blocking here
    }
  }

  function onSwitchDirectory(nextDirectory: string) {
    if (!nextDirectory) return
    navigate({
      to: "/$directory/chat",
      params: { directory: encodeDirectory(nextDirectory) },
    })
  }

  async function onOpenProject() {
    try {
      const picked = await pickProjectDirectory()
      if (!picked) return

      ensureProject(picked)
      setActiveDirectory(picked)
      onSwitchDirectory(picked)
    } catch {
      // keep current screen state if user cancels/inputs invalid path in fallback prompt
    }
  }

  async function onArchiveSession(targetDirectory: string, targetSessionID: string) {
    if (!targetDirectory) return
    try {
      await updateSession({
        directory: targetDirectory,
        sessionID: targetSessionID,
        archivedAt: Date.now(),
      })
      clearDirectorySessionState(targetDirectory, targetSessionID)
      await loadSessions(targetDirectory)
      await loadPermissions(targetDirectory)

      const activeSessionID = useChatStore.getState().directories[targetDirectory]?.sessionID
      if (!activeSessionID) {
        await startNewSession(targetDirectory)
        await loadPermissions(targetDirectory)
        return
      }

      if (activeSessionID !== targetSessionID) {
        await loadMessages(targetDirectory, activeSessionID)
        clearUnread(targetDirectory, activeSessionID)
      }
    } catch {
      // action layers keep directory-level error state
    }
  }

  async function onRenameSession(targetDirectory: string, targetSessionID: string, title: string) {
    if (!targetDirectory) return
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      const updated = await updateSession({
        directory: targetDirectory,
        sessionID: targetSessionID,
        title: trimmed,
      })
      applySessionUpdated(targetDirectory, updated)
    } catch {
      // action layers keep directory-level error state
    }
  }

  function onToggleUnreadSession(targetDirectory: string, targetSessionID: string, unread: boolean) {
    if (!targetDirectory) return
    if (unread) {
      markUnread(targetDirectory, targetSessionID)
      return
    }
    clearUnread(targetDirectory, targetSessionID)
  }

  function openCurriculumPanel() {
    setRightSidebarTab("curriculum")
    setRightSidebarOpen(true)
  }

  function openSettingsPanel() {
    setRightSidebarTab("settings")
    setRightSidebarOpen(true)
  }

  if (!decodedDirectory) {
    return <div className="p-6">Invalid project identifier in URL.</div>
  }

  return (
    <div className="h-screen w-full overflow-hidden bg-card">
      <div className="h-full w-full flex min-w-0">
        {leftSidebarOpen ? (
          <div
            className="relative shrink-0 min-h-0"
            style={{ width: `${Math.max(leftSidebarWidth, SIDEBAR_MIN_WIDTH)}px` }}
          >
            <ChatLeftSidebar
              directories={projects}
              currentDirectory={decodedDirectory}
              sessionsByDirectory={sessionsByDirectory}
              activeSessionID={sessionID}
              sessionStatusByDirectory={sessionStatusByDirectory}
              pinnedByDirectory={pinnedByDirectory}
              unreadByDirectory={unreadByDirectory}
              onOpenDirectory={() => {
                void onOpenProject()
              }}
              onNewSession={() => {
                void onNewSession()
              }}
              onSelectSession={(targetDirectory, targetSessionID) => {
                void onSelectSession(targetDirectory, targetSessionID)
              }}
              onTogglePin={(targetDirectory, targetSessionID) => togglePinned(targetDirectory, targetSessionID)}
              onToggleUnread={onToggleUnreadSession}
              onArchiveSession={onArchiveSession}
              onRenameSession={onRenameSession}
              onOpenCurriculum={openCurriculumPanel}
              onOpenSettings={openSettingsPanel}
              className="w-full h-full"
            />
            <ResizeHandle
              direction="horizontal"
              size={leftSidebarWidth}
              min={SIDEBAR_MIN_WIDTH}
              max={leftSidebarMaxWidth}
              collapseThreshold={SIDEBAR_MIN_WIDTH}
              onResize={setLeftSidebarWidth}
              onCollapse={() => setLeftSidebarOpen(false)}
            />
          </div>
        ) : null}

        <main className="flex-1 min-w-0 min-h-0 flex flex-col bg-background/20">
          <header className="border-b px-3 py-2">
            <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
                  title={leftSidebarOpen ? "Collapse left panel" : "Expand left panel"}
                >
                  {leftSidebarOpen ? (
                    <LayoutLeftPartialIcon className="size-3.5" />
                  ) : (
                    <LayoutLeftIcon className="size-3.5" />
                  )}
                </Button>
                <div className="min-w-0">
                  <h1 className="text-sm md:text-base font-medium truncate">{sessionTitle}</h1>
                  <p className="text-xs text-muted-foreground truncate">
                    local: {getFilename(decodedDirectory)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <SessionContextUsage messages={messages} providers={providers} />
                <Button variant="ghost" size="icon-xs" onClick={openCurriculumPanel} title="Open curriculum">
                  <BookOpenIcon className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon-xs" onClick={openSettingsPanel} title="Open settings">
                  <SettingsIcon className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
                  title={rightSidebarOpen ? "Collapse right panel" : "Expand right panel"}
                >
                  {rightSidebarOpen ? (
                    <LayoutRightPartialIcon className="size-3.5" />
                  ) : (
                    <LayoutRightIcon className="size-3.5" />
                  )}
                </Button>

                {showDevSessionTrace && sessionID ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void copyToClipboard(
                        buildSessionTrace({
                          directory: decodedDirectory,
                          sessionID,
                          streamStatus,
                        }),
                      )
                    }}
                  >
                    Copy Trace
                  </Button>
                ) : null}
                <span className="text-xs text-muted-foreground hidden lg:inline">SSE: {streamStatus}</span>
              </div>
            </div>
          </header>

          <section ref={transcriptRef} onScroll={onTranscriptScroll} className="flex-1 min-h-0 overflow-y-auto">
            <div className={`mx-auto w-full max-w-[1080px] px-4 py-4 space-y-4 ${messages.length === 0 && isReady ? 'h-full' : ''}`}>
              {!isReady ? (
                <p className="text-sm text-muted-foreground">Loading notebook chat...</p>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col">
                  <ChatEmptyState
                    directoryLabel={getFilename(decodedDirectory)}
                    onUsePrompt={setDraft}
                    onOpenCurriculum={openCurriculumPanel}
                  />
                </div>
              ) : (
                <ChatTranscript
                  messages={messages}
                  providers={providers}
                  isBusy={isBusy}
                  onOpenSession={(targetSessionID) => {
                    void onSelectSession(decodedDirectory, targetSessionID)
                  }}
                />
              )}
            </div>
          </section>

          {error ? (
            <div className="mx-auto w-full max-w-[1080px] px-4 pb-2">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            </div>
          ) : null}

          {pendingPermissions.length > 0 ? (
            <div className="mx-auto w-full max-w-[1080px] px-4 pb-2">
              <PermissionDock
                request={pendingPermissions[0]!}
                pendingCount={Math.max(0, pendingPermissions.length - 1)}
                onReply={async (reply) => {
                  await onPermissionReply(pendingPermissions[0]!.id, reply)
                }}
              />
            </div>
          ) : null}

          <div className="mx-auto w-full max-w-[1080px] px-4">
            <PromptComposer
              className="mb-4"
              value={draft}
              isBusy={isBusy}
              onChange={setDraft}
              onAbort={() => {
                void onAbort()
              }}
              onSubmit={() => {
                void onSend()
              }}
            />
          </div>
        </main>

        {rightSidebarOpen ? (
          <div
            className="relative shrink-0 min-h-0"
            style={{ width: `${Math.max(rightSidebarWidth, RIGHT_SIDEBAR_MIN_WIDTH)}px` }}
          >
            <ChatRightSidebar
              directory={decodedDirectory}
              tab={rightSidebarTab}
              onTabChange={setRightSidebarTab}
              onClose={() => setRightSidebarOpen(false)}
              className="w-full h-full"
            />
            <ResizeHandle
              direction="horizontal"
              edge="start"
              size={rightSidebarWidth}
              min={RIGHT_SIDEBAR_MIN_WIDTH}
              max={RIGHT_SIDEBAR_MAX_WIDTH}
              collapseThreshold={RIGHT_SIDEBAR_COLLAPSE_THRESHOLD}
              onResize={setRightSidebarWidth}
              onCollapse={() => setRightSidebarOpen(false)}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
