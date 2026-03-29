import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { type OnboardingAuthChoice, OnboardingSetup } from "@/components/onboarding"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import {
  hasConnectedOpenAiProvider,
  resolveDesktopOnboardingAutoContinueDirectory,
  shouldShowCurrentDesktopOnboarding,
} from "@/lib/desktop-onboarding"
import { encodeDirectory } from "@/lib/directory-token"
import { normalizeDirectory, pickProjectDirectory } from "@/lib/directory-picker"
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
  beforeLoad: async () => {
    if (!(await shouldShowCurrentDesktopOnboarding())) {
      throw redirect({ to: "/chat" })
    }
  },
  component: OnboardingRoute,
})

function OnboardingRoute() {
  const navigate = useNavigate()
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
          const nextDirectory = resolveDesktopOnboardingAutoContinueDirectory({
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
  }, [markCompleted, navigate, setAuthChoice])

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
