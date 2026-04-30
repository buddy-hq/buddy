import { Provider } from "@buddy/opencode-adapter/provider"
import { ModelID, ProviderID } from "@buddy/opencode-adapter/id"
import {
  ensureOpenCodeProjectOverlay,
  parseConfiguredModel,
  readProjectConfig,
} from "../../config/runtime"
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
  model: Provider.Model
}

type ParsedModel = {
  providerID: string
  modelID: string
}

async function modelIfAvailable(input: ParsedModel): Promise<LearnerMemoryModel | undefined> {
  try {
    const model = await Provider.getModel(
      ProviderID.make(input.providerID),
      ModelID.make(input.modelID),
    )
    return {
      providerID: model.providerID,
      modelID: model.id,
      model,
    }
  } catch {
    return undefined
  }
}

async function openAIConnected(): Promise<boolean> {
  const providers = await Provider.list()
  return Object.values(providers).some((provider) => provider.id === OPENAI_PROVIDER_ID)
}

async function exactOpenAIModelForPurpose(
  purpose: LearnerMemoryModelPurpose,
): Promise<LearnerMemoryModel | undefined> {
  if (!(await openAIConnected())) return undefined
  return modelIfAvailable({
    providerID: OPENAI_PROVIDER_ID,
    modelID:
      purpose === "extract" ? DEFAULT_OPENAI_EXTRACT_MODEL : DEFAULT_OPENAI_CONSOLIDATION_MODEL,
  })
}

async function fallbackSmallModel(): Promise<LearnerMemoryModel | undefined> {
  const providers = await Provider.list()
  for (const provider of Object.values(providers)) {
    const smallModel = await Provider.getSmallModel(ProviderID.make(provider.id))
    if (smallModel) {
      return {
        providerID: smallModel.providerID,
        modelID: smallModel.id,
        model: smallModel,
      }
    }
  }

  return undefined
}

async function fallbackConfiguredModel(): Promise<LearnerMemoryModel> {
  const configuredModel = await Provider.defaultModel()
  const model = await Provider.getModel(
    ProviderID.make(configuredModel.providerID),
    ModelID.make(configuredModel.modelID),
  )
  return {
    providerID: model.providerID,
    modelID: model.id,
    model,
  }
}

async function resolveLearnerMemoryModel(input: {
  directory: string
  purpose: LearnerMemoryModelPurpose
}): Promise<LearnerMemoryModel> {
  await ensureOpenCodeProjectOverlay(input.directory)
  const config = await readProjectConfig(input.directory)
  const settings = readLearnerMemorySettings(config)
  const configured =
    input.purpose === "extract" ? settings.extractModel : settings.consolidationModel
  const configuredModel = configured ? parseConfiguredModel(configured) : undefined
  const resolvedConfigured = configuredModel ? await modelIfAvailable(configuredModel) : undefined
  if (resolvedConfigured) return resolvedConfigured

  const openAIModel = await exactOpenAIModelForPurpose(input.purpose)
  if (openAIModel) return openAIModel

  if (input.purpose === "extract") {
    const smallModel = await fallbackSmallModel()
    if (smallModel) return smallModel
  }

  return fallbackConfiguredModel()
}

export {
  DEFAULT_OPENAI_CONSOLIDATION_MODEL,
  DEFAULT_OPENAI_EXTRACT_MODEL,
  OPENAI_PROVIDER_ID,
  resolveLearnerMemoryModel,
}
export type { LearnerMemoryModel, LearnerMemoryModelPurpose }
