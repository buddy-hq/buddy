import type { ProviderAuthAuthorization } from "@opencode-ai/sdk/v2/client"
import type { OnboardingAuthChoice } from "@/components/onboarding"
import { language } from "@/context/language"
import type { ActiveChatTransitionResult } from "@/lib/active-chat-transition-coordinator"
import type { ProviderCatalogState } from "@/state/chat-types"
import type { PrimaryUse } from "@/state/project-config-readers"
import { resolveCatalogProviderModelSelection } from "./provider-catalog"
import { OPENAI_PROVIDER_ID, OPENCODE_PROVIDER_ID } from "./provider-ids"
import { findPreferredOAuthMethodIndex } from "./provider-auth"

const PROVIDER_CONNECTION_POLL_INTERVAL_MS = 1_000
const PROVIDER_CONNECTION_TIMEOUT_MS = 45_000
const PREFERRED_FREE_ONBOARDING_MODEL_ID = "deepseek-v4-flash-free"
const PREFERRED_FREE_ONBOARDING_VARIANT = "max"
const PREFERRED_CHATGPT_ONBOARDING_MODEL_ID = "gpt-5.6-sol"
const PREFERRED_CHATGPT_ONBOARDING_VARIANT = "high"
const FALLBACK_CHATGPT_ONBOARDING_MODEL_ID = "gpt-5.6-luna"
const FALLBACK_CHATGPT_ONBOARDING_VARIANT = "xhigh"

type ProviderOAuthRequest = {
  providerID: string
  methodIndex: number
}

function createSignInCancelledError() {
  return new Error(language.t("routes.onboarding.signInCancelled"))
}

async function cancelPendingProviderOAuth(input: {
  cancelProviderOAuth: (request: { providerID: string }) => Promise<void>
}) {
  try {
    await input.cancelProviderOAuth({ providerID: OPENAI_PROVIDER_ID })
  } catch {
    // Cancellation is best-effort because the callback may have settled first.
  }
}

async function completeProviderOAuthUntilAborted(input: {
  completeProviderOAuth: (request: ProviderOAuthRequest) => Promise<void>
  cancelProviderOAuth: (request: { providerID: string }) => Promise<void>
  request: ProviderOAuthRequest
  signal?: AbortSignal
}) {
  if (!input.signal) {
    await input.completeProviderOAuth(input.request)
    return
  }
  const signal = input.signal

  if (signal.aborted) {
    await cancelPendingProviderOAuth(input)
    throw createSignInCancelledError()
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false

    function settle(action: () => void) {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", handleAbort)
      action()
    }

    function handleAbort() {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", handleAbort)
      void cancelPendingProviderOAuth(input).then(() => {
        reject(createSignInCancelledError())
      })
    }

    signal.addEventListener("abort", handleAbort, { once: true })
    void input.completeProviderOAuth(input.request).then(
      () => settle(resolve),
      (error) => settle(() => reject(error)),
    )
  })
}

export const CINEMATIC_ONBOARDING_SCENE = {
  intro: "intro",
  introExit: "intro_exit",
  step: "step",
  finish: "finish",
} as const

export type CinematicOnboardingScene =
  (typeof CINEMATIC_ONBOARDING_SCENE)[keyof typeof CINEMATIC_ONBOARDING_SCENE]

export function resolveOnboardingProviderID(choice: OnboardingAuthChoice) {
  return choice === "chatgpt_plus" ? OPENAI_PROVIDER_ID : OPENCODE_PROVIDER_ID
}

export function shouldAutoContinueConnectedOpenAiOnboarding(input: {
  showProviderSelectionStep: boolean
  openAiConnected: boolean
  alreadyHandled: boolean
}) {
  return !input.showProviderSelectionStep && input.openAiConnected && !input.alreadyHandled
}

export function shouldShowOnboardingPrimaryUseStep(primaryUse: PrimaryUse | undefined) {
  return primaryUse === undefined
}

export async function activateDirectoryForOnboarding(input: {
  directory: string
  activateDirectory: (input: {
    directory: string
  }) => Promise<ActiveChatTransitionResult<{ directory: string }>>
}): Promise<boolean> {
  const result = await input.activateDirectory({ directory: input.directory })
  if (result.outcome === "failed") {
    throw result.error
  }

  return result.outcome === "committed" || result.outcome === "noop"
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
  authorizeProviderOAuth: (
    request: ProviderOAuthRequest,
  ) => Promise<ProviderAuthAuthorization | undefined>
  completeProviderOAuth: (request: ProviderOAuthRequest) => Promise<void>
  cancelProviderOAuth: (request: { providerID: string }) => Promise<void>
  reloadProviderRuntime: () => Promise<void>
  forceReconnect?: boolean
  onAuthenticated?: () => void
  signal?: AbortSignal
}) {
  let authenticationNotified = false
  function notifyAuthenticated() {
    if (authenticationNotified) return
    authenticationNotified = true
    input.onAuthenticated?.()
  }

  if (input.signal?.aborted) throw createSignInCancelledError()

  const catalog = await input.loadProviderCatalogSnapshot()
  if (input.signal?.aborted) throw createSignInCancelledError()
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

  if (input.signal?.aborted) {
    await cancelPendingProviderOAuth(input)
    throw createSignInCancelledError()
  }

  if (!authorization) {
    throw new Error(language.t("onboardingFlow.startFlowFailed"))
  }

  input.openLink(authorization.url)

  if (authorization.method === "auto") {
    await completeProviderOAuthUntilAborted({
      completeProviderOAuth: input.completeProviderOAuth,
      cancelProviderOAuth: input.cancelProviderOAuth,
      request: {
        providerID: OPENAI_PROVIDER_ID,
        methodIndex,
      },
      signal: input.signal,
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
}): Promise<{
  directory: string
  model: string
  variant?: string
}> {
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

  return Object.assign(
    {
      directory: nextDirectory,
      model: configuredModel,
    },
    preferredModel ? { variant: preferredModel.variant } : undefined,
  )
}
