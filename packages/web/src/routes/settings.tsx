import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"
import { Badge, Button, ResizeHandle, Separator, cn, toast } from "@buddy/ui"
import { ArrowLeftIcon } from "lucide-react"
import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import {
  DesktopTitlebar,
  MAC_WINDOW_CONTROL_INSET_WIDTH,
} from "@/components/layout/desktop-titlebar"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsPage } from "@/components/settings/settings-page"
import { useStandardsRuntime } from "@/components/settings/use-standards-runtime"
import {
  DEFAULT_SETTINGS_TAB,
  getVisibleSettingsTabDefinitions,
  resolveSettingsTab,
  settingsTabGroupForPrimaryUse,
  type SettingsTab,
  type SettingsTabDefinition,
} from "@/components/settings/settings-tabs"
import { encodeDirectory } from "../lib/directory-token"
import {
  closeOpenProject,
  openProject,
  reorderOpenProjects,
  selectSession,
  startNewSessionDraft,
  updateSession,
} from "@/state/chat-actions"
import {
  openProjectsWithSessionsQueryOptions,
  setOpenProjectsQueryData,
} from "@/state/bootstrap-query"
import { useChatStore } from "@/state/chat-store"
import {
  directoryChatQueryKeys,
  directorySessionsQueryOptions,
  removeDirectoryChatQueries,
  upsertDirectorySessionQueryData,
} from "@/state/directory-chat-query"
import { useShallow } from "zustand/react/shallow"
import { useUiPreferences } from "@/state/ui-preferences"
import { globalConfigQueryOptions } from "@/state/global-config-query"
import { readPersonalization } from "@/state/project-config-readers"
import { pickProjectDirectory } from "../lib/directory-picker"
import {
  readSettingsReturnTo,
  resolveSettingsReturnLocation,
  settingsSearchForTab,
  type SettingsSearch,
} from "@/lib/settings-navigation"
import {
  EXPERIMENTAL_FEATURE_ID,
  experimentalFeatureIsEnabled,
  experimentalFeaturesQueryOptions,
} from "@/state/experimental-features-query"

const SETTINGS_SIDEBAR_MIN_WIDTH_PX = 220
const SETTINGS_TITLEBAR_HEIGHT_PX = 40

function readSeededSessionList(directory: string) {
  const sessions = useChatStore.getState().directories[directory]?.sessions
  return sessions && sessions.length > 0 ? sessions : undefined
}

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    const tab = search.tab
    const returnTo = readSettingsReturnTo(search.returnTo)
    if (typeof tab === "string") {
      const resolvedTab = resolveSettingsTab(tab)
      if (resolvedTab) {
        return {
          tab: resolvedTab,
          ...(returnTo ? { returnTo } : {}),
        }
      }
    }
    return {
      tab: DEFAULT_SETTINGS_TAB,
      ...(returnTo ? { returnTo } : {}),
    }
  },
  loader: async ({ context }) => {
    await Promise.allSettled([
      context.queryClient.ensureQueryData(openProjectsWithSessionsQueryOptions()),
      context.queryClient.ensureQueryData(experimentalFeaturesQueryOptions()),
      context.queryClient.ensureQueryData(globalConfigQueryOptions()),
    ])
  },
  component: SettingsRoute,
})

function SettingsRoute() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { tab, returnTo } = useSearch({ from: "/settings" })
  const platform = usePlatform()
  const openProjects = useChatStore(useShallow((state) => state.openProjects))
  const activeDirectory = useChatStore((state) => state.activeDirectory)
  const directories = useChatStore(useShallow((state) => state.directories))
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const pinnedByDirectory = useUiPreferences((state) => state.pinnedByDirectory)
  const unreadByDirectory = useUiPreferences((state) => state.unreadByDirectory)
  const togglePinned = useUiPreferences((state) => state.togglePinned)
  const markUnread = useUiPreferences((state) => state.markUnread)
  const clearUnread = useUiPreferences((state) => state.clearUnread)
  const settingsSidebarWidth = useUiPreferences((state) => state.settingsSidebarWidth)
  const setSettingsSidebarWidth = useUiPreferences((state) => state.setSettingsSidebarWidth)
  const { standardsEnabled, standardsStatus } = useStandardsRuntime({
    open: true,
    platform: platform.platform,
  })
  const globalConfigQuery = useQuery(globalConfigQueryOptions())
  const primaryUse = readPersonalization(globalConfigQuery.data ?? {}).primaryUse
  const experimentalFeaturesQuery = useQuery(experimentalFeaturesQueryOptions())
  const enabledExperimentalFeatureIDs = useMemo(() => {
    const enabled = new Set<typeof EXPERIMENTAL_FEATURE_ID.learnerMemory>()
    if (
      experimentalFeatureIsEnabled(
        experimentalFeaturesQuery.data,
        EXPERIMENTAL_FEATURE_ID.learnerMemory,
      )
    ) {
      enabled.add(EXPERIMENTAL_FEATURE_ID.learnerMemory)
    }
    return enabled
  }, [experimentalFeaturesQuery.data])
  const isDesktop = platform.platform === "desktop"
  const isMac = isDesktop && platform.os === "macos"

  useQueries({
    queries: openProjects.map((directory) => ({
      ...directorySessionsQueryOptions(directory),
      initialData: () => readSeededSessionList(directory),
    })),
  })

  const currentDirectory = activeDirectory ?? openProjects[0] ?? ""
  const activeSessionID = currentDirectory ? directories[currentDirectory]?.sessionID : undefined
  const leftSidebarMaxWidth = 320
  const visibleTabs = useMemo(
    () =>
      getVisibleSettingsTabDefinitions({
        standardsEnabled,
        primaryUse,
        enabledExperimentalFeatureIDs,
      }),
    [enabledExperimentalFeatureIDs, primaryUse, standardsEnabled],
  )
  const mainTabs = useMemo(
    () =>
      visibleTabs.filter(
        (item) => settingsTabGroupForPrimaryUse(item, primaryUse) === "main",
      ),
    [primaryUse, visibleTabs],
  )
  const optionalTabs = useMemo(
    () =>
      visibleTabs.filter(
        (item) => settingsTabGroupForPrimaryUse(item, primaryUse) === "optional",
      ),
    [primaryUse, visibleTabs],
  )
  const visibleTabIDs = useMemo(() => new Set(visibleTabs.map((item) => item.id)), [visibleTabs])
  const activeTab = visibleTabIDs.has(tab)
    ? tab
    : tab === "standards" || tab === "learnerMemory"
      ? "advanced"
      : DEFAULT_SETTINGS_TAB

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
    if (globalConfigQuery.isPending) {
      return
    }
    if (tab !== "standards" && visibleTabIDs.has(tab)) {
      return
    }
    if (tab === "standards" && standardsStatus === null) {
      return
    }

    const fallbackTab =
      tab === "standards" || tab === "learnerMemory" ? "advanced" : DEFAULT_SETTINGS_TAB
    if (visibleTabIDs.has(tab)) {
      return
    }

    navigate({
      to: "/settings",
      search: (previous) => settingsSearchForTab(previous, fallbackTab),
      replace: true,
    })
  }, [globalConfigQuery.isPending, navigate, standardsStatus, tab, visibleTabIDs])

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
      setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
      setActiveDirectory(nextDirectory)
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
      await queryClient.refetchQueries({
        queryKey: directoryChatQueryKeys.sessions(targetDirectory),
        exact: true,
      })
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
      upsertDirectorySessionQueryData(queryClient, targetDirectory, updated)
      useChatStore.getState().applySessionUpdated(targetDirectory, updated)
    } catch {
      toast.error(language.t("routes.settings.renameThreadFailed"))
    }
  }

  async function onCloseDirectory(targetDirectory: string) {
    try {
      const closedDirectory = await closeOpenProject(targetDirectory)
      if (closedDirectory) {
        setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
        await removeDirectoryChatQueries(queryClient, closedDirectory)
      }
    } catch {
      toast.error(language.t("routes.settings.closeNotebookFailed"))
    }
  }

  return (
    <div
      data-component="settings-route"
      className={cn(
        "h-full w-full overflow-hidden bg-surface-raised-base transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none",
        isDesktop && "grid",
      )}
      style={
        isDesktop
          ? {
              gridTemplateColumns: `${settingsSidebarWidth}px minmax(0, 1fr)`,
              gridTemplateRows: `${SETTINGS_TITLEBAR_HEIGHT_PX}px minmax(0, 1fr)`,
            }
          : undefined
      }
    >
      {isDesktop && (
        <>
          {/* Row 1, Col 1: sidebar titlebar area */}
          <div className="relative col-start-1 row-start-1 select-none border-r border-border-weaker-base bg-surface-raised-base [-webkit-app-region:drag]">
            {isMac ? (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: MAC_WINDOW_CONTROL_INSET_WIDTH,
                  height: SETTINGS_TITLEBAR_HEIGHT_PX,
                }}
                className="[-webkit-app-region:no-drag]"
              />
            ) : null}
          </div>
          {/* Row 1, Col 2: main titlebar */}
          <div className="col-start-2 row-start-1 min-w-0">
            <DesktopTitlebar placement="settings" variant="shell" />
          </div>
        </>
      )}
      {/* Row 2, Col 1: sidebar */}
      <div
        className={cn(
          "min-h-0 min-w-0 overflow-hidden",
          isDesktop ? "col-start-1 row-start-2" : "h-full",
        )}
      >
        <div className="relative flex h-full min-h-0 overflow-hidden">
          <div className="h-full w-full min-w-0">
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
              onReorderDirectories={(nextOrder) => {
                void reorderOpenProjects(nextOrder)
                  .then((nextDirectories) => {
                    setOpenProjectsQueryData(queryClient, nextDirectories)
                  })
                  .catch(() => undefined)
              }}
              onCloseDirectory={(targetDirectory) => void onCloseDirectory(targetDirectory)}
              onOpenSettings={() => undefined}
              onOpenMcpSettings={() => {
                void navigate({
                  to: "/settings",
                  search: (previous) => settingsSearchForTab(previous, "mcps"),
                  replace: true,
                })
              }}
              showHeader={false}
              footer={null}
              className="h-full w-full"
            >
              <SettingsNavContent
                activeTab={activeTab}
                mainTabs={mainTabs}
                optionalTabs={optionalTabs}
                onTabChange={(nextTab) => {
                  navigate({
                    to: "/settings",
                    search: (previous) => settingsSearchForTab(previous, nextTab),
                    replace: true,
                  })
                }}
                onBack={() => {
                  void navigate({
                    href: resolveSettingsReturnLocation({
                      ...(returnTo ? { returnTo } : {}),
                      ...(currentDirectory ? { activeDirectory: currentDirectory } : {}),
                    }),
                    replace: true,
                  })
                }}
              />
            </ChatLeftSidebar>
          </div>
          <ResizeHandle
            direction="horizontal"
            size={settingsSidebarWidth}
            min={SETTINGS_SIDEBAR_MIN_WIDTH_PX}
            max={leftSidebarMaxWidth}
            onResize={setSettingsSidebarWidth}
          />
        </div>
      </div>

      {/* Row 2, Col 2: main content */}
      <div
        className={cn(
          "min-h-0 min-w-0 overflow-hidden bg-background-base",
          isDesktop ? "col-start-2 row-start-2" : "h-full",
        )}
      >
        <main className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background-base">
          <SettingsPage activeTab={activeTab} />
        </main>
      </div>
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
        {item.badgeLabelKey ? (
          <Badge variant="outline" className="ml-auto h-5 px-1.5 text-[10px] text-text-weaker">
            {language.t(item.badgeLabelKey)}
          </Badge>
        ) : null}
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
