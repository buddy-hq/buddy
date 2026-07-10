import { useForm } from "@tanstack/react-form"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router"
import { Button } from "@buddy/ui"
import { ArrowLeftIcon } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { useEffect, useRef, useState } from "react"
import {
  type OnboardingAuthChoice,
  OnboardingSetup,
  OnboardingHeader,
  PrimaryUseSelection,
} from "@/components/onboarding"
import { SharedPersonalizationFormFields } from "@/components/settings/shared-personalization-form"
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
  configureNotebookForOnboarding,
  connectChatGptPlusForOnboarding,
  shouldAutoContinueConnectedOpenAiOnboarding,
  shouldShowOnboardingPrimaryUseStep,
  shouldShowOnboardingPersonalizationStep,
  shouldResumeOnboardingPersonalization,
} from "@/lib/onboarding-flow"
import { applyOnboardingModelSelection } from "@/lib/onboarding-model-selection"
import {
  authorizeProviderOAuth,
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
import { setGlobalConfigQueryData } from "@/state/global-config-query"
import type { ProviderCatalogState } from "@/state/chat-types"
import { useOnboardingStore } from "@/state/onboarding-store"
import {
  personalizationSettingsQueryKeys,
  personalizationSettingsQueryOptions,
  type PersonalizationSettingsBundle,
} from "@/state/personalization-settings-query"
import {
  EMPTY_PERSONALIZATION_SETTINGS,
  buildPersonalizationPatch,
  type PrimaryUse,
  readPersonalization,
  shouldResetPersonalizationForm,
} from "@/state/project-config-readers"

const EMPTY_OPEN_PROJECTS: string[] = []
const EMPTY_PROVIDER_CATALOG_SNAPSHOT: ProviderCatalogState = {
  providers: [],
  default: {},
  openAIModelAvailability: {
    status: "not_connected",
  },
}
const EASE_OUT = [0.23, 1, 0.32, 1] as const
const TOTAL_ONBOARDING_STEPS = 4

function StepBadge({ current, total }: { current: number; total: number }) {
  return (
    <span className="text-xs font-medium text-text-weaker">
      {current} / {total}
    </span>
  )
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
    ])
  },
  component: OnboardingRoute,
})

function OnboardingRoute() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { test } = useSearch({ from: "/onboarding" })
  const platform = usePlatform()
  const authChoice = useOnboardingStore((state) => state.authChoice)
  const setAuthChoice = useOnboardingStore((state) => state.setAuthChoice)
  const markSetupCompleted = useOnboardingStore((state) => state.markSetupCompleted)
  const startPersonalizationVersion = useOnboardingStore(
    (state) => state.startPersonalizationVersion,
  )
  const markPersonalizationCompleted = useOnboardingStore(
    (state) => state.markPersonalizationCompleted,
  )
  const markPersonalizationSkipped = useOnboardingStore((state) => state.markPersonalizationSkipped)
  const onboardingPersonalizationDirectory = useOnboardingStore(
    (state) => state.personalizationDirectory,
  )
  const personalizationVersionActive = useOnboardingStore(
    (state) => state.activePersonalizationVersion,
  )
  const personalizationVersionCompleted = useOnboardingStore(
    (state) => state.personalizationVersionCompleted,
  )
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const openProjectsQuery = useQuery(openProjectsQueryOptions())
  const providerCatalogSnapshotQuery = useQuery(providerCatalogSnapshotQueryOptions())
  const openProjects = openProjectsQuery.data ?? EMPTY_OPEN_PROJECTS
  const providerCatalogSnapshot =
    providerCatalogSnapshotQuery.data ?? EMPTY_PROVIDER_CATALOG_SNAPSHOT

  const [connectedAuthChoice, setConnectedAuthChoice] = useState<OnboardingAuthChoice | undefined>(
    undefined,
  )
  const [error, setError] = useState<string | undefined>(undefined)
  const [busyChoice, setBusyChoice] = useState<OnboardingAuthChoice | undefined>(undefined)
  const [folderBusy, setFolderBusy] = useState(false)
  const [showFolderRecovery, setShowFolderRecovery] = useState(false)
  const [personalizationBusy, setPersonalizationBusy] = useState(false)
  const [personalizationExitPending, setPersonalizationExitPending] = useState(false)
  const [authAbort, setAuthAbort] = useState<AbortController | undefined>(undefined)
  const [showProviderSelectionStep, setShowProviderSelectionStep] = useState(false)
  const [showPrimaryUseStep, setShowPrimaryUseStep] = useState(true)
  const [primaryUseBusy, setPrimaryUseBusy] = useState(false)
  const [selectedPrimaryUse, setSelectedPrimaryUse] = useState<PrimaryUse | undefined>(undefined)
  const [personalizationDirectory, setPersonalizationDirectory] = useState<string | undefined>(
    undefined,
  )
  const notebookHomeAccessQuery = useQuery({
    ...notebookHomeAccessQueryOptions(),
    enabled: Boolean(authChoice) && !showFolderRecovery,
  })
  const notebookHomeAccess = notebookHomeAccessQuery.data
  const autoContinueHandledRef = useRef(false)
  const form = useForm({
    defaultValues: EMPTY_PERSONALIZATION_SETTINGS,
    onSubmit: async () => undefined,
  })
  const personalizationStepPending =
    personalizationVersionActive !== undefined &&
    personalizationVersionActive !== personalizationVersionCompleted
  const personalizationStepVisible = shouldShowOnboardingPersonalizationStep({
    personalizationStepPending,
    showProviderSelectionStep,
    exitPending: personalizationExitPending,
  })

  useEffect(() => {
    let cancelled = false

    void queryClient
      .ensureQueryData(personalizationSettingsQueryOptions())
      .then((bundle) => {
        if (cancelled) {
          return
        }

        const currentValues = form.state.values
        if (
          shouldResetPersonalizationForm({
            nextValues: currentValues,
            currentValues: bundle.personalization,
          })
        ) {
          form.reset(bundle.personalization)
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
  }, [form, queryClient])

  useEffect(() => {
    if (showPrimaryUseStep) {
      return
    }

    const openAiConnected = hasConnectedOpenAiProvider(providerCatalogSnapshot)
    if (
      !shouldAutoContinueConnectedOpenAiOnboarding({
        personalizationStepVisible,
        showProviderSelectionStep,
        openAiConnected,
        alreadyHandled: autoContinueHandledRef.current,
      })
    ) {
      return
    }

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
      markSetupCompleted()
      navigate({
        to: "/$directory/chat",
        params: { directory: encodeDirectory(nextDirectory) },
        replace: true,
      })
      return
    }

    setConnectedAuthChoice("chatgpt_plus")
    setAuthChoice("chatgpt_plus")
  }, [
    markSetupCompleted,
    navigate,
    openProjects,
    personalizationStepVisible,
    providerCatalogSnapshot,
    setAuthChoice,
    showPrimaryUseStep,
    showProviderSelectionStep,
    test,
  ])

  function navigateToDirectoryChat(directory: string) {
    return navigate({
      to: "/$directory/chat",
      params: { directory: encodeDirectory(directory) },
      replace: true,
    })
  }

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
      setGlobalConfigQueryData(queryClient, updatedGlobal)
      queryClient.setQueryData<PersonalizationSettingsBundle>(
        personalizationSettingsQueryKeys.bundle(),
        {
          globalConfig: updatedGlobal,
          personalization: readPersonalization(updatedGlobal),
        },
      )
      form.setFieldValue("primaryUse", primaryUse)
      setShowPrimaryUseStep(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPrimaryUseBusy(false)
    }
  }

  async function completePersonalizationAndNavigate(markCompleted: () => void) {
    // Keep the personalization step mounted until the route transition completes.
    setPersonalizationExitPending(true)
    markCompleted()
    setShowProviderSelectionStep(false)

    try {
      const nextDirectory = useChatStore.getState().activeDirectory
      if (nextDirectory) {
        await navigateToDirectoryChat(nextDirectory)
        return
      }

      await navigate({
        to: "/chat",
        replace: true,
      })
    } catch (error) {
      setPersonalizationExitPending(false)
      throw error
    }
  }

  async function completeSetupAndContinue(directory: string) {
    setActiveDirectory(directory)
    markSetupCompleted()
    startPersonalizationVersion(directory)
    setShowProviderSelectionStep(false)
    setShowFolderRecovery(false)
    setError(undefined)

    if (!useOnboardingStore.getState().shouldShowPersonalizationStep()) {
      await navigateToDirectoryChat(directory)
    }
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
      })
      setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
      if (savedNotebookHome) {
        setNotebookHomeQueryData(queryClient, savedNotebookHome)
      }

      applyOnboardingModelSelection(result.directory, result.model)
      setPersonalizationDirectory(result.directory)
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
    await finalizeNotebookSelection(authChoice, accessState.defaultDirectory)
  }

  async function handleSubmitPersonalization() {
    setPersonalizationBusy(true)
    setError(undefined)

    try {
      const nextValues = form.state.values
      const updatedGlobal = await patchGlobalConfig(buildPersonalizationPatch(nextValues))
      queryClient.setQueryData<PersonalizationSettingsBundle>(
        personalizationSettingsQueryKeys.bundle(),
        {
          globalConfig: updatedGlobal,
          personalization: readPersonalization(updatedGlobal),
        },
      )
      form.setErrorMap({ onSubmit: undefined })
      await completePersonalizationAndNavigate(() => {
        markPersonalizationCompleted()
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      form.setErrorMap({ onSubmit: { form: message, fields: {} } })
      setError(message)
    } finally {
      setPersonalizationBusy(false)
    }
  }

  async function handleSkipPersonalization() {
    form.setErrorMap({ onSubmit: undefined })
    setError(undefined)

    setPersonalizationBusy(true)

    try {
      await completePersonalizationAndNavigate(() => {
        markPersonalizationSkipped()
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      form.setErrorMap({ onSubmit: { form: message, fields: {} } })
      setError(message)
    } finally {
      setPersonalizationBusy(false)
    }
  }

  function handleBackToProviderSelection() {
    setError(undefined)
    setShowFolderRecovery(false)
    setShowProviderSelectionStep(true)
  }

  async function finalizeExistingNotebookProviderSelection(choice: OnboardingAuthChoice) {
    const existingDirectory = personalizationDirectory ?? onboardingPersonalizationDirectory
    if (!existingDirectory) {
      await finalizeNotebookSelection(choice)
      return
    }

    setFolderBusy(true)
    setError(undefined)

    try {
      const result = await configureNotebookForOnboarding({
        authChoice: choice,
        prepareNotebook: async () => existingDirectory,
        loadProviderCatalog,
      })

      applyOnboardingModelSelection(result.directory, result.model)
      setPersonalizationDirectory(result.directory)
      await completeSetupAndContinue(result.directory)
    } catch (err) {
      setError(
        formatProviderAuthError(err, language.t("routes.onboarding.initializeNotebookFailed")),
      )
    } finally {
      setFolderBusy(false)
    }
  }

  async function handleChoose(choice: OnboardingAuthChoice) {
    setError(undefined)
    setShowFolderRecovery(false)

    const existingDirectory = personalizationDirectory ?? onboardingPersonalizationDirectory
    const shouldResumePersonalization = shouldResumeOnboardingPersonalization({
      showProviderSelectionStep,
      currentChoice: authChoice,
      nextChoice: choice,
      existingDirectory,
    })
    if (shouldResumePersonalization && existingDirectory) {
      await completeSetupAndContinue(existingDirectory)
      return
    }

    if (choice === "free_models") {
      setAuthChoice(choice)
      if (showProviderSelectionStep) {
        await finalizeExistingNotebookProviderSelection(choice)
      }
      return
    }

    if (connectedAuthChoice === "chatgpt_plus") {
      setAuthChoice(choice)
      if (showProviderSelectionStep) {
        await finalizeExistingNotebookProviderSelection(choice)
      }
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

      setConnectedAuthChoice(choice)
      setAuthChoice(choice)
      if (showProviderSelectionStep) {
        await finalizeExistingNotebookProviderSelection(choice)
      }
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

  const currentStep = personalizationStepVisible ? 4 : 2

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-background-base px-6 pb-20 pt-[15vh] text-text-base">
      <div className="flex w-full max-w-md flex-col gap-14">
        <OnboardingHeader />

        <AnimatePresence mode="wait">
          {showPrimaryUseStep ? (
            <PrimaryUseSelection
              busy={primaryUseBusy}
              error={error}
              currentStep={1}
              totalSteps={TOTAL_ONBOARDING_STEPS}
              value={selectedPrimaryUse}
              onSelect={(primaryUse) => {
                void handlePrimaryUseSelect(primaryUse)
              }}
            />
          ) : personalizationStepVisible ? (
            <motion.div
              key="personalization"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              className="flex w-full flex-col gap-6"
            >
              {/* Navigation + Step badge */}
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  className="-ml-3 px-3"
                  onClick={handleBackToProviderSelection}
                >
                  <ArrowLeftIcon className="mr-2 size-4" />
                  {language.t("onboardingPersonalization.back")}
                </Button>
                <StepBadge current={currentStep} total={TOTAL_ONBOARDING_STEPS} />
              </div>

              <div className="flex flex-col pb-2 pt-2">
                <h2 className="text-sm font-medium text-text-weaker">Make buddy your own</h2>
              </div>

              {/* Form fields — flat, no card wrapper */}
              <div className="flex flex-col gap-6 pb-2">
                <SharedPersonalizationFormFields form={form} includePrimaryUse={false} />

                {/* Error */}
                <AnimatePresence>
                  {error ? (
                    <motion.div
                      role="alert"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                    >
                      <div className="rounded-xl border-l-2 border-l-border-critical-base bg-surface-critical-weak px-3 py-2.5">
                        <p className="text-sm font-medium text-icon-critical-base">{error}</p>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    void handleSkipPersonalization()
                  }}
                  disabled={personalizationBusy}
                >
                  {language.t("onboardingPersonalization.skip")}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void handleSubmitPersonalization()
                  }}
                  disabled={personalizationBusy}
                  className="min-w-32"
                >
                  {personalizationBusy
                    ? language.t("onboardingPersonalization.submitting")
                    : language.t("onboardingPersonalization.next")}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="setup"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="flex w-full flex-col"
            >
              <OnboardingSetup
                authChoice={authChoice}
                connectedAuthChoice={connectedAuthChoice}
                busyChoice={busyChoice}
                documentsAccessGranted={notebookHomeAccess?.granted ?? false}
                stepOffset={1}
                folderBusy={folderBusy}
                showFolderRecovery={showFolderRecovery}
                defaultHomeDirectory={notebookHomeAccess?.defaultDirectory}
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
