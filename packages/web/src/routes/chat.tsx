import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Button, Card, CardContent, Input } from "@buddy/ui"
import { NotebookCreationDialog } from "@/components/layout/chat-left-sidebar/dialogs"
import { FolderOpenIcon, FolderPlusIcon, SparklesIcon } from "@/components/layout/sidebar-icons"
import { language } from "@/context/language"
import { getPlatform, usePlatform } from "@/context/platform"
import { bootstrapLearnerMemoryForNotebookBestEffort } from "@/lib/learner-memory"
import { resolveBuddyIconUrl } from "@/lib/static-asset"
import { stringifyError } from "../lib/api-client"
import { shouldShowCurrentDesktopOnboarding } from "../lib/desktop-onboarding"
import { encodeDirectory } from "../lib/directory-token"
import { pickProjectDirectory } from "../lib/directory-picker"
import {
  ONBOARDING_TEST_SEARCH_VALUE,
  type OnboardingTestSearch,
  isOnboardingTestSearch,
} from "../lib/onboarding-test-mode"
import {
  createManagedNotebook,
  type NotebookHomeState,
  openInboxNotebook,
  openProject,
  startNewSessionDraft,
} from "../state/chat-actions"
import {
  notebookHomeQueryOptions,
  openProjectsWithSessionsQueryOptions,
  setOpenProjectsQueryData,
} from "../state/bootstrap-query"
import { useChatStore } from "../state/chat-store"
import { useUiPreferences } from "../state/ui-preferences"

const ENTRY_ACTION = {
  QUICK_CHAT: "quick-chat",
  NEW_NOTEBOOK: "new-notebook",
  OPEN_EXISTING: "open-existing",
} as const

type EntryAction = (typeof ENTRY_ACTION)[keyof typeof ENTRY_ACTION]

export const Route = createFileRoute("/chat")({
  validateSearch: (search: Record<string, unknown>): OnboardingTestSearch => {
    if (search.test === ONBOARDING_TEST_SEARCH_VALUE) {
      return { test: ONBOARDING_TEST_SEARCH_VALUE }
    }

    return {}
  },
  beforeLoad: async ({ search }) => {
    if (
      import.meta.env.DEV &&
      getPlatform().platform === "desktop" &&
      isOnboardingTestSearch(search)
    ) {
      return
    }

    if (await shouldShowCurrentDesktopOnboarding()) {
      throw redirect({ to: "/onboarding" })
    }
  },
  loader: async ({ context }) => {
    await Promise.allSettled([
      context.queryClient.ensureQueryData(openProjectsWithSessionsQueryOptions()),
      context.queryClient.ensureQueryData(notebookHomeQueryOptions()),
    ])

    const activeDirectory = useChatStore.getState().activeDirectory
    if (activeDirectory && activeDirectory !== "/") {
      throw redirect({
        to: "/$directory/chat",
        params: { directory: encodeDirectory(activeDirectory) },
      })
    }
  },
  component: ChatEntryPage,
})

function ChatEntryPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const activeDirectory = useChatStore((state) => state.activeDirectory)
  const entryError = useChatStore((state) => state.entryError)
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const setEntryError = useChatStore((state) => state.setEntryError)
  const [busyAction, setBusyAction] = useState<EntryAction | undefined>(undefined)
  const notebookHomeQuery = useQuery(notebookHomeQueryOptions())
  const notebookHome = notebookHomeQuery.data

  useEffect(() => {
    if (!activeDirectory || activeDirectory === "/") return
    navigate({
      to: "/$directory/chat",
      params: { directory: encodeDirectory(activeDirectory) },
      replace: true,
    })
  }, [activeDirectory, navigate])

  function navigateToDirectory(directory: string) {
    setActiveDirectory(directory)
    navigate({
      to: "/$directory/chat",
      params: { directory: encodeDirectory(directory) },
    })
  }

  async function runEntryAction(action: EntryAction, task: () => Promise<void>) {
    setEntryError(undefined)
    setBusyAction(action)
    try {
      await task()
    } catch (error) {
      setEntryError(stringifyError(error))
    } finally {
      setBusyAction(undefined)
    }
  }

  async function openDirectory(value: string) {
    const directory = value.trim()
    if (!directory) return

    await runEntryAction(ENTRY_ACTION.OPEN_EXISTING, async () => {
      const nextDirectory = await openProject(directory)
      setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
      navigateToDirectory(nextDirectory)
    })
  }

  async function quickChat() {
    await runEntryAction(ENTRY_ACTION.QUICK_CHAT, async () => {
      const inboxDirectory = await openInboxNotebook()
      setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
      startNewSessionDraft(inboxDirectory)
      useUiPreferences.getState().setMainPaneTab("chat")
      navigateToDirectory(inboxDirectory)
    })
  }

  async function createNotebook(
    name: string,
    enableLearnerMemory?: boolean,
    enableAutoExtract?: boolean,
  ) {
    const trimmed = name.trim()
    if (!trimmed) return

    await runEntryAction(ENTRY_ACTION.NEW_NOTEBOOK, async () => {
      const nextDirectory = await createManagedNotebook(trimmed)
      setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
      startNewSessionDraft(nextDirectory)
      useUiPreferences.getState().setMainPaneTab("chat")
      navigateToDirectory(nextDirectory)
      void bootstrapLearnerMemoryForNotebookBestEffort({
        directory: nextDirectory,
        enabled: enableLearnerMemory,
        autoExtract: enableAutoExtract,
      })
    })
  }

  async function openPickedDirectory() {
    try {
      const picked = await pickProjectDirectory()
      if (!picked) return
      await openDirectory(picked)
    } catch (error) {
      setEntryError(stringifyError(error))
    }
  }

  return (
    <div data-component="chat-entry-page" className="mx-auto w-full max-w-2xl px-6 py-16">
      <EmptyProjectsState
        notebookHome={notebookHome}
        busyAction={busyAction}
        onOpenDirectory={openDirectory}
        onOpenPickedDirectory={openPickedDirectory}
        onQuickChat={quickChat}
        onCreateNotebook={createNotebook}
      />

      {entryError ? (
        <div className="mt-4 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base">
          {entryError}
        </div>
      ) : null}
    </div>
  )
}

type EmptyProjectsStateProps = {
  busyAction?: EntryAction
  notebookHome?: NotebookHomeState
  onOpenDirectory: (directory: string) => void | Promise<void>
  onOpenPickedDirectory: () => void | Promise<void>
  onQuickChat: () => void | Promise<void>
  onCreateNotebook: (
    name: string,
    enableLearnerMemory?: boolean,
    enableAutoExtract?: boolean,
  ) => void | Promise<void>
}

function EmptyProjectsState(props: EmptyProjectsStateProps) {
  const platform = usePlatform()
  const buddyIconUrl = resolveBuddyIconUrl()
  const [directory, setDirectory] = useState("")
  const [notebookName, setNotebookName] = useState("")
  const [notebookDialogOpen, setNotebookDialogOpen] = useState(false)
  const [learnerMemoryEnabled, setLearnerMemoryEnabled] = useState(true)
  const [autoExtractEnabled, setAutoExtractEnabled] = useState(true)
  const hasNativePicker = typeof platform.openDirectoryPickerDialog === "function"

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
        <div className="space-y-2">
          <h1 className="text-5xl font-bold tracking-tight">
            {language.t("routes.chat.productName")}
          </h1>
          <p className="text-base text-text-weak">{language.t("routes.chat.tagline")}</p>
          {props.notebookHome?.resolvedDirectory ? (
            <p className="text-xs text-text-weaker">
              {language.t("routes.chat.notebookHomeHint", {
                directory: props.notebookHome.resolvedDirectory,
              })}
            </p>
          ) : null}
        </div>
      </div>

      <Card className="w-full max-w-md border-dashed">
        <CardContent className="p-6 space-y-3">
          <Button
            type="button"
            data-action="entry-quick-chat"
            className="w-full justify-start"
            size="lg"
            disabled={props.busyAction !== undefined}
            onClick={() => {
              void props.onQuickChat()
            }}
          >
            <SparklesIcon className="mr-2 h-4 w-4" />
            {props.busyAction === ENTRY_ACTION.QUICK_CHAT
              ? language.t("routes.chat.quickChatBusy")
              : language.t("routes.chat.quickChat")}
          </Button>

          <Button
            type="button"
            data-action="entry-create-notebook"
            variant="outline"
            className="w-full justify-start"
            size="lg"
            disabled={props.busyAction !== undefined}
            onClick={() => {
              setNotebookName(language.t("sidebar.newNotebookDefaultName"))
              setNotebookDialogOpen(true)
            }}
          >
            <FolderPlusIcon className="mr-2 h-4 w-4" />
            {language.t("routes.chat.newNotebook")}
          </Button>

          {hasNativePicker ? (
            <Button
              type="button"
              data-action="entry-open-directory-picker"
              variant="outline"
              className="w-full justify-start"
              size="lg"
              disabled={props.busyAction !== undefined}
              onClick={() => {
                void props.onOpenPickedDirectory()
              }}
            >
              <FolderOpenIcon className="mr-2 h-4 w-4" />
              {props.busyAction === ENTRY_ACTION.OPEN_EXISTING
                ? language.t("routes.chat.openExistingBusy")
                : language.t("routes.chat.openExistingFolder")}
            </Button>
          ) : (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void props.onOpenDirectory(directory)
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
                <Button
                  data-action="entry-open-directory-submit"
                  type="submit"
                  variant="outline"
                  disabled={props.busyAction !== undefined}
                >
                  <FolderOpenIcon className="mr-2 h-4 w-4" />
                  {language.t("routes.chat.open")}
                </Button>
              </div>
            </form>
          )}

          <p className="pt-1 text-xs text-text-weak">{language.t("routes.chat.startJourney")}</p>
        </CardContent>
      </Card>

      <NotebookCreationDialog
        open={notebookDialogOpen}
        busy={props.busyAction === ENTRY_ACTION.NEW_NOTEBOOK}
        notebookName={notebookName}
        title={language.t("sidebar.newNotebookDialogTitle")}
        description={language.t("sidebar.newNotebookDialogDescription")}
        confirmLabel={language.t("sidebar.createNotebook")}
        placeholder={language.t("sidebar.newNotebookPlaceholder")}
        onOpenChange={(open) => {
          setNotebookDialogOpen(open)
          if (!open) {
            setNotebookName("")
            setLearnerMemoryEnabled(true)
            setAutoExtractEnabled(true)
          }
        }}
        onNotebookNameChange={setNotebookName}
        onCreate={() => {
          void props.onCreateNotebook(notebookName, learnerMemoryEnabled, autoExtractEnabled)
        }}
        enableLearnerMemory={learnerMemoryEnabled}
        onLearnerMemoryChange={setLearnerMemoryEnabled}
        enableAutoExtract={autoExtractEnabled}
        onAutoExtractChange={setAutoExtractEnabled}
      />
    </div>
  )
}
