import type { Hooks } from "@opencode-ai/plugin"
import type { Model as OpenCodeModel } from "@opencode-ai/sdk/v2"
import { openAICodexAccountService, type OpenAICodexAccountModel } from "./openai-codex-account"
import { OPENAI_PROVIDER_ID } from "./openai-codex-credentials"

const PERCENT_BASE = 100
const MODEL_CATALOG_RESOLUTION_TIMEOUT_MS = 5_000
const DEFAULT_CODEX_CONTEXT = 128_000
const DEFAULT_CODEX_OUTPUT = 32_000
const ENCRYPTED_REASONING_INCLUDE = "reasoning.encrypted_content"
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

function modelName(model: OpenAICodexAccountModel, existing?: OpenCodeModel) {
  if (model.display_name) return model.display_name
  if (existing) return existing.name
  const match = /^gpt-(\d+(?:\.\d+)?)(?:-(.+))?$/.exec(model.slug)
  if (!match) return model.slug
  const suffix = match[2]?.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  return `GPT-${match[1]}${suffix ? ` ${suffix.join(" ")}` : ""}`
}

function accountModelCapabilities(
  model: OpenAICodexAccountModel,
  existing?: OpenCodeModel,
): OpenCodeModel["capabilities"] {
  const modalities = new Set(model.input_modalities ?? ["text", "image"])
  const input = {
    text: modalities.has("text"),
    audio: modalities.has("audio"),
    image: modalities.has("image"),
    video: false,
    pdf: false,
  }
  return {
    ...existing?.capabilities,
    temperature: existing?.capabilities.temperature ?? false,
    reasoning: existing?.capabilities.reasoning ?? true,
    attachment: input.audio || input.image,
    toolcall: existing?.capabilities.toolcall ?? true,
    input,
    output: existing?.capabilities.output ?? {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    },
    interleaved: existing?.capabilities.interleaved ?? false,
  }
}

function modelOptions(model: OpenCodeModel, accountModel: OpenAICodexAccountModel) {
  if (!model.capabilities.reasoning) return model.options
  const currentInclude = Array.isArray(model.options.include) ? model.options.include : []
  const options = {
    ...model.options,
    include: [...new Set([...currentInclude, ENCRYPTED_REASONING_INCLUDE])],
  }
  if (accountModel.supports_reasoning_summary_parameter === false) {
    return { ...options, reasoningSummary: null }
  }
  return { ...options, reasoningSummary: model.options.reasoningSummary ?? "auto" }
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
  const result: Record<string, OpenCodeModel> = {}
  const template = Object.values(models).find(
    (model) =>
      model.providerID === OPENAI_PROVIDER_ID &&
      model.api.id === model.id &&
      model.capabilities.reasoning &&
      model.capabilities.toolcall &&
      model.status !== "deprecated" &&
      model.options.reasoningMode !== "pro",
  )

  for (const accountModel of accountModels) {
    const existingModel = models[accountModel.slug]
    const limits = resolveOpenAICodexModelLimits(accountModel)
    const variants = resolveOpenAICodexModelVariants(accountModel)
    const capabilities = accountModelCapabilities(accountModel, existingModel)
    const model: OpenCodeModel = existingModel ?? {
      id: accountModel.slug,
      providerID: OPENAI_PROVIDER_ID,
      api: {
        id: accountModel.slug,
        npm: template?.api.npm ?? "@ai-sdk/openai",
        url: template?.api.url ?? "",
      },
      name: modelName(accountModel),
      family: "",
      capabilities,
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      limit: {
        context: DEFAULT_CODEX_CONTEXT,
        input: DEFAULT_CODEX_CONTEXT,
        output: DEFAULT_CODEX_OUTPUT,
      },
      status: "active",
      options: {},
      headers: {},
      release_date: "",
    }

    const limit = { ...model.limit }
    if (!existingModel && template) Object.assign(limit, template.limit)
    if (limits) Object.assign(limit, limits)
    limit.output =
      accountModel.max_output_tokens ??
      existingModel?.limit.output ??
      template?.limit.output ??
      DEFAULT_CODEX_OUTPUT

    const resolvedModel: OpenCodeModel = {
      ...model,
      api: { ...model.api, id: accountModel.slug },
      name: modelName(accountModel, existingModel),
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      limit,
      capabilities,
      options: modelOptions(model, accountModel),
    }
    if (variants) resolvedModel.variants = variants
    result[accountModel.slug] = resolvedModel
  }

  return result
}

export async function resolveOpenAICodexAccountModels(input: {
  directory: string
  accountService?: OpenAICodexModelCatalogService
  timeoutMs?: number
}): Promise<OpenAICodexAccountModel[] | undefined> {
  const accountService = input.accountService ?? openAICodexAccountService
  const timeoutMs = input.timeoutMs ?? MODEL_CATALOG_RESOLUTION_TIMEOUT_MS
  const abortController = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutResult = new Promise<undefined>((resolve) => {
    timeout = setTimeout(() => {
      abortController.abort()
      resolve(undefined)
    }, timeoutMs)
  })
  const catalogResult = accountService
    .resolveModelCatalog(input.directory, abortController.signal)
    .catch(() => undefined)
  return Promise.race([catalogResult, timeoutResult]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout)
  })
}

export function createOpenAICodexProviderHook(input: {
  directory: string
  accountService?: OpenAICodexModelCatalogService
  modelCatalogResolutionTimeoutMs?: number
}): NonNullable<Hooks["provider"]> {
  return {
    id: OPENAI_PROVIDER_ID,
    models: async (provider, context) => {
      if (context.auth?.type !== "oauth") return provider.models
      const accountModels = await resolveOpenAICodexAccountModels({
        directory: input.directory,
        accountService: input.accountService,
        timeoutMs: input.modelCatalogResolutionTimeoutMs,
      })
      if (!accountModels) return provider.models
      return applyOpenAICodexAccountModels(provider.models, accountModels)
    },
  }
}
