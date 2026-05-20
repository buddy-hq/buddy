import type { ProviderAuthAuthorization } from "@opencode-ai/sdk/v2/client"
import type { OnboardingAuthChoice } from "@/components/onboarding"
import { language } from "@/context/language"
import type { ProviderCatalogState } from "@/state/chat-types"
import { resolveCatalogProviderModelSelection } from "./provider-catalog"
import { OPENAI_PROVIDER_ID, OPENCODE_PROVIDER_ID } from "./provider-ids"
import { findPreferredOAuthMethodIndex } from "./provider-auth"

const PROVIDER_CONNECTION_POLL_INTERVAL_MS = 1_000
const PROVIDER_CONNECTION_TIMEOUT_MS = 45_000

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
  return (
    !input.showProviderSelectionStep &&
    (input.personalizationStepPending || input.exitPending)
  )
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
}) {
  const catalog = await input.loadProviderCatalogSnapshot()
  const provider = catalog.providers.find((entry) => entry.id === OPENAI_PROVIDER_ID)
  if (!provider) {
    throw new Error(language.t("onboardingFlow.openAiUnavailable"))
  }

  if (provider.connected) {
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
  }

  await input.reloadProviderRuntime()

  const didConnect = await waitForConnectedProvider({
    loadProviderCatalogSnapshot: input.loadProviderCatalogSnapshot,
    providerID: OPENAI_PROVIDER_ID,
  })
  if (!didConnect) {
    throw new Error(language.t("onboardingFlow.confirmConnectionFailed"))
  }
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
}) {
  const nextDirectory = await input.prepareNotebook()
  const providerCatalog = await input.loadProviderCatalog(nextDirectory)
  const model = resolveCatalogProviderModelSelection({
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
  }
}
