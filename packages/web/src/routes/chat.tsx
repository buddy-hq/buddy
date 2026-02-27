import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { Button, Input } from "@buddy/ui"
import { usePlatform } from "../context/platform"
import { stringifyError } from "../lib/api-client"
import { encodeDirectory } from "../lib/directory-token"
import { pickProjectDirectory } from "../lib/directory-picker"
import { loadProjects, preloadProjectSessions, rememberProject } from "../state/chat-actions"
import { useChatStore } from "../state/chat-store"

export const Route = createFileRoute("/chat")({
  component: ChatEntryPage,
})

function ChatEntryPage() {
  const navigate = useNavigate()
  const platform = usePlatform()
  const projects = useChatStore((state) => state.projects)
  const activeDirectory = useChatStore((state) => state.activeDirectory)
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const [directory, setDirectory] = useState("")
  const [openError, setOpenError] = useState<string>()
  const hasNativePicker = typeof platform.openDirectoryPickerDialog === "function"

  const recents = useMemo(() => {
    if (!activeDirectory) return projects
    return [activeDirectory, ...projects.filter((item) => item !== activeDirectory)]
  }, [activeDirectory, projects])

  useEffect(() => {
    void loadProjects()
      .then((knownProjects) => preloadProjectSessions(knownProjects))
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

    setOpenError(undefined)

    try {
      const nextDirectory = await rememberProject(directory)
      setActiveDirectory(nextDirectory)
      navigate({
        to: "/$directory/chat",
        params: { directory: encodeDirectory(nextDirectory) },
      })
    } catch (error) {
      setOpenError(stringifyError(error))
    }
  }

  async function openPickedDirectory() {
    try {
      setOpenError(undefined)
      const picked = await pickProjectDirectory()
      if (!picked) return
      await openDirectory(picked)
    } catch (error) {
      setOpenError(stringifyError(error))
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <div className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Buddy</p>
        <h1 className="text-3xl font-semibold">Open project</h1>
        <p className="text-sm text-muted-foreground">OpenCode-style project and session workflow for Buddy.</p>
      </div>

      {hasNativePicker ? (
        <div className="mt-8 rounded-xl border bg-card p-4">
          <Button type="button" className="w-full" onClick={() => void openPickedDirectory()}>
            Choose folder
          </Button>
        </div>
      ) : (
        <form
          className="mt-8 rounded-xl border bg-card p-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void openDirectory(directory)
          }}
        >
          <Input
            value={directory}
            onChange={(event) => setDirectory(event.target.value)}
            placeholder="/absolute/path/to/repository"
          />
          <Button type="submit">Open</Button>
        </form>
      )}

      {openError ? (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {openError}
        </div>
      ) : null}

      {recents.length > 0 ? (
        <div className="mt-8 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Recent projects</p>
          </div>
          <div className="space-y-2">
            {recents.map((project) => (
              <button
                key={project}
                type="button"
                className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                onClick={() => void openDirectory(project)}
              >
                {project}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-12 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No projects yet. Open a repository directory to start.
        </div>
      )}
    </div>
  )
}
