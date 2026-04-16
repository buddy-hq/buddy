import { useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import {
  Button,
  ChevronLeftIcon,
  ResizeHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizablePanelRef,
} from "@buddy/ui"
import { DirectoryChatConversationPane } from "@/components/directory-chat/directory-chat-conversation-pane"
import { DirectoryChatReadingReaderPane } from "@/components/directory-chat/directory-chat-reading-reader-pane"
import { DirectoryChatReadingThreadBrowser } from "@/components/directory-chat/directory-chat-reading-thread-browser"
import { usePersistentResizablePanelLayout } from "@/components/layout/use-persistent-resizable-panel-layout"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import { language } from "@/context/language"
import { fileNameFromPath, normalizeRelativePath } from "@/lib/workspace-file-paths"
import { useChatStore } from "@/state/chat-store"
import { useTeachingRuntime, teachingSelectionKey } from "@/state/teaching-runtime"
import { loadResources, type ResourceRecord } from "@/state/resource-actions"

type DirectoryChatReadingPageProps = {
  resourcePath: string
  resourceKey?: string
}

function normalizeResourceRecordPath(record: ResourceRecord) {
  return normalizeRelativePath(record.sourceOriginRelpath ?? record.sourceRelpath)
}

const READING_CHAT_PANEL_WIDTH_STORAGE_KEY = "directory-chat-reading-chat-panel-width"
const READING_CHAT_PANEL_DEFAULT_WIDTH_PX = 480
const READING_CHAT_PANEL_MIN_WIDTH_PX = 320
const READING_CHAT_PANEL_MAX_VIEWPORT_RATIO = 0.55
const READING_READER_PANEL_MIN_WIDTH_PX = 320
const READING_LAYOUT_ID = "directory-chat-reading-layout"
const READING_READER_PANEL_ID = "directory-chat-reading-reader"
const READING_CONVERSATION_PANEL_ID = "directory-chat-reading-conversation"
const READING_LAYOUT_PANEL_IDS = [READING_READER_PANEL_ID, READING_CONVERSATION_PANEL_ID]

function getReadingChatPanelMaxWidth() {
  return typeof window === "undefined"
    ? READING_CHAT_PANEL_DEFAULT_WIDTH_PX
    : window.innerWidth * READING_CHAT_PANEL_MAX_VIEWPORT_RATIO
}

export function DirectoryChatReadingPage(props: DirectoryChatReadingPageProps) {
  const navigate = useNavigate()
  const { controller, directoryToken } = useDirectoryNotebookRouteContext()
  const normalizedPath = normalizeRelativePath(props.resourcePath)
  const resourceName = fileNameFromPath(normalizedPath) || language.t("sidebar.resources")
  const readyDirectory =
    controller.status === "ready" ? controller.mainPaneProps.directory : undefined
  const [resourceRecord, setResourceRecord] = useState<ResourceRecord | undefined>(undefined)
  const [chatPanelWidth, setChatPanelWidth] = useState(() => {
    if (typeof window === "undefined") {
      return READING_CHAT_PANEL_DEFAULT_WIDTH_PX
    }

    const saved = window.localStorage.getItem(READING_CHAT_PANEL_WIDTH_STORAGE_KEY)
    const parsed = saved ? Number.parseInt(saved, 10) : Number.NaN
    if (!Number.isFinite(parsed)) {
      return READING_CHAT_PANEL_DEFAULT_WIDTH_PX
    }

    return Math.min(
      Math.max(parsed, READING_CHAT_PANEL_MIN_WIDTH_PX),
      getReadingChatPanelMaxWidth(),
    )
  })
  const setActiveReadingResource = useChatStore((state) => state.setActiveReadingResource)
  const updateActiveReadingResourceLocation = useChatStore(
    (state) => state.updateActiveReadingResourceLocation,
  )
  const setSessionPersona = useTeachingRuntime((state) => state.setSessionPersona)
  const selectedPersonaBySession = useTeachingRuntime((state) => state.selectedPersonaBySession)
  const restoredPersonaRef = useRef<string | undefined>(undefined)
  const conversationPanelRef = useResizablePanelRef()
  const { defaultLayout, onLayoutChanged } = usePersistentResizablePanelLayout({
    id: READING_LAYOUT_ID,
    panelIds: READING_LAYOUT_PANEL_IDS,
  })

  useEffect(() => {
    window.localStorage.setItem(READING_CHAT_PANEL_WIDTH_STORAGE_KEY, chatPanelWidth.toString())
  }, [chatPanelWidth])

  useEffect(() => {
    if (!readyDirectory) return
    let cancelled = false
    setResourceRecord(undefined)
    void loadResources(readyDirectory)
      .then((resources) => {
        if (cancelled) return
        const matched = props.resourceKey
          ? resources.find(
              (resource) =>
                resource.id === props.resourceKey || resource.alias === props.resourceKey,
            )
          : normalizedPath
            ? resources.find((resource) => normalizeResourceRecordPath(resource) === normalizedPath)
            : undefined
        setResourceRecord(matched)
      })
      .catch(() => {
        if (!cancelled) {
          setResourceRecord(undefined)
        }
      })
    return () => {
      cancelled = true
    }
  }, [normalizedPath, props.resourceKey, readyDirectory])

  useEffect(() => {
    if (!readyDirectory) return

    const sessionID = useChatStore.getState().directories[readyDirectory]?.sessionID
    const sessionKey = teachingSelectionKey(readyDirectory, sessionID)
    const currentPersona = selectedPersonaBySession[sessionKey]

    if (currentPersona === "reading-buddy") return

    restoredPersonaRef.current = currentPersona
    setSessionPersona(sessionKey, "reading-buddy")

    return () => {
      const previousPersona = restoredPersonaRef.current
      restoredPersonaRef.current = undefined
      if (previousPersona !== undefined) {
        setSessionPersona(sessionKey, previousPersona)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyDirectory, setSessionPersona])

  useEffect(() => {
    if (!readyDirectory || !normalizedPath) return
    setActiveReadingResource(readyDirectory, {
      ...(resourceRecord?.id ? { resourceID: resourceRecord.id } : {}),
      ...(resourceRecord?.alias ? { alias: resourceRecord.alias } : {}),
      name: resourceName,
      path: normalizedPath,
      ...(resourceRecord?.status ? { status: resourceRecord.status } : {}),
    })

    return () => {
      setActiveReadingResource(readyDirectory, undefined)
    }
  }, [normalizedPath, readyDirectory, resourceName, resourceRecord, setActiveReadingResource])

  if (controller.status === "invalid") {
    return (
      <div data-component="directory-chat-reading-invalid" className="p-6">
        {language.t("directoryChat.invalidNotebookIdentifier")}
      </div>
    )
  }

  if (controller.status === "opening") {
    return (
      <div data-component="directory-chat-reading-opening" className="p-6">
        {language.t("directoryChat.openingNotebook")}
      </div>
    )
  }

  const readyController = controller
  const currentDirectory = readyController.mainPaneProps.directory
  const threadBrowserState = readyController.mainPaneProps.chatState

  return (
    <section
      data-component="directory-chat-reading-page"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-raised-base"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-weaker-base bg-background-base/80 px-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={language.t("sidebar.resourcesBackToChat")}
          title={language.t("sidebar.resourcesBackToChat")}
          onClick={() => {
            void navigate({
              to: "/$directory/chat",
              params: {
                directory: directoryToken,
              },
            })
          }}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-base">{resourceName}</p>
          <p className="truncate text-[11px] text-text-weak">{normalizedPath}</p>
        </div>
      </header>

      <ResizablePanelGroup
        id={READING_LAYOUT_ID}
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="min-h-0 flex-1 w-full"
      >
        <ResizablePanel
          id={READING_READER_PANEL_ID}
          minSize={READING_READER_PANEL_MIN_WIDTH_PX}
          className="min-h-0 min-w-0 overflow-hidden"
        >
          <div className="min-w-0 h-full border-r border-border-weaker-base bg-background-base">
            {readyDirectory && normalizedPath ? (
              <DirectoryChatReadingReaderPane
                directory={readyDirectory}
                resourceName={resourceName}
                resourcePath={normalizedPath}
                onLocationChange={(location) => {
                  updateActiveReadingResourceLocation(readyDirectory, {
                    locationLabel: location.locationLabel,
                    tocLabel: location.tocLabel,
                    pageLabel: location.pageLabel,
                  })
                }}
              />
            ) : null}
          </div>
        </ResizablePanel>

        <ResizablePanel
          id={READING_CONVERSATION_PANEL_ID}
          panelRef={conversationPanelRef}
          defaultSize={chatPanelWidth}
          minSize={READING_CHAT_PANEL_MIN_WIDTH_PX}
          maxSize={getReadingChatPanelMaxWidth()}
          className="relative flex min-h-0 min-w-0 overflow-hidden"
        >
          <DirectoryChatConversationPane
            {...readyController.mainPaneProps}
            topContent={
              <DirectoryChatReadingThreadBrowser
                sessionTitle={threadBrowserState.sessionTitle}
                sessions={threadBrowserState.sessions}
                activeSessionID={threadBrowserState.sessionID}
                onNewSession={() => {
                  void readyController.leftSidebarProps.onNewSession(currentDirectory)
                }}
                onSelectSession={(sessionID) => {
                  void readyController.leftSidebarProps.onSelectSession(currentDirectory, sessionID)
                }}
              />
            }
            mainPaneTab="chat"
            className="h-full w-full"
          />
          <ResizeHandle
            direction="horizontal"
            edge="start"
            size={chatPanelWidth}
            min={READING_CHAT_PANEL_MIN_WIDTH_PX}
            max={getReadingChatPanelMaxWidth()}
            onResize={(width) => {
              conversationPanelRef.current?.resize(width)
              setChatPanelWidth(width)
            }}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </section>
  )
}
