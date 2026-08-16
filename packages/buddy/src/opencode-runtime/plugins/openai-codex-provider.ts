import type { Hooks } from "@opencode-ai/plugin"
import type { Model as OpenCodeModel } from "@opencode-ai/sdk/v2"
import { openAICodexAccountService, type OpenAICodexAccountModel } from "./openai-codex-account"
import { OPENAI_PROVIDER_ID } from "./openai-codex-credentials"

const PERCENT_BASE = 100
const MODEL_CATALOG_RESOLUTION_TIMEOUT_MS = 5_000
const SUPPORTED_REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const

type SupportedReasoningEffort = (typeof SUPPORTED_REASONING_EFFORTS)[number]

type OpenAICodexModelCatalogService = {
  resolveModelCatalog: typeof openAICodexAccountService.resolveModelCatalog
}

type OpenAICodexEffectiveModelLimits = Pick<OpenCodeModel["limit"], "context" | "input">

function isSupportedReasoningEffort(effort: string): effort is SupportedReasoningEffort {
  return SUPPORTED_REASONING_EFFORTS.some((supportedEffort) => supportedEffort === effort)
}

export function resolveOpenAICodexModelVariants(model: OpenAICodexAccountModel) {
  if (!model.supported_reasoning_levels) return undefined

  return Object.fromEntries(
    model.supported_reasoning_levels
      .map((level) => level.effort)
      .filter(isSupportedReasoningEffort)
      .map((effort) => [effort, { reasoningEffort: effort }]),
  )
}

export function resolveOpenAICodexModelLimits(
  model: OpenAICodexAccountModel,
): OpenAICodexEffectiveModelLimits | undefined {
  const context = model.context_window ?? model.max_context_window
  if (!context) return undefined

  const effectivePercent = model.effective_context_window_percent ?? PERCENT_BASE
  const effectiveContext = Math.floor((context * effectivePercent) / PERCENT_BASE)
  if (effectiveContext <= 0) return undefined

  return {
    context: effectiveContext,
    input: effectiveContext,
  }
}

export function applyOpenAICodexAccountModels(
  models: Record<string, OpenCodeModel>,
  accountModels: OpenAICodexAccountModel[],
) {
  const result = { ...models } satisfies Record<string, OpenCodeModel>

  for (const accountModel of accountModels) {
    const model = models[accountModel.slug]
    const limits = resolveOpenAICodexModelLimits(accountModel)
    const variants = resolveOpenAICodexModelVariants(accountModel)
    if (!model || (!limits && !variants)) continue

    result[accountModel.slug] = Object.assign(
      {},
      model,
      limits
        ? {
            limit: Object.assign({}, model.limit, limits),
          }
        : undefined,
      variants ? { variants } : undefined,
    )
  }

  return result
}

export function createOpenAICodexProviderHook(input: {
  directory: string
  accountService?: OpenAICodexModelCatalogService
  modelCatalogResolutionTimeoutMs?: number
}): NonNullable<Hooks["provider"]> {
  const accountService = input.accountService ?? openAICodexAccountService
  const modelCatalogResolutionTimeoutMs =
    input.modelCatalogResolutionTimeoutMs ?? MODEL_CATALOG_RESOLUTION_TIMEOUT_MS

  return {
    id: OPENAI_PROVIDER_ID,
    models: async (provider, context) => {
      if (context.auth?.type !== "oauth") return provider.models

      const abortController = new AbortController()
      let timeout: ReturnType<typeof setTimeout> | undefined
      const timeoutResult = new Promise<undefined>((resolve) => {
        timeout = setTimeout(() => {
          abortController.abort()
          resolve(undefined)
        }, modelCatalogResolutionTimeoutMs)
      })
      const catalogResult = accountService
        .resolveModelCatalog(input.directory, abortController.signal)
        .catch(() => undefined)
      const accountModels = await Promise.race([catalogResult, timeoutResult]).finally(() => {
        if (timeout !== undefined) clearTimeout(timeout)
      })
      if (!accountModels) return provider.models
      return applyOpenAICodexAccountModels(provider.models, accountModels)
    },
  }
}
