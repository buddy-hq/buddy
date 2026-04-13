import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import { useEffect, useMemo } from "react"
import {
  Button,
  ResizeHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Separator,
  cn,
  toast,
  useResizablePanelRef,
} from "@buddy/ui"
import { ArrowLeftIcon } from "lucide-react"
import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import { useSyncResizablePanelSize } from "@/components/layout/use-sync-resizable-panel-size"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsPage } from "@/components/settings/settings-page"
import { useStandardsRuntime } from "@/components/settings/use-standards-runtime"
import {
  DEFAULT_SETTINGS_TAB,
  getVisibleSettingsTabDefinitions,
  resolveSettingsTab,
  type SettingsTab,
  type SettingsTabDefinition,
} from "@/components/settings/settings-tabs"
import { encodeDirectory } from "../lib/directory-token"
import {
  bootstrapOpenProjects,
  closeOpenProject,
  openProject,
  preloadProjectSessions,
  reorderOpenProjects,
  selectSession,
  startNewSessionDraft,
  updateSession,
} from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import { shallow } from "zustand/shallow"
import { useUiPreferences } from "@/state/ui-preferences"
import { pickProjectDirectory } from "../lib/directory-picker"

const SETTINGS_SIDEBAR_MIN_WIDTH_PX = 244

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): { tab: SettingsTab } => {
    const tab = search.tab
    if (typeof tab === "string") {
      const resolvedTab = resolveSettingsTab(tab)
      if (resolvedTab) {
        return { tab: resolvedTab }
      }
    }
    return { tab: DEFAULT_SETTINGS_TAB }
  },
  component: SettingsRoute,
})

function SettingsRoute() {
  const navigate = useNavigate()
  const { tab } = useSearch({ from: "/settings" })
  const platform = usePlatform()
  const openProjects = useChatStore((state) => state.openProjects, shallow)
  const activeDirectory = useChatStore((state) => state.activeDirectory)
  const directories = useChatStore((state) => state.directories, shallow)
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const pinnedByDirectory = useUiPreferences((state) => state.pinnedByDirectory)
  const unreadByDirectory = useUiPreferences((state) => state.unreadByDirectory)
  const togglePinned = useUiPreferences((state) => state.togglePinned)
  const markUnread = useUiPreferences((state) => state.markUnread)
  const clearUnread = useUiPreferences((state) => state.clearUnread)
  const leftSidebarWidth = useUiPreferences((state) => state.leftSidebarWidth)
  const setLeftSidebarWidth = useUiPreferences((state) => state.setLeftSidebarWidth)
  const { standardsEnabled, standardsStatus } = useStandardsRuntime({
    open: true,
    platform: platform.platform,
  })
  const leftSidebarPanelRef = useResizablePanelRef()

  const currentDirectory = activeDirectory ?? openProjects[0] ?? ""
  const activeSessionID = currentDirectory ? directories[currentDirectory]?.sessionID : undefined
  const leftSidebarMaxWidth = typeof window === "undefined" ? 1000 : window.innerWidth * 0.3 + 64
  const visibleTabs = useMemo(
    () => getVisibleSettingsTabDefinitions({ standardsEnabled }),
    [standardsEnabled],
  )
  const mainTabs = useMemo(() => visibleTabs.filter((item) => item.group === "main"), [visibleTabs])
  const optionalTabs = useMemo(
    () => visibleTabs.filter((item) => item.group === "optional"),
    [visibleTabs],
  )
  const visibleTabIDs = useMemo(() => new Set(visibleTabs.map((item) => item.id)), [visibleTabs])

  const sessionsByDirectory = useMemo(
    () =>
      Object.fromEntries(
        openProjects.map((directory) => [directory, directories[directory]?.sessions ?? []]),
      ),
    [directories, openProjects],
  )

  const sessionStatusByDirectory = useMemo(
    () =>
      Object.fromEntries(
        openProjects.map((directory) => [
          directory,
          directories[directory]?.sessionStatusByID ?? {},
        ]),
      ),
    [directories, openProjects],
  )

  useEffect(() => {
    void bootstrapOpenProjects().catch(() => undefined)
  }, [])

  useSyncResizablePanelSize(leftSidebarPanelRef, leftSidebarWidth)

  useEffect(() => {
    if (tab !== "standards" && visibleTabIDs.has(tab)) {
      return
    }
    if (tab === "standards" && standardsStatus === null) {
      return
    }

    const fallbackTab = tab === "standards" ? "advanced" : DEFAULT_SETTINGS_TAB
    if (visibleTabIDs.has(tab)) {
      return
    }

    navigate({
      to: "/settings",
      search: { tab: fallbackTab },
      replace: true,
    })
  }, [navigate, standardsStatus, tab, visibleTabIDs])

  function openChat(directory: string) {
    navigate({
      to: "/$directory/chat",
      params: { directory: encodeDirectory(directory) },
    })
  }

  async function onOpenDirectory() {
    try {
      const picked = await pickProjectDirectory()
      if (!picked) return
      const nextDirectory = await openProject(picked)
      setActiveDirectory(nextDirectory)
      await preloadProjectSessions([nextDirectory])
    } catch {
      toast.error(language.t("routes.settings.openNotebookFailed"))
    }
  }

  function onNewSession(targetDirectory?: string) {
    const nextDirectory = targetDirectory || currentDirectory
    if (!nextDirectory) return
    setActiveDirectory(nextDirectory)
    startNewSessionDraft(nextDirectory)
    openChat(nextDirectory)
  }

  async function onSelectSession(targetDirectory: string, targetSessionID?: string) {
    if (!targetDirectory) return
    setActiveDirectory(targetDirectory)
    try {
      if (targetSessionID) {
        await selectSession(targetDirectory, targetSessionID)
      }
      openChat(targetDirectory)
    } catch {
      toast.error(language.t("routes.settings.openThreadFailed"))
    }
  }

  function onToggleUnread(targetDirectory: string, targetSessionID: string, unread: boolean) {
    if (!targetDirectory) return
    if (unread) {
      markUnread(targetDirectory, targetSessionID)
      return
    }
    clearUnread(targetDirectory, targetSessionID)
  }

  async function onArchiveSession(targetDirectory: string, targetSessionID: string) {
    if (!targetDirectory) return
    try {
      await updateSession({
        directory: targetDirectory,
        sessionID: targetSessionID,
        archivedAt: Date.now(),
      })
      await preloadProjectSessions([targetDirectory])
    } catch {
      toast.error(language.t("routes.settings.archiveThreadFailed"))
    }
  }

  async function onRenameSession(targetDirectory: string, targetSessionID: string, title: string) {
    if (!targetDirectory) return
    const nextTitle = title.trim()
    if (!nextTitle) return
    try {
      const updated = await updateSession({
        directory: targetDirectory,
        sessionID: targetSessionID,
        title: nextTitle,
      })
      useChatStore.getState().applySessionUpdated(targetDirectory, updated)
    } catch {
      toast.error(language.t("routes.settings.renameThreadFailed"))
    }
  }

  async function onCloseDirectory(targetDirectory: string) {
    try {
      await closeOpenProject(targetDirectory)
    } catch {
      toast.error(language.t("routes.settings.closeNotebookFailed"))
    }
  }

  return (
    <div
      data-component="settings-route"
      className="h-full w-full overflow-hidden bg-surface-raised-base"
    >
      <ResizablePanelGroup orientation="horizontal" className="h-full w-full min-w-0">
        <ResizablePanel
          id="settings-sidebar"
          panelRef={leftSidebarPanelRef}
          defaultSize={leftSidebarWidth}
          minSize={SETTINGS_SIDEBAR_MIN_WIDTH_PX}
          maxSize={leftSidebarMaxWidth}
          className="relative flex min-h-0 min-w-0 overflow-hidden"
        >
          <ChatLeftSidebar
            directories={openProjects}
            currentDirectory={currentDirectory}
            sessionsByDirectory={sessionsByDirectory}
            activeSessionID={activeSessionID}
            sessionStatusByDirectory={sessionStatusByDirectory}
            pinnedByDirectory={pinnedByDirectory}
            unreadByDirectory={unreadByDirectory}
            onOpenDirectory={() => void onOpenDirectory()}
            onNewSession={(targetDirectory) => void onNewSession(targetDirectory)}
            onSelectSession={(targetDirectory, targetSessionID) =>
              void onSelectSession(targetDirectory, targetSessionID)
            }
            onTogglePin={(targetDirectory, targetSessionID) =>
              togglePinned(targetDirectory, targetSessionID)
            }
            onToggleUnread={onToggleUnread}
            onArchiveSession={onArchiveSession}
            onRenameSession={onRenameSession}
            onReorderDirectories={(nextOrder) => void reorderOpenProjects(nextOrder)}
            onCloseDirectory={(targetDirectory) => void onCloseDirectory(targetDirectory)}
            onOpenCurriculum={() => {
              if (currentDirectory) openChat(currentDirectory)
            }}
            onOpenSettings={() => undefined}
            footer={null}
            className="h-full w-full"
          >
            <SettingsNavContent
              activeTab={tab}
              mainTabs={mainTabs}
              optionalTabs={optionalTabs}
              onTabChange={(nextTab) => {
                navigate({ to: "/settings", search: { tab: nextTab } })
              }}
              onBack={() => {
                if (currentDirectory) {
                  openChat(currentDirectory)
                  return
                }
                navigate({ to: "/chat" })
              }}
            />
          </ChatLeftSidebar>
          <ResizeHandle
            direction="horizontal"
            size={leftSidebarWidth}
            min={SETTINGS_SIDEBAR_MIN_WIDTH_PX}
            max={leftSidebarMaxWidth}
            onResize={(width) => {
              leftSidebarPanelRef.current?.resize(width)
              setLeftSidebarWidth(width)
            }}
          />
        </ResizablePanel>
        <ResizablePanel id="settings-main-pane" className="min-h-0 min-w-0">
          <main className="min-h-0 min-w-0 flex h-full flex-1 overflow-hidden bg-background-base/20">
            {currentDirectory ? (
              <SettingsPage directory={currentDirectory} activeTab={tab} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-weak">
                {language.t("routes.settings.emptyState")}
              </div>
            )}
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

function SettingsNavContent(props: {
  activeTab: SettingsTab
  mainTabs: SettingsTabDefinition[]
  optionalTabs: SettingsTabDefinition[]
  onTabChange: (tab: SettingsTab) => void
  onBack: () => void
}) {
  function renderTabButton(item: SettingsTabDefinition) {
    const active = props.activeTab === item.id

    return (
      <button
        key={item.id}
        type="button"
        data-action={`settings-tab-${item.id}`}
        data-active={active ? "true" : "false"}
        onClick={() => props.onTabChange(item.id)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg px-2 text-sm active:scale-[0.97] transition-[transform,color,background-color] duration-150 ease-out",
          active
            ? "bg-surface-raised-base-hover text-text-strong font-medium"
            : "text-text-base hover:bg-surface-raised-base-hover hover:text-text-strong",
        )}
      >
        <item.icon className="size-4" />
        {language.t(item.navLabelKey)}
      </button>
    )
  }

  return (
    <>
      <div className="mb-3 px-1">
        <Button
          data-action="settings-nav-back"
          type="button"
          variant="ghost"
          className="h-9 w-full justify-start rounded-lg px-2 text-sm font-medium text-text-base hover:bg-surface-raised-base-hover hover:text-text-strong active:scale-[0.97] transition-transform duration-150 ease-out"
          onClick={props.onBack}
        >
          <ArrowLeftIcon className="mr-2 size-4" />
          {language.t("routes.settings.backToChat")}
        </Button>
      </div>
      <div className="space-y-1">{props.mainTabs.map(renderTabButton)}</div>
      {props.optionalTabs.length > 0 ? (
        <div className="mt-4 space-y-3 px-1">
          <div className="space-y-2">
            <Separator />
            <p className="px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-text-weaker">
              {language.t("routes.settings.optionalFeatures")}
            </p>
          </div>
          <div className="space-y-1">{props.optionalTabs.map(renderTabButton)}</div>
        </div>
      ) : null}
    </>
  )
}
