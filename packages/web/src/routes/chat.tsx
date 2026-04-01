import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Button, Input, Card, CardContent } from "@buddy/ui"
import { FolderPlusIcon } from "@/components/layout/sidebar-icons"
import { language } from "@/context/language"
import { resolveBuddyIconUrl } from "@/lib/static-asset"
import { usePlatform } from "../context/platform"
import { stringifyError } from "../lib/api-client"
import { shouldShowCurrentDesktopOnboarding } from "../lib/desktop-onboarding"
import { encodeDirectory } from "../lib/directory-token"
import { pickProjectDirectory } from "../lib/directory-picker"
import { bootstrapOpenProjects, openProject } from "../state/chat-actions"
import { useChatStore } from "../state/chat-store"

export const Route = createFileRoute("/chat")({
  beforeLoad: async () => {
    if (await shouldShowCurrentDesktopOnboarding()) {
      throw redirect({ to: "/onboarding" })
    }
  },
  component: ChatEntryPage,
})

function ChatEntryPage() {
  const navigate = useNavigate()
  const activeDirectory = useChatStore((state) => state.activeDirectory)
  const entryError = useChatStore((state) => state.entryError)
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const setEntryError = useChatStore((state) => state.setEntryError)

  useEffect(() => {
    void bootstrapOpenProjects().catch(() => undefined)
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
    <div data-component="chat-entry-page" className="mx-auto w-full max-w-2xl px-6 py-16">
      <EmptyProjectsState onOpenDirectory={openDirectory} />

      {entryError ? (
        <div className="mt-4 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base">
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
  const buddyIconUrl = resolveBuddyIconUrl()
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
    <div
      data-component="chat-entry-empty-state"
      className="flex flex-col items-center justify-center min-h-[60vh] gap-20"
    >
      <div className="flex flex-col items-center gap-6 text-center">
        <img
          src={buddyIconUrl}
          alt={language.t("routes.chat.productName")}
          className="h-32 w-32 rounded-3xl shadow-xl"
        />
        <div className="space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">
            {language.t("routes.chat.productName")}
          </h1>
          <p className="text-base text-text-weak">{language.t("routes.chat.tagline")}</p>
        </div>
      </div>

      <Card className="w-full max-w-md border-dashed">
        <CardContent className="p-8">
          {hasNativePicker ? (
            <div className="flex flex-col items-center gap-4">
              <Button
                type="button"
                data-action="entry-open-directory-picker"
                className="w-full"
                size="lg"
                onClick={() => void openPickedDirectory()}
              >
                <FolderPlusIcon className="mr-2 h-4 w-4" />
                {language.t("routes.chat.chooseFolder")}
              </Button>
              <span className="text-xs text-text-weak">
                {language.t("routes.chat.startJourney")}
              </span>
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
                  data-action="entry-directory-input"
                  value={directory}
                  onChange={(event) => setDirectory(event.target.value)}
                  placeholder={language.t("routes.chat.pathPlaceholder")}
                  className="flex-1"
                />
                <Button data-action="entry-open-directory-submit" type="submit">
                  <FolderPlusIcon className="mr-2 h-4 w-4" />
                  {language.t("routes.chat.open")}
                </Button>
              </div>
              <span className="text-xs text-text-weak">
                {language.t("routes.chat.startJourney")}
              </span>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
