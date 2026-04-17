import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { type OnboardingAuthChoice, OnboardingSetup } from "@/components/onboarding"
import { language } from "@/context/language"
import { getPlatform, usePlatform } from "@/context/platform"
import {
  hasConnectedOpenAiProvider,
  resolveDesktopOnboardingAutoContinueDirectory,
  shouldShowCurrentDesktopOnboarding,
} from "@/lib/desktop-onboarding"
import { encodeDirectory } from "@/lib/directory-token"
import { normalizeDirectory, pickProjectDirectory } from "@/lib/directory-picker"
import {
  ONBOARDING_TEST_SEARCH_VALUE,
  type OnboardingTestSearch,
  isOnboardingTestSearch,
} from "@/lib/onboarding-test-mode"
import {
  authorizeProviderOAuth,
  completeProviderOAuth,
  formatProviderAuthError,
  reloadProviderRuntime,
} from "@/lib/provider-auth"
import { applyOnboardingModelSelection } from "@/lib/onboarding-model-selection"
import {
  configureNotebookForOnboarding,
  connectChatGptPlusForOnboarding,
} from "@/lib/onboarding-flow"
import {
  loadProviderCatalog,
  openInboxNotebook,
  saveNotebookHome,
  type NotebookHomeState,
} from "@/state/chat-actions"
import {
  bootstrapQueryKeys,
  notebookHomeQueryOptions,
  openProjectsQueryOptions,
  providerCatalogSnapshotQueryOptions,
  setNotebookHomeQueryData,
  setOpenProjectsQueryData,
} from "@/state/bootstrap-query"
import { useChatStore } from "@/state/chat-store"
import type { ProviderCatalogState } from "@/state/chat-types"
import { useOnboardingStore } from "@/state/onboarding-store"

const EMPTY_OPEN_PROJECTS: string[] = []
const EMPTY_PROVIDER_CATALOG_SNAPSHOT: ProviderCatalogState = {
  providers: [],
  default: {},
}
const EMPTY_NOTEBOOK_HOME_STATE: NotebookHomeState = {
  configuredDirectory: undefined,
  defaultDirectory: "",
  resolvedDirectory: "",
  inboxDirectory: "",
  inboxName: "Inbox",
}

export const Route = createFileRoute("/onboarding")({
  validateSearch: (search: Record<string, unknown>): OnboardingTestSearch => {
    const result: OnboardingTestSearch = {}

    if (search.test === ONBOARDING_TEST_SEARCH_VALUE) {
      result.test = ONBOARDING_TEST_SEARCH_VALUE
    }

    if (typeof search.returnTo === "string" && search.returnTo.length > 0) {
      result.returnTo = search.returnTo
    }

    return result
  },
  beforeLoad: async ({ search }) => {
    if (
      import.meta.env.DEV &&
      getPlatform().platform === "desktop" &&
      isOnboardingTestSearch(search)
    ) {
      return
    }

    if (!(await shouldShowCurrentDesktopOnboarding())) {
      throw redirect({ to: "/chat" })
    }
  },
  loader: async ({ context }) => {
    await Promise.allSettled([
      context.queryClient.ensureQueryData(openProjectsQueryOptions()),
      context.queryClient.ensureQueryData(providerCatalogSnapshotQueryOptions()),
      context.queryClient.ensureQueryData(notebookHomeQueryOptions()),
    ])
  },
  component: OnboardingRoute,
})

function OnboardingRoute() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { test } = useSearch({ from: "/onboarding" })
  const platform = usePlatform()
  const setAuthChoice = useOnboardingStore((state) => state.setAuthChoice)
  const setResumeDirectory = useOnboardingStore((state) => state.setResumeDirectory)
  const markCompleted = useOnboardingStore((state) => state.markCompleted)
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const openProjectsQuery = useQuery(openProjectsQueryOptions())
  const providerCatalogSnapshotQuery = useQuery(providerCatalogSnapshotQueryOptions())
  const notebookHomeQuery = useQuery(notebookHomeQueryOptions())
  const openProjects = openProjectsQuery.data ?? EMPTY_OPEN_PROJECTS
  const providerCatalogSnapshot =
    providerCatalogSnapshotQuery.data ?? EMPTY_PROVIDER_CATALOG_SNAPSHOT
  const notebookHome = notebookHomeQuery.data ?? EMPTY_NOTEBOOK_HOME_STATE

  const [authChoice, setLocalAuthChoice] = useState<OnboardingAuthChoice | undefined>(undefined)
  const [connectedAuthChoice, setConnectedAuthChoice] = useState<OnboardingAuthChoice | undefined>(
    undefined,
  )
  const [error, setError] = useState<string | undefined>(undefined)
  const [busyChoice, setBusyChoice] = useState<OnboardingAuthChoice | undefined>(undefined)
  const [folderBusy, setFolderBusy] = useState(false)
  const [authAbort, setAuthAbort] = useState<AbortController | undefined>(undefined)
  const defaultHomeDirectory = notebookHome.defaultDirectory
  const autoContinueHandledRef = useRef(false)

  useEffect(() => {
    if (autoContinueHandledRef.current) return

    const openAiConnected = hasConnectedOpenAiProvider(providerCatalogSnapshot)
    if (!openAiConnected) return

    autoContinueHandledRef.current = true

    const nextDirectory =
      test === ONBOARDING_TEST_SEARCH_VALUE
        ? undefined
        : resolveDesktopOnboardingAutoContinueDirectory({
            connectedOpenAiProvider: true,
            openProjects,
            activeDirectory: useChatStore.getState().activeDirectory,
          })

    if (nextDirectory) {
      markCompleted()
      navigate({
        to: "/$directory/chat",
        params: { directory: encodeDirectory(nextDirectory) },
        replace: true,
      })
      return
    }

    setConnectedAuthChoice("chatgpt_plus")
    setLocalAuthChoice("chatgpt_plus")
    setAuthChoice("chatgpt_plus")
  }, [markCompleted, navigate, openProjects, providerCatalogSnapshot, setAuthChoice, test])

  async function finalizeNotebookSelection(configuredHomeDirectory?: string) {
    if (!authChoice) {
      setError(language.t("routes.onboarding.pickProviderFirst"))
      return
    }

    try {
      setFolderBusy(true)
      setError(undefined)
      let savedNotebookHome: NotebookHomeState | undefined

      const result = await configureNotebookForOnboarding({
        authChoice,
        prepareNotebook: async () => {
          if (configuredHomeDirectory) {
            savedNotebookHome = await saveNotebookHome(configuredHomeDirectory)
          }
          return openInboxNotebook()
        },
        loadProviderCatalog,
      })
      setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
      if (savedNotebookHome) {
        setNotebookHomeQueryData(queryClient, savedNotebookHome)
      }
      await queryClient.invalidateQueries({
        queryKey: bootstrapQueryKeys.notebookHome(),
      })
      await queryClient.fetchQuery({
        ...notebookHomeQueryOptions(),
        staleTime: 0,
      })

      applyOnboardingModelSelection(result.directory, result.model)
      setResumeDirectory(result.directory)
      setActiveDirectory(result.directory)
      markCompleted()

      navigate({
        to: "/$directory/chat",
        params: { directory: encodeDirectory(result.directory) },
        replace: true,
      })
    } catch (err) {
      setError(
        formatProviderAuthError(err, language.t("routes.onboarding.initializeNotebookFailed")),
      )
    } finally {
      setFolderBusy(false)
    }
  }

  async function handlePickFolder() {
    try {
      const picked = await pickProjectDirectory()
      if (!picked) return

      const normalized = normalizeDirectory(picked)
      if (!normalized) return

      await finalizeNotebookSelection(normalized)
    } catch (err) {
      setError(
        formatProviderAuthError(err, language.t("routes.onboarding.initializeNotebookFailed")),
      )
    }
  }

  async function handleUseDefaultHome() {
    await finalizeNotebookSelection(defaultHomeDirectory)
  }

  async function handleChoose(choice: OnboardingAuthChoice) {
    setError(undefined)

    if (choice === "free_models") {
      setLocalAuthChoice(choice)
      setAuthChoice(choice)
      return
    }

    if (connectedAuthChoice === "chatgpt_plus") {
      setLocalAuthChoice(choice)
      setAuthChoice(choice)
      return
    }

    setBusyChoice(choice)

    const abort = new AbortController()
    setAuthAbort(abort)

    try {
      await Promise.race([
        connectChatGptPlusForOnboarding({
          openLink: (url) => platform.openLink(url),
          loadProviderCatalogSnapshot: () =>
            queryClient.fetchQuery({
              ...providerCatalogSnapshotQueryOptions(),
              staleTime: 0,
            }),
          authorizeProviderOAuth,
          completeProviderOAuth,
          reloadProviderRuntime: () => reloadProviderRuntime(),
        }),
        new Promise<void>((_, reject) => {
          abort.signal.addEventListener("abort", () =>
            reject(new Error(language.t("routes.onboarding.signInCancelled"))),
          )
        }),
      ])

      setLocalAuthChoice(choice)
      setConnectedAuthChoice(choice)
      setAuthChoice(choice)
    } catch (err) {
      if (!abort.signal.aborted) {
        abort.abort()
      }
      if (err instanceof Error && err.message === language.t("routes.onboarding.signInCancelled")) {
        return
      }
      setError(formatProviderAuthError(err, language.t("routes.onboarding.signInFailed")))
    } finally {
      setBusyChoice(undefined)
      setAuthAbort(undefined)
    }
  }

  return (
    <OnboardingSetup
      authChoice={authChoice}
      connectedAuthChoice={connectedAuthChoice}
      busyChoice={busyChoice}
      folderBusy={folderBusy}
      defaultHomeDirectory={defaultHomeDirectory}
      error={error}
      onChoose={handleChoose}
      onUseDefaultHome={() => {
        void handleUseDefaultHome()
      }}
      onPickFolder={() => {
        void handlePickFolder()
      }}
      onCancelAuth={() => {
        authAbort?.abort()
      }}
    />
  )
}
