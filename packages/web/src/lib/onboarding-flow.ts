import type { ProviderAuthAuthorization } from "@opencode-ai/sdk/v2/client"
import type { OnboardingAuthChoice } from "@/components/onboarding"
import type { ProviderCatalogState } from "@/state/chat-types"
import { resolveCatalogProviderModelSelection } from "./provider-catalog"
import { findPreferredOAuthMethodIndex } from "./provider-auth"

const CHATGPT_PROVIDER_ID = "openai"
const FREE_MODEL_PROVIDER_ID = "opencode"

export function resolveOnboardingProviderID(choice: OnboardingAuthChoice) {
  return choice === "chatgpt_plus" ? CHATGPT_PROVIDER_ID : FREE_MODEL_PROVIDER_ID
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
  const provider = catalog.providers.find((entry) => entry.id === CHATGPT_PROVIDER_ID)
  if (!provider) {
    throw new Error("OpenAI sign-in is unavailable in this build.")
  }

  if (provider.connected) {
    return
  }

  const methodIndex = findPreferredOAuthMethodIndex(provider)
  if (methodIndex === undefined) {
    throw new Error("ChatGPT Plus sign-in is unavailable right now.")
  }

  const authorization = await input.authorizeProviderOAuth({
    providerID: CHATGPT_PROVIDER_ID,
    methodIndex,
  })

  if (!authorization) {
    throw new Error("Buddy could not start the ChatGPT Plus sign-in flow.")
  }

  input.openLink(authorization.url)

  if (authorization.method !== "auto") {
    throw new Error("Buddy could not complete browser sign-in automatically.")
  }

  await input.completeProviderOAuth({
    providerID: CHATGPT_PROVIDER_ID,
    methodIndex,
  })
  await input.reloadProviderRuntime()

  const refreshedCatalog = await input.loadProviderCatalogSnapshot()
  const connectedProvider = refreshedCatalog.providers.find(
    (entry) => entry.id === CHATGPT_PROVIDER_ID && entry.connected,
  )

  if (!connectedProvider) {
    throw new Error("Buddy could not confirm your ChatGPT Plus connection.")
  }
}

export async function configureNotebookForOnboarding(input: {
  authChoice: OnboardingAuthChoice
  directory: string
  openProject: (directory: string) => Promise<string>
  loadProviderCatalog: (directory: string) => Promise<ProviderCatalogState>
  patchProjectConfig: (
    directory: string,
    patch: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
}) {
  const nextDirectory = await input.openProject(input.directory)
  const providerCatalog = await input.loadProviderCatalog(nextDirectory)
  const model = resolveCatalogProviderModelSelection({
    catalog: providerCatalog,
    providerID: resolveOnboardingProviderID(input.authChoice),
  })

  if (!model) {
    throw new Error(
      input.authChoice === "chatgpt_plus"
        ? "OpenAI sign-in is not ready yet. Try signing in again or switch to free models."
        : "Buddy could not find an Opencode free model for this notebook.",
    )
  }

  const configuredModel = `${model.providerID}/${model.modelID}`
  await input.patchProjectConfig(nextDirectory, { model: configuredModel })

  return {
    directory: nextDirectory,
    model: configuredModel,
  }
}
