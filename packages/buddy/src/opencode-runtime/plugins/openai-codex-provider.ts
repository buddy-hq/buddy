import type { Hooks } from "@opencode-ai/plugin"
import type { Model as OpenCodeModel } from "@opencode-ai/sdk/v2"
import {
  openAICodexAccountService,
  type OpenAICodexAccountModel,
} from "./openai-codex-account"
import { OPENAI_PROVIDER_ID } from "./openai-codex-credentials"

const PERCENT_BASE = 100
const MODEL_CATALOG_RESOLUTION_TIMEOUT_MS = 5_000

type OpenAICodexModelCatalogService = {
  resolveModelCatalog: typeof openAICodexAccountService.resolveModelCatalog
}

type OpenAICodexEffectiveModelLimits = Pick<OpenCodeModel["limit"], "context" | "input">

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
): Record<string, OpenCodeModel> {
  const result: Record<string, OpenCodeModel> = { ...models }

  for (const accountModel of accountModels) {
    const model = models[accountModel.slug]
    const limits = resolveOpenAICodexModelLimits(accountModel)
    if (!model || !limits) continue

    result[accountModel.slug] = {
      ...model,
      limit: {
        ...model.limit,
        ...limits,
      },
    }
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
      const accountModels = await Promise.race([
        catalogResult,
        timeoutResult,
      ]).finally(() => {
        if (timeout !== undefined) clearTimeout(timeout)
      })
      if (!accountModels) return provider.models
      return applyOpenAICodexAccountModels(provider.models, accountModels)
    },
  }
}
