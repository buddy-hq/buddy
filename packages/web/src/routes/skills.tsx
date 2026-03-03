import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo } from "react"
import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import { SkillsPage } from "@/components/skills/skills-page"
import {
  openProject,
  preloadProjectSessions,
  selectSession,
  startNewSession,
  updateSession,
} from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import { useUiPreferences } from "@/state/ui-preferences"
import { pickProjectDirectory } from "../lib/directory-picker"
import { encodeDirectory } from "../lib/directory-token"

export const Route = createFileRoute("/skills")({
  component: SkillsRoute,
})

function SkillsRoute() {
  const navigate = useNavigate()
  const openProjects = useChatStore((state) => state.openProjects)
  const activeDirectory = useChatStore((state) => state.activeDirectory)
  const directories = useChatStore((state) => state.directories)
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const pinnedByDirectory = useUiPreferences((state) => state.pinnedByDirectory)
  const unreadByDirectory = useUiPreferences((state) => state.unreadByDirectory)
  const togglePinned = useUiPreferences((state) => state.togglePinned)
  const markUnread = useUiPreferences((state) => state.markUnread)
  const clearUnread = useUiPreferences((state) => state.clearUnread)

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
        openProjects.map((directory) => [directory, directories[directory]?.sessionStatusByID ?? {}]),
      ),
    [directories, openProjects],
  )

  useEffect(() => {
    if (openProjects.length === 0) return
    void preloadProjectSessions(openProjects).catch(() => undefined)
  }, [openProjects])

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
      const alreadyOpen = openProjects.includes(nextDirectory)
      setActiveDirectory(nextDirectory)
      if (alreadyOpen) {
        await preloadProjectSessions([nextDirectory])
      }
    } catch {
      // project actions manage their own error state
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
      // project actions manage their own error state
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
      // project actions manage their own error state
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
      // project actions manage their own error state
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
      // project actions manage their own error state
    }
  }

  return (
    <div className="h-full w-full overflow-hidden bg-card">
      <div className="flex h-full w-full min-w-0">
        <ChatLeftSidebar
          directories={openProjects}
          currentDirectory={currentDirectory}
          sessionsByDirectory={sessionsByDirectory}
          activeSessionID={activeSessionID}
          sessionStatusByDirectory={sessionStatusByDirectory}
          pinnedByDirectory={pinnedByDirectory}
          unreadByDirectory={unreadByDirectory}
          onOpenDirectory={() => {
            void onOpenDirectory()
          }}
          onNewSession={(targetDirectory) => {
            void onNewSession(targetDirectory)
          }}
          onSelectSession={(targetDirectory, targetSessionID) => {
            void onSelectSession(targetDirectory, targetSessionID)
          }}
          onTogglePin={(targetDirectory, targetSessionID) => {
            togglePinned(targetDirectory, targetSessionID)
          }}
          onToggleUnread={onToggleUnread}
          onArchiveSession={onArchiveSession}
          onRenameSession={onRenameSession}
          onOpenCurriculum={() => {
            if (currentDirectory) {
              openChat(currentDirectory)
            }
          }}
          onOpenSkills={() => undefined}
          onOpenSettings={() => {
            if (currentDirectory) {
              openChat(currentDirectory)
              return
            }
            navigate({ to: "/chat" })
          }}
          activeFooterItem="skills"
          className="h-full w-[344px]"
        />

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background/20">
          <SkillsPage directory={currentDirectory || undefined} />
        </main>
      </div>
    </div>
  )
}
