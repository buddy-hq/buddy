import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import type { OnboardingAuthChoice } from "@/components/onboarding"
import {
  Aurora,
  AuthOverlay,
  EngineScreen,
  FINISH_EXPAND_DELAY_MS,
  FINISH_NAVIGATE_DELAY_MS,
  Finish,
  HeaderRail,
  Intro,
  LocationScreen,
  ModeScreen,
  SANS,
  SPACES,
  StyleTag,
  Sweep,
  THEMES,
  container,
  useFont,
  type CinematicOnboardingStep,
  type MoodKey,
} from "@/components/onboarding/cinematic"
import { language } from "@/context/language"
import { getPlatform, usePlatform } from "@/context/platform"
import {
  hasConnectedOpenAiProvider,
  shouldShowCurrentDesktopOnboarding,
} from "@/lib/desktop-onboarding"
import { encodeDirectory } from "@/lib/directory-token"
import { activateChatDirectory } from "@/lib/active-chat-transition-coordinator"
import { normalizeDirectory, pickProjectDirectory } from "@/lib/directory-picker"
import {
  ONBOARDING_TEST_SEARCH_VALUE,
  type OnboardingTestSearch,
  isOnboardingTestSearch,
} from "@/lib/onboarding-test-mode"
import {
  CINEMATIC_ONBOARDING_SCENE,
  activateDirectoryForOnboarding,
  configureNotebookForOnboarding,
  connectChatGptPlusForOnboarding,
  resolveCinematicOnboardingScene,
  shouldAutoContinueConnectedOpenAiOnboarding,
  shouldShowOnboardingPrimaryUseStep,
} from "@/lib/onboarding-flow"
import { applyOnboardingModelSelection } from "@/lib/onboarding-model-selection"
import {
  authorizeProviderOAuth,
  cancelProviderOAuth,
  completeProviderOAuth,
  formatProviderAuthError,
  reloadProviderRuntime,
} from "@/lib/provider-auth"
import {
  loadProviderCatalog,
  openInboxNotebook,
  patchGlobalConfig,
  saveNotebookHome,
  type NotebookHomeState,
} from "@/state/chat-actions"
import {
  notebookHomeAccessQueryOptions,
  openProjectsQueryOptions,
  providerCatalogSnapshotQueryOptions,
  setNotebookHomeQueryData,
  setOpenProjectsQueryData,
} from "@/state/bootstrap-query"
import { useChatStore } from "@/state/chat-store"
import type { ProviderCatalogState } from "@/state/chat-types"
import { useOnboardingStore } from "@/state/onboarding-store"
import {
  personalizationSettingsQueryOptions,
  setPersonalizationSettingsQueryData,
} from "@/state/personalization-settings-query"
import { refreshOpenAIModelAvailability } from "@/state/openai-usage-query"
import type { PrimaryUse } from "@/state/project-config-readers"

const EMPTY_PROVIDER_CATALOG_SNAPSHOT: ProviderCatalogState = {
  providers: [],
  default: {},
  openAIModelAvailability: {
    status: "not_connected",
  },
}
const DEFAULT_HOME_DIRECTORY = "~/Documents/Buddy"

type CinematicBrandStyle = CSSProperties & {
  "--brand-ring": string
  "--brand-ring2": string
  "--brand-soft": string
  "--brand-word": string
  "--brand-ink": string
  "--brand-bloom": string
}

export const Route = createFileRoute("/onboarding")({
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

    if (!(await shouldShowCurrentDesktopOnboarding())) {
      throw redirect({ to: "/chat" })
    }
  },
  loader: async ({ context }) => {
    await Promise.allSettled([
      context.queryClient.ensureQueryData(openProjectsQueryOptions()),
      context.queryClient.ensureQueryData(providerCatalogSnapshotQueryOptions()),
    ])
  },
  component: OnboardingRoute,
})

function OnboardingRoute() {
  useFont()
  const reduceMotion = useReducedMotion() === true
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const platform = usePlatform()
  const authChoice = useOnboardingStore((state) => state.authChoice)
  const setAuthChoice = useOnboardingStore((state) => state.setAuthChoice)
  const markSetupCompleted = useOnboardingStore((state) => state.markSetupCompleted)
  const providerCatalogSnapshotQuery = useQuery(providerCatalogSnapshotQueryOptions())
  const providerCatalogSnapshot =
    providerCatalogSnapshotQuery.data ?? EMPTY_PROVIDER_CATALOG_SNAPSHOT

  const [connectedAuthChoice, setConnectedAuthChoice] = useState<OnboardingAuthChoice | undefined>(
    undefined,
  )
  const [error, setError] = useState<string | undefined>(undefined)
  const [busyChoice, setBusyChoice] = useState<OnboardingAuthChoice | undefined>(undefined)
  const [folderBusy, setFolderBusy] = useState(false)
  const [showFolderRecovery, setShowFolderRecovery] = useState(false)
  const authAbortRef = useRef<AbortController | undefined>(undefined)
  const [showProviderSelectionStep, setShowProviderSelectionStep] = useState(false)
  const [showPrimaryUseStep, setShowPrimaryUseStep] = useState(true)
  const [primaryUseBusy, setPrimaryUseBusy] = useState(false)
  const [selectedPrimaryUse, setSelectedPrimaryUse] = useState<PrimaryUse | undefined>(undefined)
  const [introVisible, setIntroVisible] = useState(true)
  const [introComplete, setIntroComplete] = useState(false)
  const [hoverPrimaryUse, setHoverPrimaryUse] = useState<PrimaryUse | undefined>(undefined)
  const [selectedHomeDirectory, setSelectedHomeDirectory] = useState<string | undefined>(undefined)
  const [selectedCustomHome, setSelectedCustomHome] = useState(false)
  const [finishDestination, setFinishDestination] = useState<string | null | undefined>(undefined)
  const [finishExpanding, setFinishExpanding] = useState(false)
  const notebookHomeAccessQuery = useQuery({
    ...notebookHomeAccessQueryOptions(),
    enabled: Boolean(authChoice) && !showFolderRecovery,
  })
  const notebookHomeAccess = notebookHomeAccessQuery.data
  const autoContinueHandledRef = useRef(false)

  useEffect(
    () => () => {
      authAbortRef.current?.abort()
    },
    [],
  )

  useEffect(() => {
    if (finishDestination === undefined) return

    const expandTimer = window.setTimeout(() => {
      setFinishExpanding(true)
    }, FINISH_EXPAND_DELAY_MS)
    const navigateTimer = window.setTimeout(() => {
      const destination = finishDestination
      const navigation = destination
        ? navigate({
            to: "/$directory/chat",
            params: { directory: encodeDirectory(destination) },
            replace: true,
          })
        : navigate({ to: "/chat", replace: true })

      void navigation.catch((navigationError: unknown) => {
        setFinishDestination(undefined)
        setFinishExpanding(false)
        setError(
          navigationError instanceof Error ? navigationError.message : String(navigationError),
        )
      })
    }, FINISH_NAVIGATE_DELAY_MS)

    return () => {
      window.clearTimeout(expandTimer)
      window.clearTimeout(navigateTimer)
    }
  }, [finishDestination, navigate])

  useEffect(() => {
    let cancelled = false

    void queryClient
      .ensureQueryData(personalizationSettingsQueryOptions())
      .then((bundle) => {
        if (cancelled) {
          return
        }

        const storedPrimaryUse = bundle.personalization.primaryUse
        if (shouldShowOnboardingPrimaryUseStep(storedPrimaryUse)) {
          return
        }

        setSelectedPrimaryUse(storedPrimaryUse)
        setShowPrimaryUseStep(false)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [queryClient])

  useEffect(() => {
    if (showPrimaryUseStep) {
      return
    }

    const openAiConnected = hasConnectedOpenAiProvider(providerCatalogSnapshot)
    if (
      !shouldAutoContinueConnectedOpenAiOnboarding({
        showProviderSelectionStep,
        openAiConnected,
        alreadyHandled: autoContinueHandledRef.current,
      })
    ) {
      return
    }

    autoContinueHandledRef.current = true
    setConnectedAuthChoice("chatgpt_plus")
    setAuthChoice("chatgpt_plus")
  }, [providerCatalogSnapshot, setAuthChoice, showPrimaryUseStep, showProviderSelectionStep])

  async function handlePrimaryUseSelect(primaryUse: PrimaryUse) {
    setPrimaryUseBusy(true)
    setError(undefined)
    setSelectedPrimaryUse(primaryUse)

    try {
      const updatedGlobal = await patchGlobalConfig({
        personalization: {
          primary_use: primaryUse,
        },
      })
      setPersonalizationSettingsQueryData(queryClient, updatedGlobal)
      setShowPrimaryUseStep(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPrimaryUseBusy(false)
    }
  }

  async function completeSetupAndContinue(directory: string) {
    setShowProviderSelectionStep(false)
    setShowFolderRecovery(false)
    setError(undefined)

    const activated = await activateDirectoryForOnboarding({
      directory,
      activateDirectory: activateChatDirectory,
    })
    if (!activated) {
      return
    }

    markSetupCompleted()
    setFinishDestination(directory)
  }

  async function finalizeNotebookSelection(
    selectedAuthChoice: OnboardingAuthChoice | undefined,
    configuredHomeDirectory?: string,
  ) {
    if (!selectedAuthChoice) {
      setError(language.t("routes.onboarding.pickProviderFirst"))
      return
    }

    try {
      setFolderBusy(true)
      setError(undefined)
      let savedNotebookHome: NotebookHomeState | undefined

      const result = await configureNotebookForOnboarding({
        authChoice: selectedAuthChoice,
        prepareNotebook: async () => {
          if (configuredHomeDirectory) {
            savedNotebookHome = await saveNotebookHome(configuredHomeDirectory)
          }
          return openInboxNotebook()
        },
        loadProviderCatalog,
        refreshOpenAIModelAvailability,
      })
      setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
      if (savedNotebookHome) {
        setNotebookHomeQueryData(queryClient, savedNotebookHome)
      }

      applyOnboardingModelSelection(result)
      await completeSetupAndContinue(result.directory)
    } catch (err) {
      setShowFolderRecovery(true)
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

      setSelectedHomeDirectory(normalized)
      setSelectedCustomHome(true)
      await finalizeNotebookSelection(authChoice, normalized)
    } catch (err) {
      setError(
        formatProviderAuthError(err, language.t("routes.onboarding.initializeNotebookFailed")),
      )
    }
  }

  async function handleUseDefaultHome() {
    setShowFolderRecovery(false)
    const accessState = await queryClient.ensureQueryData(notebookHomeAccessQueryOptions())
    setSelectedHomeDirectory(accessState.defaultDirectory)
    setSelectedCustomHome(false)
    await finalizeNotebookSelection(authChoice, accessState.defaultDirectory)
  }

  async function handleChoose(choice: OnboardingAuthChoice) {
    setError(undefined)
    setShowFolderRecovery(false)

    if (choice === "free_models") {
      setAuthChoice(choice)
      setShowProviderSelectionStep(false)
      return
    }

    if (connectedAuthChoice === "chatgpt_plus") {
      setAuthChoice(choice)
      setShowProviderSelectionStep(false)
      return
    }

    setBusyChoice(choice)

    const abort = new AbortController()
    authAbortRef.current = abort

    try {
      await connectChatGptPlusForOnboarding({
        openLink: (url) => platform.openLink(url),
        loadProviderCatalogSnapshot: () =>
          queryClient.fetchQuery({
            ...providerCatalogSnapshotQueryOptions(),
            staleTime: 0,
          }),
        authorizeProviderOAuth,
        cancelProviderOAuth,
        completeProviderOAuth,
        reloadProviderRuntime: () => reloadProviderRuntime(),
        signal: abort.signal,
      })

      setConnectedAuthChoice(choice)
      setAuthChoice(choice)
      setShowProviderSelectionStep(false)
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
      if (authAbortRef.current === abort) {
        authAbortRef.current = undefined
      }
    }
  }

  const step: CinematicOnboardingStep = showPrimaryUseStep
    ? "mode"
    : showProviderSelectionStep || !authChoice
      ? "engine"
      : "location"
  const finished = finishDestination !== undefined
  const scene = resolveCinematicOnboardingScene({
    introVisible,
    introComplete,
    finished,
  })
  const showChrome = introComplete && !finished
  const moodKey: MoodKey = selectedPrimaryUse ?? hoverPrimaryUse ?? "neutral"
  const theme = THEMES.nocturne
  const space = SPACES["nebula-orion"]
  const homeDirectory =
    selectedHomeDirectory ?? notebookHomeAccess?.defaultDirectory ?? DEFAULT_HOME_DIRECTORY
  const cinematicStyle: CinematicBrandStyle = {
    background: space.bg,
    fontFamily: SANS,
    "--brand-ring": theme.ring,
    "--brand-ring2": theme.ring2,
    "--brand-soft": theme.soft,
    "--brand-word": theme.word,
    "--brand-ink": theme.ink,
    "--brand-bloom": theme.bloom,
  }

  function handleBack() {
    setError(undefined)
    setShowFolderRecovery(false)

    if (step === "location") {
      setShowProviderSelectionStep(true)
      return
    }

    if (step === "engine") {
      setShowPrimaryUseStep(true)
    }
  }

  return (
    <div
      className="relative flex h-screen w-full flex-col overflow-hidden text-[#ffffff]"
      style={cinematicStyle}
    >
      <Aurora
        mood={space.moods[moodKey]}
        bloom={finished && !reduceMotion}
        expanding={finishExpanding}
      />
      {!reduceMotion && (showChrome || finished) ? (
        <Sweep stepKey={finished ? "finished-nav" : step} />
      ) : null}

      <HeaderRail visible={showChrome} step={step} onBack={handleBack} />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-9 sm:px-14">
        <div className="w-full max-w-xl">
          <AnimatePresence
            mode="wait"
            onExitComplete={() => {
              if (!introVisible && !introComplete) {
                setIntroComplete(true)
              }
            }}
          >
            {scene === CINEMATIC_ONBOARDING_SCENE.intro ? (
              <Intro key="intro" onBegin={() => setIntroVisible(false)} />
            ) : scene === CINEMATIC_ONBOARDING_SCENE.introExit ? null : scene ===
              CINEMATIC_ONBOARDING_SCENE.finish ? (
              <Finish key="done" expanding={finishExpanding} />
            ) : (
              <motion.div
                key={step}
                variants={container}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                {step === "mode" ? (
                  <ModeScreen
                    value={selectedPrimaryUse}
                    busy={primaryUseBusy}
                    error={error}
                    onHover={setHoverPrimaryUse}
                    onSelect={(primaryUse) => {
                      void handlePrimaryUseSelect(primaryUse)
                    }}
                  />
                ) : null}
                {step === "engine" ? (
                  <EngineScreen
                    selected={authChoice}
                    busy={busyChoice !== undefined || folderBusy}
                    error={error}
                    onChooseChatGpt={() => {
                      void handleChoose("chatgpt_plus")
                    }}
                    onChooseFree={() => {
                      void handleChoose("free_models")
                    }}
                  />
                ) : null}
                {step === "location" ? (
                  <LocationScreen
                    homeDirectory={homeDirectory}
                    custom={selectedCustomHome}
                    busy={folderBusy}
                    error={error}
                    onUseDefault={() => {
                      void handleUseDefaultHome()
                    }}
                    onPickFolder={() => {
                      void handlePickFolder()
                    }}
                  />
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AuthOverlay
        open={busyChoice === "chatgpt_plus"}
        onCancel={() => authAbortRef.current?.abort()}
      />
      <StyleTag />
    </div>
  )
}
