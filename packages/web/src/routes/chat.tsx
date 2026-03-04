import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Button, Input, Card, CardContent } from "@buddy/ui"
import { FolderPlusIcon } from "@/components/layout/sidebar-icons"
import { usePlatform } from "../context/platform"
import buddyIcon from "../../public/buddy-icon.png"
import { stringifyError } from "../lib/api-client"
import { encodeDirectory } from "../lib/directory-token"
import { pickProjectDirectory } from "../lib/directory-picker"
import { loadOpenProjects, openProject, preloadProjectSessions } from "../state/chat-actions"
import { useChatStore } from "../state/chat-store"

export const Route = createFileRoute("/chat")({
  component: ChatEntryPage,
})

function ChatEntryPage() {
  const navigate = useNavigate()
  const activeDirectory = useChatStore((state) => state.activeDirectory)
  const entryError = useChatStore((state) => state.entryError)
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const setEntryError = useChatStore((state) => state.setEntryError)

  useEffect(() => {
    void loadOpenProjects()
      .then((knownOpenProjects) => preloadProjectSessions(knownOpenProjects))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!activeDirectory || activeDirectory === "/") return
    navigate({
      to: "/$directory/chat",
      params: { directory: encodeDirectory(activeDirectory) },
      replace: true,
    })
  }, [activeDirectory, navigate])

  async function openDirectory(value: string) {
    const directory = value.trim()
    if (!directory) return

    setEntryError(undefined)

    try {
      const nextDirectory = await openProject(directory)
      setActiveDirectory(nextDirectory)
      navigate({
        to: "/$directory/chat",
        params: { directory: encodeDirectory(nextDirectory) },
      })
    } catch (error) {
      setEntryError(stringifyError(error))
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <EmptyProjectsState onOpenDirectory={openDirectory} />

      {entryError ? (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {entryError}
        </div>
      ) : null}
    </div>
  )
}

type EmptyProjectsStateProps = {
  onOpenDirectory: (directory: string) => void
}

function EmptyProjectsState(props: EmptyProjectsStateProps) {
  const platform = usePlatform()
  const [directory, setDirectory] = useState("")
  const hasNativePicker = typeof platform.openDirectoryPickerDialog === "function"

  async function openPickedDirectory() {
    try {
      const picked = await pickProjectDirectory()
      if (!picked) return
      props.onOpenDirectory(picked)
    } catch {
      // Error handling is done in parent
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-20">
      <div className="flex flex-col items-center gap-6 text-center">
        <img src={buddyIcon} alt="Buddy" className="h-32 w-32 rounded-3xl shadow-xl" />
        <div className="space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">Buddy</h1>
          <p className="text-base text-muted-foreground">learn something new today</p>
        </div>
      </div>

      <Card className="w-full max-w-md border-dashed">
        <CardContent className="p-8">
          {hasNativePicker ? (
            <div className="flex flex-col items-center gap-4">
              <Button type="button" className="w-full" size="lg" onClick={() => void openPickedDirectory()}>
                <FolderPlusIcon className="mr-2 h-4 w-4" />
                choose a folder
              </Button>
              <span className="text-xs text-muted-foreground">to start your learning journey</span>
            </div>
          ) : (
            <form
              className="flex flex-col items-center gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                props.onOpenDirectory(directory)
              }}
            >
              <div className="flex w-full gap-3">
                <Input
                  value={directory}
                  onChange={(event) => setDirectory(event.target.value)}
                  placeholder="/path/to/your/project"
                  className="flex-1"
                />
                <Button type="submit">
                  <FolderPlusIcon className="mr-2 h-4 w-4" />
                  Open
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">to start your learning journey</span>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
