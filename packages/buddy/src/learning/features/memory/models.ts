import type { OpenCodeTypes } from "@buddy/opencode-adapter/host"
import { getOpenCodeClient } from "../../../opencode-runtime/client"
import { parseConfiguredModel } from "../../../config/opencode/models"
import { readProjectConfig } from "../../../config/runtime/project-config"
import { readLearnerMemorySettings } from "./settings"
import { DEFAULT_OPENAI_CONSOLIDATION_MODEL, DEFAULT_OPENAI_EXTRACT_MODEL, OPENAI_PROVIDER_ID } from "./tuning"

type LearnerMemoryModelPurpose = "extract" | "consolidate"
type LearnerMemoryModel = { providerID: string; modelID: string; model: OpenCodeTypes.ModelInfo }
const LEARNER_MEMORY_NO_AUTOMATIC_MODEL_REASON = "learner_memory_no_automatic_model"

function selectedModel(model: OpenCodeTypes.ModelInfo): LearnerMemoryModel {
  return { providerID: model.providerID, modelID: model.id, model }
}

async function resolveLearnerMemoryModel(input: {
  directory: string
  purpose: LearnerMemoryModelPurpose
  allowGenericFallback?: boolean
}): Promise<LearnerMemoryModel | undefined> {
  const settings = readLearnerMemorySettings(await readProjectConfig(input.directory))
  const client = await getOpenCodeClient()
  const location = { directory: input.directory }
  const [models, providers] = await Promise.all([client.model.list({ location }), client.provider.list({ location })])
  const available = models.data.filter((model) => model.enabled && model.status !== "deprecated")
  const configured = input.purpose === "extract" ? settings.extractModel : settings.consolidationModel
  const parsed = configured ? parseConfiguredModel(configured) : undefined
  const exact = parsed ? available.find((model) => model.providerID === parsed.providerID && model.id === parsed.modelID) : undefined
  if (exact) return selectedModel(exact)
  const openAIConnected = providers.data.some((provider) => provider.id === OPENAI_PROVIDER_ID && provider.activation !== "disabled")
  const openAI = openAIConnected ? available.find((model) => model.providerID === OPENAI_PROVIDER_ID && model.id === (
    input.purpose === "extract" ? DEFAULT_OPENAI_EXTRACT_MODEL : DEFAULT_OPENAI_CONSOLIDATION_MODEL
  )) : undefined
  if (openAI) return selectedModel(openAI)
  if (input.allowGenericFallback === false) return undefined
  if (input.purpose === "extract") {
    for (const family of ["gpt-luna", "gemini-flash-lite", "gemini-flash", "claude-haiku"]) {
      const small = available.find((model) => model.family === family && model.status === "active" &&
        model.capabilities.input.some((value) => value.startsWith("text")) &&
        model.capabilities.output.some((value) => value.startsWith("text")))
      if (small) return selectedModel(small)
    }
  }
  const fallback = (await client.model.default({ location })).data
  return fallback ? selectedModel(fallback) : undefined
}

export { DEFAULT_OPENAI_CONSOLIDATION_MODEL, DEFAULT_OPENAI_EXTRACT_MODEL, LEARNER_MEMORY_NO_AUTOMATIC_MODEL_REASON, OPENAI_PROVIDER_ID, resolveLearnerMemoryModel }
export type { LearnerMemoryModel, LearnerMemoryModelPurpose }
