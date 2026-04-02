import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router"
import { useEffect, useState } from "react"
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
import {
  configureNotebookForOnboarding,
  connectChatGptPlusForOnboarding,
} from "@/lib/onboarding-flow"
import {
  loadProviderCatalog,
  loadProviderCatalogSnapshot,
  loadOpenProjects,
  openProject,
  patchProjectConfig,
} from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import { useOnboardingStore } from "@/state/onboarding-store"

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
  component: OnboardingRoute,
})

function OnboardingRoute() {
  const navigate = useNavigate()
  const { test } = useSearch({ from: "/onboarding" })
  const platform = usePlatform()
  const setAuthChoice = useOnboardingStore((state) => state.setAuthChoice)
  const setResumeDirectory = useOnboardingStore((state) => state.setResumeDirectory)
  const markCompleted = useOnboardingStore((state) => state.markCompleted)
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const setSelectedModel = useChatStore((state) => state.setSelectedModel)

  const [authChoice, setLocalAuthChoice] = useState<OnboardingAuthChoice | undefined>(undefined)
  const [connectedAuthChoice, setConnectedAuthChoice] = useState<OnboardingAuthChoice | undefined>(
    undefined,
  )
  const [error, setError] = useState<string | undefined>(undefined)
  const [busyChoice, setBusyChoice] = useState<OnboardingAuthChoice | undefined>(undefined)
  const [folderBusy, setFolderBusy] = useState(false)
  const [authAbort, setAuthAbort] = useState<AbortController | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    void Promise.allSettled([loadOpenProjects(), loadProviderCatalogSnapshot()]).then(
      ([openProjectsResult, providersResult]) => {
        if (cancelled) return

        const openProjects =
          openProjectsResult.status === "fulfilled" ? openProjectsResult.value : []
        const openAiConnected =
          providersResult.status === "fulfilled" &&
          hasConnectedOpenAiProvider(providersResult.value)

        if (openAiConnected) {
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
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [markCompleted, navigate, setAuthChoice, test])

  async function handlePickFolder() {
    if (!authChoice) {
      setError(language.t("routes.onboarding.pickProviderFirst"))
      return
    }

    try {
      const picked = await pickProjectDirectory()
      if (!picked) return

      const normalized = normalizeDirectory(picked)
      if (!normalized) return

      setFolderBusy(true)
      setError(undefined)

      const result = await configureNotebookForOnboarding({
        authChoice,
        directory: normalized,
        openProject,
        loadProviderCatalog,
        patchProjectConfig,
      })

      setResumeDirectory(result.directory)
      setSelectedModel(result.directory, result.model)
      setActiveDirectory(result.directory)
      markCompleted()

      navigate({
        to: "/$directory/chat",
        params: { directory: encodeDirectory(result.directory) },
        replace: true,
      })
    } catch (err) {
      setError(formatProviderAuthError(err, language.t("routes.onboarding.openNotebookFailed")))
    } finally {
      setFolderBusy(false)
    }
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
          loadProviderCatalogSnapshot,
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
      error={error}
      onChoose={handleChoose}
      onPickFolder={() => {
        void handlePickFolder()
      }}
      onCancelAuth={() => {
        authAbort?.abort()
      }}
    />
  )
}
