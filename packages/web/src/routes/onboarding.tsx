import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import {
  OnboardingAuthChoiceStep,
  OnboardingFolderStep,
  OnboardingSplashStep,
  type OnboardingAuthChoice,
} from "@/components/onboarding"
import { usePlatform } from "@/context/platform"
import { shouldShowCurrentDesktopOnboarding } from "@/lib/desktop-onboarding"
import { encodeDirectory } from "@/lib/directory-token"
import { hasAbsolutePath, normalizeDirectory, pickProjectDirectory } from "@/lib/directory-picker"
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
  openProject,
  patchProjectConfig,
} from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import { useOnboardingStore } from "@/state/onboarding-store"

export const Route = createFileRoute("/onboarding")({
  beforeLoad: () => {
    if (!shouldShowCurrentDesktopOnboarding()) {
      throw redirect({ to: "/chat" })
    }
  },
  component: OnboardingRoute,
})

function OnboardingRoute() {
  const navigate = useNavigate()
  const platform = usePlatform()
  const phase = useOnboardingStore((state) => state.phase)
  const authChoice = useOnboardingStore((state) => state.authChoice)
  const resumeDirectory = useOnboardingStore((state) => state.resumeDirectory)
  const setPhase = useOnboardingStore((state) => state.setPhase)
  const setAuthChoice = useOnboardingStore((state) => state.setAuthChoice)
  const setResumeDirectory = useOnboardingStore((state) => state.setResumeDirectory)
  const markCompleted = useOnboardingStore((state) => state.markCompleted)
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const setSelectedModel = useChatStore((state) => state.setSelectedModel)

  const [directory, setDirectory] = useState(() => resumeDirectory ?? "")
  const [authError, setAuthError] = useState<string | undefined>(undefined)
  const [folderError, setFolderError] = useState<string | undefined>(undefined)
  const [busyChoice, setBusyChoice] = useState<OnboardingAuthChoice | undefined>(undefined)
  const [folderBusy, setFolderBusy] = useState(false)

  const activePhase = useMemo(() => {
    if (phase !== "folder") return phase
    return authChoice ? "folder" : "auth"
  }, [authChoice, phase])

  function updateDirectory(value: string) {
    setDirectory(value)
    const normalized = normalizeDirectory(value)
    setResumeDirectory(normalized || undefined)
    setFolderError(undefined)
  }

  async function handlePickFolder() {
    try {
      const picked = await pickProjectDirectory()
      if (!picked) return
      updateDirectory(picked)
    } catch (error) {
      setFolderError(formatProviderAuthError(error, "Failed to open the folder picker"))
    }
  }

  async function handleChoose(choice: OnboardingAuthChoice) {
    setAuthError(undefined)

    if (choice === "free_models") {
      setAuthChoice(choice)
      setPhase("folder")
      return
    }

    setBusyChoice(choice)

    try {
      await connectChatGptPlusForOnboarding({
        openLink: (url) => platform.openLink(url),
        loadProviderCatalogSnapshot,
        authorizeProviderOAuth,
        completeProviderOAuth,
        reloadProviderRuntime: () => reloadProviderRuntime(),
      })

      setAuthChoice(choice)
      setPhase("folder")
    } catch (error) {
      setAuthError(formatProviderAuthError(error, "ChatGPT Plus sign-in failed"))
      setPhase("auth")
    } finally {
      setBusyChoice(undefined)
    }
  }

  async function handleContinue() {
    const normalized = normalizeDirectory(directory)
    if (!normalized) {
      setFolderError("Choose a notebook folder to continue.")
      return
    }

    if (!hasAbsolutePath(normalized)) {
      setFolderError("Enter an absolute notebook path.")
      return
    }

    if (!authChoice) {
      setPhase("auth")
      setFolderError("Choose an account path before opening a notebook.")
      return
    }

    setFolderBusy(true)
    setFolderError(undefined)

    try {
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
    } catch (error) {
      setFolderError(formatProviderAuthError(error, "Failed to finish Buddy setup"))
    } finally {
      setFolderBusy(false)
    }
  }

  if (activePhase === "splash") {
    return (
      <OnboardingSplashStep
        onContinue={() => {
          setAuthError(undefined)
          setFolderError(undefined)
          setPhase("auth")
        }}
      />
    )
  }

  if (activePhase === "auth") {
    return (
      <OnboardingAuthChoiceStep
        onChoose={(choice) => {
          void handleChoose(choice)
        }}
        busyChoice={busyChoice}
        error={authError}
      />
    )
  }

  return (
    <OnboardingFolderStep
      directory={directory}
      onDirectoryChange={updateDirectory}
      onPickFolder={() => {
        void handlePickFolder()
      }}
      onContinue={() => {
        void handleContinue()
      }}
      onBack={() => {
        setFolderError(undefined)
        setPhase("auth")
      }}
      continueLabel={folderBusy ? "Opening Buddy..." : "Open Buddy"}
      canContinue={Boolean(directory.trim()) && !folderBusy}
      busy={folderBusy}
      error={folderError}
    />
  )
}
