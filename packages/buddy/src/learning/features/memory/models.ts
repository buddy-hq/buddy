import type { ProviderModel } from "@buddy/agent-runtime/providers"
import { getAgentRuntime } from "../../../runtime/agent-runtime"
import { parseConfiguredModel } from "../../../config/opencode/models"
import { readProjectConfig } from "../../../config/runtime/project-config"
import { readLearnerMemorySettings } from "./settings"
import {
  DEFAULT_OPENAI_CONSOLIDATION_MODEL,
  DEFAULT_OPENAI_EXTRACT_MODEL,
  OPENAI_PROVIDER_ID,
} from "./tuning"

type LearnerMemoryModelPurpose = "extract" | "consolidate"
type LearnerMemoryModel = { providerID: string; modelID: string; model: ProviderModel }
const LEARNER_MEMORY_NO_AUTOMATIC_MODEL_REASON = "learner_memory_no_automatic_model"

function selectedModel(model: ProviderModel): LearnerMemoryModel {
  return { providerID: model.providerID, modelID: model.id, model }
}

async function resolveLearnerMemoryModel(input: {
  directory: string
  purpose: LearnerMemoryModelPurpose
  allowGenericFallback?: boolean
}): Promise<LearnerMemoryModel | undefined> {
  const settings = readLearnerMemorySettings(await readProjectConfig(input.directory))
  const runtime = await getAgentRuntime()
  const catalog = await runtime.providers.catalog(input.directory)
  const models = catalog.all
    .filter((provider) => catalog.connected.includes(provider.id))
    .flatMap((provider) => Object.values(provider.models))
  const available = models
    .filter((model) => model.enabled && model.status !== "deprecated")
    .toSorted((left, right) => right.release_date.localeCompare(left.release_date))
  const configured =
    input.purpose === "extract" ? settings.extractModel : settings.consolidationModel
  const parsed = configured ? parseConfiguredModel(configured) : undefined
  const exact = parsed
    ? available.find(
        (model) => model.providerID === parsed.providerID && model.id === parsed.modelID,
      )
    : undefined
  if (exact) return selectedModel(exact)
  const openAIConnected = catalog.connected.includes(OPENAI_PROVIDER_ID)
  const openAI = openAIConnected
    ? available.find(
        (model) =>
          model.providerID === OPENAI_PROVIDER_ID &&
          model.id ===
            (input.purpose === "extract"
              ? DEFAULT_OPENAI_EXTRACT_MODEL
              : DEFAULT_OPENAI_CONSOLIDATION_MODEL),
      )
    : undefined
  if (openAI) return selectedModel(openAI)
  if (input.allowGenericFallback === false) return undefined
  if (input.purpose === "extract") {
    for (const family of ["gpt-luna", "gemini-flash-lite", "gemini-flash", "claude-haiku"]) {
      const small = available.find(
        (model) =>
          model.family === family &&
          model.status === "active" &&
          model.capabilities.input.text &&
          model.capabilities.output.text,
      )
      if (small) return selectedModel(small)
    }
  }
  const fallback = await runtime.providers.defaultModel(input.directory)
  if (!fallback) return undefined
  const find = (providers: typeof catalog.all) =>
    providers
      .flatMap((provider) => Object.values(provider.models))
      .find(
        (candidate) =>
          candidate.providerID === fallback.providerID && candidate.id === fallback.modelID,
      )
  const model = find(catalog.all) ?? find((await runtime.providers.catalog(input.directory)).all)
  return model ? selectedModel(model) : undefined
}

export {
  DEFAULT_OPENAI_CONSOLIDATION_MODEL,
  DEFAULT_OPENAI_EXTRACT_MODEL,
  LEARNER_MEMORY_NO_AUTOMATIC_MODEL_REASON,
  OPENAI_PROVIDER_ID,
  resolveLearnerMemoryModel,
}
export type { LearnerMemoryModel, LearnerMemoryModelPurpose }
