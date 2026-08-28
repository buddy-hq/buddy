import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"
import { z } from "zod"
import { Badge, Button, ResizeHandle, Separator, cn, toast } from "@buddy/ui"
import { ArrowLeftIcon } from "@/icons/app-icons"
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
  getSettingsTabFallback,
  getVisibleSettingsTabDefinitions,
  isCoreSettingsTab,
  resolveSettingsTab,
  type SettingsTab,
  type SettingsTabDefinition,
} from "@/components/settings/settings-tabs"
import { closeOpenProject, openProject, reorderOpenProjects } from "@/state/chat-actions"
import {
  activateChatDirectory,
  selectActiveChatSession,
  startActiveChatDraft,
} from "@/lib/active-chat-transition-coordinator"
import {
  openProjectsWithSessionsQueryOptions,
  setOpenProjectsQueryData,
} from "@/state/bootstrap-query"
import { useChatStore } from "@/state/chat-store"
import {
  directorySessionsQueryOptions,
  removeDirectoryChatQueries,
} from "@/state/directory-chat-query"
import { useShallow } from "zustand/react/shallow"
import { useUiPreferences } from "@/state/ui-preferences"
import { globalConfigQueryOptions } from "@/state/global-config-query"
import { readPersonalization } from "@/state/project-config-readers"
import { pickProjectDirectory } from "../lib/directory-picker"
import { buildWorkspaceRouteNavigation } from "@/lib/directory-workspace-controller"
import {
  LEFT_SIDEBAR_MIN_WIDTH_PX,
  resolveLeftSidebarMaxWidth,
  resolveLeftSidebarWidth,
} from "@/lib/directory-chat/left-sidebar-layout"
import { useViewportWidth } from "@/lib/use-viewport-width"
import {
  archiveSessionFromList,
  deleteSessionFromList,
  renameSessionInList,
} from "@/lib/session-list-actions"
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

const SETTINGS_TITLEBAR_HEIGHT_PX = 40
const STANDARDS_SETTINGS_TAB: SettingsTab = "standards"

type TIncomingSearchValue = string | number | boolean
type TIncomingSearch = {
  readonly [key: string]: TIncomingSearchValue | readonly TIncomingSearchValue[] | undefined
}

function parseTSearchString<T>(value: T): string | undefined {
  const parsed = z.string().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function readSeededSessionList(directory: string) {
  const sessions = useChatStore.getState().directories[directory]?.sessions
  return sessions && sessions.length > 0 ? sessions : undefined
}

export const Route = createFileRoute("/settings")({
  validateSearch: (search: TIncomingSearch): SettingsSearch => {
    const tab = parseTSearchString(search.tab)
    const returnTo = readSettingsReturnTo(search.returnTo)
    if (tab !== undefined) {
      const resolvedTab = resolveSettingsTab(tab)
      if (resolvedTab) {
        return Object.assign({ tab: resolvedTab }, returnTo ? { returnTo } : undefined)
      }
    }
    return Object.assign({ tab: DEFAULT_SETTINGS_TAB }, returnTo ? { returnTo } : undefined)
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
  const pinnedByDirectory = useUiPreferences((state) => state.pinnedByDirectory)
  const unreadByDirectory = useUiPreferences((state) => state.unreadByDirectory)
  const togglePinned = useUiPreferences((state) => state.togglePinned)
  const markUnread = useUiPreferences((state) => state.markUnread)
  const clearUnread = useUiPreferences((state) => state.clearUnread)
  const storedSettingsSidebarWidth = useUiPreferences((state) => state.settingsSidebarWidth)
  const setSettingsSidebarWidth = useUiPreferences((state) => state.setSettingsSidebarWidth)
  const viewportWidth = useViewportWidth()
  const settingsSidebarWidth = resolveLeftSidebarWidth({
    widthPx: storedSettingsSidebarWidth,
    viewportWidthPx: viewportWidth,
  })
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
  const { standardsEnabled, standardsStatus } = useStandardsRuntime({
    open: true,
    platform: platform.platform,
  })
  const globalConfigQuery = useQuery(globalConfigQueryOptions())
  const primaryUse = readPersonalization(globalConfigQuery.data ?? {}).primaryUse
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
  const leftSidebarMaxWidth = resolveLeftSidebarMaxWidth(viewportWidth)
  const visibleTabs = useMemo(
    () =>
      getVisibleSettingsTabDefinitions({
        standardsEnabled,
        primaryUse,
        enabledExperimentalFeatureIDs,
      }),
    [enabledExperimentalFeatureIDs, primaryUse, standardsEnabled],
  )
  const coreTabs = useMemo(() => visibleTabs.filter(isCoreSettingsTab), [visibleTabs])
  const revealedTabs = useMemo(
    () => visibleTabs.filter((item) => !isCoreSettingsTab(item)),
    [visibleTabs],
  )
  const visibleTabIDs = useMemo(() => new Set(visibleTabs.map((item) => item.id)), [visibleTabs])
  const activeTab = visibleTabIDs.has(tab) ? tab : getSettingsTabFallback(tab)

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
    // Both queries feed tab visibility — experimental features reveal Memory, and the global
    // config carries the `primaryUse` that reveals Standards. Bouncing before either has data
    // would throw a reader off a tab that is about to become visible, and `replace` would take
    // the deep link with it.
    if (experimentalFeaturesQuery.isPending || globalConfigQuery.isPending) {
      return
    }
    if (visibleTabIDs.has(tab)) {
      return
    }
    // The standards runtime reports asynchronously; bouncing before it does would throw a reader
    // off a tab that is about to become visible.
    if (tab === STANDARDS_SETTINGS_TAB && standardsStatus === null) {
      return
    }
    navigate({
      to: "/settings",
      search: (previous) => settingsSearchForTab(previous, getSettingsTabFallback(tab)),
      replace: true,
    })
  }, [
    experimentalFeaturesQuery.isPending,
    globalConfigQuery.isPending,
    navigate,
    standardsStatus,
    tab,
    visibleTabIDs,
  ])

  async function openChat(
    directory: string,
    route: Parameters<typeof buildWorkspaceRouteNavigation>[0]["route"],
  ) {
    await navigate(buildWorkspaceRouteNavigation({ directory, route, replace: false }))
  }

  async function onOpenDirectory() {
    try {
      const picked = await pickProjectDirectory()
      if (!picked) return
      const nextDirectory = await openProject(picked)
      setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
      await activateChatDirectory({ directory: nextDirectory })
    } catch {
      toast.error(language.t("routes.settings.openNotebookFailed"))
    }
  }

  async function onNewSession(targetDirectory?: string) {
    const nextDirectory = targetDirectory || currentDirectory
    if (!nextDirectory) return
    const result = await startActiveChatDraft({
      directory: nextDirectory,
      navigate: openChat,
    })
    if (result.outcome === "failed") {
      toast.error(language.t("routes.settings.openThreadFailed"))
    }
  }

  async function onSelectSession(
    targetDirectory: string,
    targetSessionID?: string,
  ): Promise<boolean> {
    if (!targetDirectory) return false
    const result = targetSessionID
      ? await selectActiveChatSession({
          directory: targetDirectory,
          sessionID: targetSessionID,
          navigate: openChat,
        })
      : await activateChatDirectory({
          directory: targetDirectory,
          navigate: openChat,
        })
    if (result.outcome === "failed") {
      toast.error(language.t("routes.settings.openThreadFailed"))
    }
    return result.outcome === "committed" || result.outcome === "noop"
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
      await archiveSessionFromList({
        queryClient,
        directory: targetDirectory,
        sessionID: targetSessionID,
      })
    } catch {
      toast.error(language.t("routes.settings.archiveThreadFailed"))
    }
  }

  async function onDeleteSession(
    targetDirectory: string,
    targetSessionID: string,
  ): Promise<boolean> {
    if (!targetDirectory) return false
    try {
      return await deleteSessionFromList({
        queryClient,
        directory: targetDirectory,
        sessionID: targetSessionID,
      })
    } catch {
      toast.error(language.t("routes.settings.deleteThreadFailed"))
      return false
    }
  }

  async function onRenameSession(targetDirectory: string, targetSessionID: string, title: string) {
    if (!targetDirectory) return
    try {
      await renameSessionInList({
        queryClient,
        directory: targetDirectory,
        sessionID: targetSessionID,
        title,
      })
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
              onNewSession={(targetDirectory) => onNewSession(targetDirectory)}
              onSelectSession={(targetDirectory, targetSessionID) =>
                onSelectSession(targetDirectory, targetSessionID)
              }
              onTogglePin={(targetDirectory, targetSessionID) =>
                togglePinned(targetDirectory, targetSessionID)
              }
              onToggleUnread={onToggleUnread}
              onArchiveSession={onArchiveSession}
              onDeleteSession={onDeleteSession}
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
                coreTabs={coreTabs}
                revealedTabs={revealedTabs}
                onTabChange={(nextTab) => {
                  navigate({
                    to: "/settings",
                    search: (previous) => settingsSearchForTab(previous, nextTab),
                    replace: true,
                  })
                }}
                onBack={() => {
                  void navigate({
                    href: resolveSettingsReturnLocation(
                      Object.assign(
                        {},
                        returnTo ? { returnTo } : undefined,
                        currentDirectory ? { activeDirectory: currentDirectory } : undefined,
                      ),
                    ),
                    replace: true,
                  })
                }}
              />
            </ChatLeftSidebar>
          </div>
          <ResizeHandle
            direction="horizontal"
            size={settingsSidebarWidth}
            min={LEFT_SIDEBAR_MIN_WIDTH_PX}
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
          <SettingsPage
            activeTab={activeTab}
            onOpenTab={(nextTab) => {
              void navigate({
                to: "/settings",
                search: (previous) => settingsSearchForTab(previous, nextTab),
                replace: true,
              })
            }}
          />
        </main>
      </div>
    </div>
  )
}

function SettingsNavContent(props: {
  activeTab: SettingsTab
  coreTabs: SettingsTabDefinition[]
  revealedTabs: SettingsTabDefinition[]
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
      <div className="space-y-1">{props.coreTabs.map(renderTabButton)}</div>
      {props.revealedTabs.length > 0 ? (
        <div className="mt-4 space-y-3 px-1">
          <div className="space-y-2">
            <Separator />
            <p className="px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-text-weaker">
              {language.t("routes.settings.enabledFeatures")}
            </p>
          </div>
          <div className="space-y-1">{props.revealedTabs.map(renderTabButton)}</div>
        </div>
      ) : null}
    </>
  )
}
