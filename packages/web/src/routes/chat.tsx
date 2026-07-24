import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { Button, Card, CardContent, Checkbox, Input, ScrollArea } from "@buddy/ui"
import { NotebookCreationDialog } from "@/components/layout/chat-left-sidebar/dialogs"
import { FolderOpenIcon, FolderPlusIcon, SparklesIcon } from "@/components/layout/sidebar-icons"
import { language } from "@/context/language"
import { getPlatform, usePlatform } from "@/context/platform"
import { globalConfigQueryOptions } from "@/state/global-config-query"
import {
  EXPERIMENTAL_FEATURE_ID,
  experimentalFeatureIsEnabled,
  experimentalFeaturesQueryOptions,
} from "@/state/experimental-features-query"
import {
  loadNotebookLearnerMemoryDefaults,
  resolveNotebookLearnerMemorySelection,
} from "@/state/learner-memory-settings"
import { bootstrapLearnerMemoryForNotebookBestEffort } from "@/lib/learner-memory"
import {
  activateChatDirectory,
  startActiveChatDraft,
} from "@/lib/active-chat-transition-coordinator"
import { resolveBuddyIconUrl } from "@/lib/static-asset"
import { buildWorkspaceRouteNavigation } from "@/lib/directory-workspace-controller"
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
  restoreOpenProjectRecovery,
  startFreshOpenProjectRecovery,
} from "../state/chat-actions"
import {
  notebookHomeQueryOptions,
  openProjectsRecoveryQueryOptions,
  openProjectsWithSessionsQueryOptions,
  setOpenProjectsQueryData,
} from "../state/bootstrap-query"
import { useChatStore } from "../state/chat-store"
import { readPersonalization } from "@/state/project-config-readers"

const ENTRY_ACTION = {
  QUICK_CHAT: "quick-chat",
  NEW_NOTEBOOK: "new-notebook",
  OPEN_EXISTING: "open-existing",
} as const
const EMPTY_RECOVERY_CANDIDATES: Array<{ directory: string; name: string }> = []

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
      context.queryClient.ensureQueryData(experimentalFeaturesQueryOptions()),
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
  const recoveryNeeded = useChatStore((state) => state.openProjectsRecovery?.needed === true)
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

  async function navigateToDirectory(
    directory: string,
    route: Parameters<typeof buildWorkspaceRouteNavigation>[0]["route"],
  ) {
    await navigate(buildWorkspaceRouteNavigation({ directory, route, replace: false }))
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
      const result = await activateChatDirectory({
        directory: nextDirectory,
        navigate: navigateToDirectory,
      })
      if (result.outcome === "failed") throw result.error
    })
  }

  async function quickChat() {
    await runEntryAction(ENTRY_ACTION.QUICK_CHAT, async () => {
      const inboxDirectory = await openInboxNotebook()
      setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
      const result = await startActiveChatDraft({
        directory: inboxDirectory,
        navigate: navigateToDirectory,
      })
      if (result.outcome === "failed") throw result.error
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
      const result = await startActiveChatDraft({
        directory: nextDirectory,
        navigate: navigateToDirectory,
      })
      if (result.outcome === "failed") throw result.error
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
      {recoveryNeeded ? (
        <OpenProjectsRecoveryState
          busyAction={busyAction}
          onOpenPickedDirectory={openPickedDirectory}
        />
      ) : (
        <EmptyProjectsState
          notebookHome={notebookHome}
          busyAction={busyAction}
          onOpenDirectory={openDirectory}
          onOpenPickedDirectory={openPickedDirectory}
          onQuickChat={quickChat}
          onCreateNotebook={createNotebook}
        />
      )}

      {entryError ? (
        <div className="mt-4 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base">
          {entryError}
        </div>
      ) : null}
    </div>
  )
}

type OpenProjectsRecoveryAction = "scan" | "restore" | "fresh"

type OpenProjectsRecoveryStateProps = {
  busyAction?: EntryAction
  onOpenPickedDirectory: () => void | Promise<void>
}

function OpenProjectsRecoveryState(props: OpenProjectsRecoveryStateProps) {
  const queryClient = useQueryClient()
  const [scanRequested, setScanRequested] = useState(false)
  const [selectedDirectories, setSelectedDirectories] = useState<Set<string>>(() => new Set())
  const [search, setSearch] = useState("")
  const [busyRecoveryAction, setBusyRecoveryAction] = useState<
    OpenProjectsRecoveryAction | undefined
  >(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const recoveryQuery = useQuery({
    ...openProjectsRecoveryQueryOptions(),
    enabled: false,
  })
  const candidates = recoveryQuery.data?.candidates ?? EMPTY_RECOVERY_CANDIDATES
  const candidateDirectories = useMemo(
    () => new Set(candidates.map((candidate) => candidate.directory)),
    [candidates],
  )
  const filteredCandidates = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return candidates
    return candidates.filter((candidate) =>
      `${candidate.name} ${candidate.directory}`.toLowerCase().includes(needle),
    )
  }, [candidates, search])
  const selectedCount = selectedDirectories.size
  const restoreDisabled =
    selectedCount === 0 ||
    busyRecoveryAction !== undefined ||
    props.busyAction !== undefined ||
    recoveryQuery.isFetching

  useEffect(() => {
    setSelectedDirectories((current) => {
      const next = new Set(
        Array.from(current).filter((directory) => candidateDirectories.has(directory)),
      )
      return next.size === current.size ? current : next
    })
  }, [candidateDirectories])

  function setDirectorySelected(directory: string, selected: boolean) {
    setSelectedDirectories((current) => {
      const next = new Set(current)
      if (selected) {
        next.add(directory)
      } else {
        next.delete(directory)
      }
      return next
    })
  }

  function selectFilteredCandidates() {
    setSelectedDirectories((current) => {
      const next = new Set(current)
      for (const candidate of filteredCandidates) {
        next.add(candidate.directory)
      }
      return next
    })
  }

  async function scanForNotebooks() {
    setError(undefined)
    setScanRequested(true)
    setBusyRecoveryAction("scan")
    try {
      const result = await recoveryQuery.refetch()
      if (result.error) {
        throw result.error
      }
    } catch (err) {
      setError(stringifyError(err))
    } finally {
      setBusyRecoveryAction(undefined)
    }
  }

  async function restoreSelected() {
    setError(undefined)
    setBusyRecoveryAction("restore")
    try {
      const directories = await restoreOpenProjectRecovery(Array.from(selectedDirectories))
      setOpenProjectsQueryData(queryClient, directories)
      queryClient.setQueryData(openProjectsRecoveryQueryOptions().queryKey, {
        needed: false,
        candidates: [],
      })
    } catch (err) {
      setError(stringifyError(err))
    } finally {
      setBusyRecoveryAction(undefined)
    }
  }

  async function startFresh() {
    setError(undefined)
    setBusyRecoveryAction("fresh")
    try {
      const directories = await startFreshOpenProjectRecovery()
      setOpenProjectsQueryData(queryClient, directories)
      queryClient.setQueryData(openProjectsRecoveryQueryOptions().queryKey, {
        needed: false,
        candidates: [],
      })
    } catch (err) {
      setError(stringifyError(err))
    } finally {
      setBusyRecoveryAction(undefined)
    }
  }

  return (
    <div
      data-component="chat-entry-recovery-state"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-8"
    >
      <div className="max-w-xl space-y-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          {language.t("routes.chat.recoveryTitle")}
        </h1>
        <p className="text-sm leading-6 text-text-weak">
          {language.t("routes.chat.recoveryDescription")}
        </p>
      </div>

      <Card className="w-full max-w-xl">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={busyRecoveryAction !== undefined || props.busyAction !== undefined}
              onClick={() => {
                void scanForNotebooks()
              }}
            >
              <FolderOpenIcon className="mr-2 size-4" />
              {busyRecoveryAction === "scan"
                ? language.t("routes.chat.recoveryScanning")
                : language.t("routes.chat.recoveryScan")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busyRecoveryAction !== undefined || props.busyAction !== undefined}
              onClick={() => {
                void props.onOpenPickedDirectory()
              }}
            >
              <FolderPlusIcon className="mr-2 size-4" />
              {language.t("routes.chat.recoveryOpenFolder")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busyRecoveryAction !== undefined || props.busyAction !== undefined}
              onClick={() => {
                void startFresh()
              }}
            >
              {busyRecoveryAction === "fresh"
                ? language.t("routes.chat.recoveryStartingFresh")
                : language.t("routes.chat.recoveryStartFresh")}
            </Button>
          </div>

          {scanRequested ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={language.t("routes.chat.recoverySearchPlaceholder")}
                  className="h-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={filteredCandidates.length === 0 || busyRecoveryAction !== undefined}
                  onClick={selectFilteredCandidates}
                >
                  {language.t("routes.chat.recoverySelectVisible")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={selectedCount === 0 || busyRecoveryAction !== undefined}
                  onClick={() => setSelectedDirectories(new Set())}
                >
                  {language.t("routes.chat.recoveryClear")}
                </Button>
              </div>

              <div className="rounded-md border border-border-base">
                <ScrollArea className="h-64" fillContentWidth>
                  <div className="divide-y divide-border-base">
                    {recoveryQuery.isFetching ? (
                      <div className="px-3 py-8 text-center text-sm text-text-weak">
                        {language.t("routes.chat.recoveryScanning")}
                      </div>
                    ) : filteredCandidates.length > 0 ? (
                      filteredCandidates.map((candidate) => {
                        const checked = selectedDirectories.has(candidate.directory)
                        return (
                          <label
                            key={candidate.directory}
                            className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-hover-base"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) =>
                                setDirectorySelected(candidate.directory, value === true)
                              }
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-text-base">
                                {candidate.name}
                              </span>
                              <span className="block truncate text-xs text-text-weaker">
                                {candidate.directory}
                              </span>
                            </span>
                          </label>
                        )
                      })
                    ) : (
                      <div className="px-3 py-8 text-center text-sm text-text-weak">
                        {language.t("routes.chat.recoveryNoCandidates")}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-text-weak">
                  {language.t("routes.chat.recoverySelectionCount", {
                    selected: String(selectedCount),
                    total: String(candidates.length),
                  })}
                </p>
                <Button
                  type="button"
                  disabled={restoreDisabled}
                  onClick={() => {
                    void restoreSelected()
                  }}
                >
                  {busyRecoveryAction === "restore"
                    ? language.t("routes.chat.recoveryRestoring")
                    : language.t("routes.chat.recoveryRestoreSelected")}
                </Button>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>
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
  const queryClient = useQueryClient()
  const buddyIconUrl = resolveBuddyIconUrl()
  const [directory, setDirectory] = useState("")
  const [notebookName, setNotebookName] = useState("")
  const [notebookDialogOpen, setNotebookDialogOpen] = useState(false)
  const [learnerMemoryEnabled, setLearnerMemoryEnabled] = useState(true)
  const [autoExtractEnabled, setAutoExtractEnabled] = useState(true)
  const globalConfigQuery = useQuery(globalConfigQueryOptions())
  const experimentalFeaturesQuery = useQuery(experimentalFeaturesQueryOptions())
  const learnerMemoryExperimentEnabled = experimentalFeatureIsEnabled(
    experimentalFeaturesQuery.data,
    EXPERIMENTAL_FEATURE_ID.learnerMemory,
  )
  const hasNativePicker = typeof platform.openDirectoryPickerDialog === "function"
  const learnerMemoryDefaults = resolveNotebookLearnerMemorySelection(
    globalConfigQuery.data ?? {},
    {},
  )
  const primaryUse = readPersonalization(globalConfigQuery.data ?? {}).primaryUse

  async function resetNotebookCreationDefaults() {
    try {
      const defaults = await loadNotebookLearnerMemoryDefaults(queryClient)
      setLearnerMemoryEnabled(defaults.enabled)
      setAutoExtractEnabled(defaults.autoExtract)
      return
    } catch {
      if (!globalConfigQuery.data) {
        return
      }
    }

    setLearnerMemoryEnabled(learnerMemoryDefaults.enabled)
    setAutoExtractEnabled(learnerMemoryDefaults.autoExtract)
  }

  async function openNotebookDialog() {
    setNotebookName(language.t("sidebar.newNotebookDefaultName"))
    await resetNotebookCreationDefaults()
    setNotebookDialogOpen(true)
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
        <div className="space-y-2">
          <h1 className="text-5xl font-bold tracking-tight">
            {language.t("routes.chat.productName")}
          </h1>
          <p className="text-base text-text-weak">
            {primaryUse === "teach"
              ? language.t("routes.chat.taglineTeach")
              : language.t("routes.chat.tagline")}
          </p>
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
              void openNotebookDialog()
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

          <p className="pt-1 text-xs text-text-weak">
            {primaryUse === "teach"
              ? language.t("routes.chat.startJourneyTeach")
              : language.t("routes.chat.startJourney")}
          </p>
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
            void resetNotebookCreationDefaults()
          }
        }}
        onNotebookNameChange={setNotebookName}
        onCreate={() => {
          void props.onCreateNotebook(notebookName, learnerMemoryEnabled, autoExtractEnabled)
        }}
        enableLearnerMemory={learnerMemoryExperimentEnabled ? learnerMemoryEnabled : undefined}
        onLearnerMemoryChange={setLearnerMemoryEnabled}
        enableAutoExtract={learnerMemoryExperimentEnabled ? autoExtractEnabled : undefined}
        onAutoExtractChange={setAutoExtractEnabled}
      />
    </div>
  )
}
