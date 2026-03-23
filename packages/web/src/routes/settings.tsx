import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import { useEffect, useMemo } from "react"
import { Button, cn, toast } from "@buddy/ui"
import {
  ArrowLeftIcon,
  BlocksIcon,
  BookOpenIcon,
  BrainIcon,
  CogIcon,
  FileTextIcon,
  PaletteIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react"
import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import { ResizeHandle } from "@/components/layout/resize-handle"
import { SettingsPage } from "@/components/settings/settings-page"
import type { SettingsTab } from "@/components/settings/settings-primitives"
import { encodeDirectory } from "../lib/directory-token"
import {
  bootstrapOpenProjects,
  closeOpenProject,
  openProject,
  preloadProjectSessions,
  reorderOpenProjects,
  selectSession,
  startNewSession,
  updateSession,
} from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import { useUiPreferences } from "@/state/ui-preferences"
import { pickProjectDirectory } from "../lib/directory-picker"

const VALID_TABS: SettingsTab[] = [
  "instructions",
  "appearance",
  "notebook",
  "model",
  "providers",
  "mcps",
  "skills",
  "advanced",
]

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): { tab: SettingsTab } => {
    const tab = search.tab
    if (typeof tab === "string" && (VALID_TABS as string[]).includes(tab)) {
      return { tab: tab as SettingsTab }
    }
    return { tab: "instructions" }
  },
  component: SettingsRoute,
})

function SettingsRoute() {
  const navigate = useNavigate()
  const { tab } = useSearch({ from: "/settings" })
  const openProjects = useChatStore((state) => state.openProjects)
  const activeDirectory = useChatStore((state) => state.activeDirectory)
  const directories = useChatStore((state) => state.directories)
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const pinnedByDirectory = useUiPreferences((state) => state.pinnedByDirectory)
  const unreadByDirectory = useUiPreferences((state) => state.unreadByDirectory)
  const togglePinned = useUiPreferences((state) => state.togglePinned)
  const markUnread = useUiPreferences((state) => state.markUnread)
  const clearUnread = useUiPreferences((state) => state.clearUnread)
  const leftSidebarWidth = useUiPreferences((state) => state.leftSidebarWidth)
  const setLeftSidebarWidth = useUiPreferences((state) => state.setLeftSidebarWidth)

  const currentDirectory = activeDirectory ?? openProjects[0] ?? ""
  const activeSessionID = currentDirectory ? directories[currentDirectory]?.sessionID : undefined

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
      toast.error("Couldn't open that notebook. Try again.")
    }
  }

  async function onNewSession(targetDirectory?: string) {
    const nextDirectory = targetDirectory || currentDirectory
    if (!nextDirectory) return
    setActiveDirectory(nextDirectory)
    try {
      await startNewSession(nextDirectory)
      openChat(nextDirectory)
    } catch {
      toast.error("Couldn't start a new thread. Try again.")
    }
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
      toast.error("Couldn't open that thread. Try again.")
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
      toast.error("Couldn't archive that thread. Try again.")
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
      toast.error("Couldn't rename that thread. Try again.")
    }
  }

  async function onCloseDirectory(targetDirectory: string) {
    try {
      await closeOpenProject(targetDirectory)
    } catch {
      toast.error("Couldn't close that notebook. Try again.")
    }
  }

  return (
    <div className="h-full w-full overflow-hidden bg-card">
      <div className="flex h-full w-full min-w-0">
        <div
          className="relative min-h-0 shrink-0 overflow-hidden"
          style={{ width: leftSidebarWidth }}
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
            min={244}
            max={typeof window === "undefined" ? 1000 : window.innerWidth * 0.3 + 64}
            onResize={setLeftSidebarWidth}
          />
        </div>
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background/20">
          {currentDirectory ? (
            <SettingsPage directory={currentDirectory} activeTab={tab} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Open a notebook to configure settings.
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

const NAV_ITEMS: {
  tab: SettingsTab
  label: string
  icon: typeof FileTextIcon
}[] = [
  { tab: "instructions", label: "Instructions", icon: FileTextIcon },
  { tab: "appearance", label: "Appearance", icon: PaletteIcon },
  { tab: "notebook", label: "Notebook", icon: BookOpenIcon },
  { tab: "model", label: "Model", icon: BrainIcon },
  { tab: "providers", label: "Providers", icon: SettingsIcon },
  { tab: "mcps", label: "MCPs", icon: BlocksIcon },
  { tab: "skills", label: "Skills", icon: SparklesIcon },
  { tab: "advanced", label: "Advanced", icon: CogIcon },
]

function SettingsNavContent(props: {
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
  onBack: () => void
}) {
  return (
    <>
      <div className="mb-3 px-1">
        <Button
          type="button"
          variant="ghost"
          className="h-9 w-full justify-start rounded-lg px-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={props.onBack}
        >
          <ArrowLeftIcon className="mr-2 size-4" />
          Back to chat
        </Button>
      </div>
      <div className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = props.activeTab === item.tab
          return (
            <button
              key={item.tab}
              type="button"
              onClick={() => props.onTabChange(item.tab)}
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-lg px-2 text-sm",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          )
        })}
      </div>
    </>
  )
}
