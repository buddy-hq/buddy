import { parseConfiguredModel, readProjectConfig } from "../../../config/runtime/config-access"
import { getPiModelRegistry, refreshPiModels } from "../../../pi-backend/host"
import {
  buddyProviderIDFromPi,
  piProviderCandidatesFromBuddy,
} from "../../../pi-backend/provider-aliases"
import type { PiModel } from "../../../pi-backend/types"
import { readLearnerMemorySettings } from "./settings"
import {
  DEFAULT_OPENAI_CONSOLIDATION_MODEL,
  DEFAULT_OPENAI_EXTRACT_MODEL,
  OPENAI_PROVIDER_ID,
} from "./tuning"

type LearnerMemoryModelPurpose = "extract" | "consolidate"

type LearnerMemoryModel = {
  providerID: string
  modelID: string
  model: PiModel
}

const LEARNER_MEMORY_NO_AUTOMATIC_MODEL_REASON = "learner_memory_no_automatic_model"

type ParsedModel = {
  providerID: string
  modelID: string
}

function learnerMemoryModel(model: PiModel): LearnerMemoryModel {
  return {
    providerID: buddyProviderIDFromPi(model.provider),
    modelID: model.id,
    model,
  }
}

function modelIfAvailable(input: ParsedModel): LearnerMemoryModel | undefined {
  const registry = getPiModelRegistry()
  for (const providerID of piProviderCandidatesFromBuddy(input.providerID)) {
    const model = registry.find(providerID, input.modelID)
    if (model && registry.hasConfiguredAuth(model)) {
      return learnerMemoryModel(model)
    }
  }
  return undefined
}

function availableModels(): PiModel[] {
  refreshPiModels()
  return getPiModelRegistry().getAvailable()
}

function openAIConnected(): boolean {
  return availableModels().some(
    (model) => buddyProviderIDFromPi(model.provider) === OPENAI_PROVIDER_ID,
  )
}

function exactOpenAIModelForPurpose(
  purpose: LearnerMemoryModelPurpose,
): LearnerMemoryModel | undefined {
  if (!openAIConnected()) return undefined
  return modelIfAvailable({
    providerID: OPENAI_PROVIDER_ID,
    modelID:
      purpose === "extract" ? DEFAULT_OPENAI_EXTRACT_MODEL : DEFAULT_OPENAI_CONSOLIDATION_MODEL,
  })
}

function fallbackSmallModel(): LearnerMemoryModel | undefined {
  const model = availableModels().toSorted(
    (left, right) => left.contextWindow - right.contextWindow,
  )[0]
  return model ? learnerMemoryModel(model) : undefined
}

function fallbackConfiguredModel(): LearnerMemoryModel | undefined {
  const model = availableModels()[0]
  return model ? learnerMemoryModel(model) : undefined
}

async function resolveLearnerMemoryModel(input: {
  directory: string
  purpose: LearnerMemoryModelPurpose
  allowGenericFallback?: boolean
}): Promise<LearnerMemoryModel | undefined> {
  const config = await readProjectConfig(input.directory)
  const settings = readLearnerMemorySettings(config)
  const configured =
    input.purpose === "extract" ? settings.extractModel : settings.consolidationModel
  const configuredModel = configured ? parseConfiguredModel(configured) : undefined
  const resolvedConfigured = configuredModel ? modelIfAvailable(configuredModel) : undefined
  if (resolvedConfigured) return resolvedConfigured

  const openAIModel = exactOpenAIModelForPurpose(input.purpose)
  if (openAIModel) return openAIModel

  if (input.allowGenericFallback === false) {
    return undefined
  }

  if (input.purpose === "extract") {
    const smallModel = fallbackSmallModel()
    if (smallModel) return smallModel
  }

  return fallbackConfiguredModel()
}

export {
  DEFAULT_OPENAI_CONSOLIDATION_MODEL,
  DEFAULT_OPENAI_EXTRACT_MODEL,
  LEARNER_MEMORY_NO_AUTOMATIC_MODEL_REASON,
  OPENAI_PROVIDER_ID,
  resolveLearnerMemoryModel,
}
export type { LearnerMemoryModel, LearnerMemoryModelPurpose }
