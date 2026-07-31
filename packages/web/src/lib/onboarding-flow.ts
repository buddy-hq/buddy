import type { ProviderAuthAuthorization } from "@opencode-ai/sdk/v2/client"
import type { OnboardingAuthChoice } from "@/components/onboarding"
import { language } from "@/context/language"
import type { ProviderCatalogState } from "@/state/chat-types"
import {
  EMPTY_PERSONALIZATION_SETTINGS,
  buildPersonalizationPatch,
  type PersonalizationSettings,
  type PrimaryUse,
} from "@/state/project-config-readers"
import { resolveCatalogProviderModelSelection } from "./provider-catalog"
import { OPENAI_PROVIDER_ID, OPENCODE_PROVIDER_ID } from "./provider-ids"
import { findPreferredOAuthMethodIndex } from "./provider-auth"

const PROVIDER_CONNECTION_POLL_INTERVAL_MS = 1_000
const PROVIDER_CONNECTION_TIMEOUT_MS = 45_000
const PREFERRED_FREE_ONBOARDING_MODEL_ID = "deepseek-v4-flash-free"
const PREFERRED_FREE_ONBOARDING_VARIANT = "max"
const PREFERRED_CHATGPT_ONBOARDING_MODEL_ID = "gpt-5.6-sol"
const PREFERRED_CHATGPT_ONBOARDING_VARIANT = "high"
const FALLBACK_CHATGPT_ONBOARDING_MODEL_ID = "gpt-5.6-terra"
const FALLBACK_CHATGPT_ONBOARDING_VARIANT = "xhigh"

export const ONBOARDING_PROVIDER_SELECTION_ACTION = {
  showLocation: "show_location",
  configureExistingNotebook: "configure_existing_notebook",
} as const

export const CINEMATIC_ONBOARDING_SCENE = {
  intro: "intro",
  introExit: "intro_exit",
  step: "step",
  finish: "finish",
} as const

export const ONBOARDING_PERSONALIZATION_COMMIT = {
  saveDetails: "save_details",
  skipDetails: "skip_details",
} as const

export type CinematicOnboardingScene =
  (typeof CINEMATIC_ONBOARDING_SCENE)[keyof typeof CINEMATIC_ONBOARDING_SCENE]

export type OnboardingPersonalizationCommit =
  (typeof ONBOARDING_PERSONALIZATION_COMMIT)[keyof typeof ONBOARDING_PERSONALIZATION_COMMIT]

export type OnboardingProviderSelectionAction =
  | { type: typeof ONBOARDING_PROVIDER_SELECTION_ACTION.showLocation }
  | {
      type: typeof ONBOARDING_PROVIDER_SELECTION_ACTION.configureExistingNotebook
      directory: string
    }

export function resolveOnboardingProviderID(choice: OnboardingAuthChoice) {
  return choice === "chatgpt_plus" ? OPENAI_PROVIDER_ID : OPENCODE_PROVIDER_ID
}

export function shouldResumeOnboardingPersonalization(input: {
  showProviderSelectionStep: boolean
  currentChoice: OnboardingAuthChoice | undefined
  nextChoice: OnboardingAuthChoice
  existingDirectory?: string
}) {
  return (
    input.showProviderSelectionStep &&
    input.currentChoice === input.nextChoice &&
    typeof input.existingDirectory === "string" &&
    input.existingDirectory.length > 0
  )
}

export function resolveOnboardingProviderSelectionAction(input: {
  showProviderSelectionStep: boolean
  existingDirectory?: string
}): OnboardingProviderSelectionAction {
  if (input.showProviderSelectionStep && input.existingDirectory) {
    return {
      type: ONBOARDING_PROVIDER_SELECTION_ACTION.configureExistingNotebook,
      directory: input.existingDirectory,
    }
  }

  return { type: ONBOARDING_PROVIDER_SELECTION_ACTION.showLocation }
}

export function shouldAutoContinueConnectedOpenAiOnboarding(input: {
  personalizationStepVisible: boolean
  showProviderSelectionStep: boolean
  openAiConnected: boolean
  alreadyHandled: boolean
}) {
  return (
    !input.personalizationStepVisible &&
    !input.showProviderSelectionStep &&
    input.openAiConnected &&
    !input.alreadyHandled
  )
}

export function shouldShowOnboardingPersonalizationStep(input: {
  personalizationStepPending: boolean
  showProviderSelectionStep: boolean
  exitPending: boolean
}) {
  return !input.showProviderSelectionStep && (input.personalizationStepPending || input.exitPending)
}

export function shouldShowOnboardingPrimaryUseStep(primaryUse: PrimaryUse | undefined) {
  return primaryUse === undefined
}

export function buildOnboardingPersonalizationPatch(input: {
  commit: OnboardingPersonalizationCommit
  selectedPrimaryUse: PrimaryUse | undefined
  values: PersonalizationSettings
}): Record<string, unknown> | undefined {
  const primaryUse = input.selectedPrimaryUse ?? input.values.primaryUse
  if (!primaryUse) return undefined

  const values =
    input.commit === ONBOARDING_PERSONALIZATION_COMMIT.saveDetails
      ? input.values
      : EMPTY_PERSONALIZATION_SETTINGS

  return buildPersonalizationPatch({
    ...values,
    primaryUse,
  })
}

export function resolveCinematicOnboardingScene(input: {
  introVisible: boolean
  introComplete: boolean
  finished: boolean
}): CinematicOnboardingScene {
  if (input.introVisible) {
    return CINEMATIC_ONBOARDING_SCENE.intro
  }

  if (!input.introComplete) {
    return CINEMATIC_ONBOARDING_SCENE.introExit
  }

  return input.finished ? CINEMATIC_ONBOARDING_SCENE.finish : CINEMATIC_ONBOARDING_SCENE.step
}

function resolvePreferredFreeOnboardingModel(catalog: ProviderCatalogState) {
  const openAiConnected = catalog.providers.some(
    (provider) => provider.id === OPENAI_PROVIDER_ID && provider.connected,
  )
  if (openAiConnected) return undefined

  const provider = catalog.providers.find((entry) => entry.id === OPENCODE_PROVIDER_ID)
  const model = provider?.models.find(
    (entry) =>
      entry.id === PREFERRED_FREE_ONBOARDING_MODEL_ID &&
      entry.variants.includes(PREFERRED_FREE_ONBOARDING_VARIANT),
  )
  if (!provider || !model) return undefined

  return {
    providerID: provider.id,
    modelID: model.id,
    variant: PREFERRED_FREE_ONBOARDING_VARIANT,
  }
}

function resolvePreferredChatGptOnboardingModel(catalog: ProviderCatalogState) {
  const provider = catalog.providers.find(
    (entry) => entry.id === OPENAI_PROVIDER_ID && entry.connected,
  )
  if (!provider) return undefined

  const preferences =
    catalog.openAIModelAvailability.status === "ready"
      ? [
          {
            modelID: PREFERRED_CHATGPT_ONBOARDING_MODEL_ID,
            variant: PREFERRED_CHATGPT_ONBOARDING_VARIANT,
          },
          {
            modelID: FALLBACK_CHATGPT_ONBOARDING_MODEL_ID,
            variant: FALLBACK_CHATGPT_ONBOARDING_VARIANT,
          },
        ]
      : [
          {
            modelID: FALLBACK_CHATGPT_ONBOARDING_MODEL_ID,
            variant: FALLBACK_CHATGPT_ONBOARDING_VARIANT,
          },
        ]

  for (const preference of preferences) {
    const model = provider.models.find(
      (entry) => entry.id === preference.modelID && entry.variants.includes(preference.variant),
    )
    if (model) {
      return {
        providerID: provider.id,
        modelID: model.id,
        variant: preference.variant,
      }
    }
  }

  return undefined
}

export async function connectChatGptPlusForOnboarding(input: {
  openLink: (url: string) => void
  loadProviderCatalogSnapshot: () => Promise<ProviderCatalogState>
  authorizeProviderOAuth: (request: {
    providerID: string
    methodIndex: number
  }) => Promise<ProviderAuthAuthorization | undefined>
  completeProviderOAuth: (request: { providerID: string; methodIndex: number }) => Promise<void>
  reloadProviderRuntime: () => Promise<void>
  forceReconnect?: boolean
  onAuthenticated?: () => void
}) {
  let authenticationNotified = false
  function notifyAuthenticated() {
    if (authenticationNotified) return
    authenticationNotified = true
    input.onAuthenticated?.()
  }

  const catalog = await input.loadProviderCatalogSnapshot()
  const provider = catalog.providers.find((entry) => entry.id === OPENAI_PROVIDER_ID)
  if (!provider) {
    throw new Error(language.t("onboardingFlow.openAiUnavailable"))
  }

  if (provider.connected && !input.forceReconnect) {
    notifyAuthenticated()
    return
  }

  const methodIndex = findPreferredOAuthMethodIndex(provider)
  if (methodIndex === undefined) {
    throw new Error(language.t("onboardingFlow.chatGptUnavailable"))
  }

  const authorization = await input.authorizeProviderOAuth({
    providerID: OPENAI_PROVIDER_ID,
    methodIndex,
  })

  if (!authorization) {
    throw new Error(language.t("onboardingFlow.startFlowFailed"))
  }

  input.openLink(authorization.url)

  if (authorization.method === "auto") {
    await input.completeProviderOAuth({
      providerID: OPENAI_PROVIDER_ID,
      methodIndex,
    })
    notifyAuthenticated()
  }

  await input.reloadProviderRuntime()

  const didConnect = await waitForConnectedProvider({
    loadProviderCatalogSnapshot: input.loadProviderCatalogSnapshot,
    providerID: OPENAI_PROVIDER_ID,
  })
  if (!didConnect) {
    throw new Error(language.t("onboardingFlow.confirmConnectionFailed"))
  }

  notifyAuthenticated()
}

async function waitForConnectedProvider(input: {
  loadProviderCatalogSnapshot: () => Promise<ProviderCatalogState>
  providerID: string
}) {
  const deadline = Date.now() + PROVIDER_CONNECTION_TIMEOUT_MS

  while (Date.now() <= deadline) {
    const catalog = await input.loadProviderCatalogSnapshot()
    const connected = catalog.providers.some(
      (entry) => entry.id === input.providerID && entry.connected,
    )
    if (connected) {
      return true
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, PROVIDER_CONNECTION_POLL_INTERVAL_MS)
    })
  }

  return false
}

export async function configureNotebookForOnboarding(input: {
  authChoice: OnboardingAuthChoice
  prepareNotebook: () => Promise<string>
  loadProviderCatalog: (directory: string) => Promise<ProviderCatalogState>
  refreshOpenAIModelAvailability?: (
    directory: string,
  ) => Promise<ProviderCatalogState["openAIModelAvailability"]>
}) {
  const nextDirectory = await input.prepareNotebook()
  let providerCatalog = await input.loadProviderCatalog(nextDirectory)
  if (
    input.authChoice === "chatgpt_plus" &&
    providerCatalog.openAIModelAvailability.status !== "ready" &&
    input.refreshOpenAIModelAvailability
  ) {
    try {
      const availability = await input.refreshOpenAIModelAvailability(nextDirectory)
      if (availability.status === "ready") {
        providerCatalog = await input.loadProviderCatalog(nextDirectory)
      }
    } catch {
      // Account availability is best-effort here. An unready catalog deliberately
      // skips Sol and uses the broadly available Terra fallback when possible.
    }
  }
  const preferredFreeModel =
    input.authChoice === "free_models"
      ? resolvePreferredFreeOnboardingModel(providerCatalog)
      : undefined
  const preferredChatGptModel =
    input.authChoice === "chatgpt_plus"
      ? resolvePreferredChatGptOnboardingModel(providerCatalog)
      : undefined
  const preferredModel = preferredFreeModel ?? preferredChatGptModel
  const model =
    preferredModel ??
    resolveCatalogProviderModelSelection({
      catalog: providerCatalog,
      providerID: resolveOnboardingProviderID(input.authChoice),
      requireConnected: input.authChoice !== "free_models",
    })

  if (!model) {
    throw new Error(
      input.authChoice === "chatgpt_plus"
        ? language.t("onboardingFlow.openAiNotReady")
        : language.t("onboardingFlow.freeModelUnavailable"),
    )
  }

  const configuredModel = `${model.providerID}/${model.modelID}`

  return {
    directory: nextDirectory,
    model: configuredModel,
    ...(preferredModel ? { variant: preferredModel.variant } : {}),
  }
}
