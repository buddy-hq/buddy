import type { ProviderAuthAuthorization } from "@opencode-ai/sdk/v2/client"
import type { OnboardingAuthChoice } from "@/components/onboarding"
import { language } from "@/context/language"
import type { ProviderCatalogState } from "@/state/chat-types"
import { resolveCatalogProviderModelSelection } from "./provider-catalog"
import { OPENAI_PROVIDER_ID } from "./provider-ids"
import { findPreferredOAuthMethodIndex } from "./provider-auth"

const FREE_MODEL_PROVIDER_ID = "opencode"
const PROVIDER_CONNECTION_POLL_INTERVAL_MS = 1_000
const PROVIDER_CONNECTION_TIMEOUT_MS = 45_000

export function resolveOnboardingProviderID(choice: OnboardingAuthChoice) {
  return choice === "chatgpt_plus" ? OPENAI_PROVIDER_ID : FREE_MODEL_PROVIDER_ID
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
  patchProjectConfig: (
    directory: string,
    patch: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
}) {
  const nextDirectory = await input.prepareNotebook()
  const providerCatalog = await input.loadProviderCatalog(nextDirectory)
  const model = resolveCatalogProviderModelSelection({
    catalog: providerCatalog,
    providerID: resolveOnboardingProviderID(input.authChoice),
  })

  if (!model) {
    throw new Error(
      input.authChoice === "chatgpt_plus"
        ? language.t("onboardingFlow.openAiNotReady")
        : language.t("onboardingFlow.freeModelUnavailable"),
    )
  }

  const configuredModel = `${model.providerID}/${model.modelID}`
  await input.patchProjectConfig(nextDirectory, { model: configuredModel })

  return {
    directory: nextDirectory,
    model: configuredModel,
  }
}
