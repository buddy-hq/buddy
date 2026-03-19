import { Agent } from "@buddy/opencode-adapter/agent"
import { Auth } from "@buddy/opencode-adapter/auth"
import { Plugin } from "@buddy/opencode-adapter/plugin"
import { Provider } from "@buddy/opencode-adapter/provider"
import { InstructionPrompt } from "@buddy/opencode-adapter/session-instruction"
import { SystemPrompt } from "@buddy/opencode-adapter/session-system"
import type { TeachingLlmOutboundEntry } from "../../shared/teaching-session-state"

const SYSTEM_PROMPT_SECTION_SEPARATOR = "\n\n" as const
const STRUCTURED_OUTPUT_FORMAT_TYPE = "json_schema" as const
const STRUCTURED_OUTPUT_SYSTEM_PROMPT = "IMPORTANT: The user has requested structured output. You MUST use the StructuredOutput tool to provide your final response. Do NOT respond with plain text - you MUST call the StructuredOutput tool with your answer formatted according to the schema." as const
const OPENAI_PROVIDER_ID = "openai" as const
const OAUTH_AUTH_TYPE = "oauth" as const

type ModelRef = {
  providerID: string
  modelID: string
}

type SerializableRecord = Record<string, unknown>

export async function buildFullSystemPrompt(input: {
  sessionID: string
  outbound?: TeachingLlmOutboundEntry
}): Promise<string | undefined> {
  const payload = input.outbound?.payload
  if (!isRecord(payload)) return undefined

  const model = await resolvePromptModel({
    payload,
  })
  const agentName = await resolveAgentName(payload)
  if (!model) return undefined

  const [agentInfo, providerInfo, authInfo, environmentPrompts, instructionPrompts] = await Promise.all([
    Agent.get(agentName).catch(() => undefined),
    Provider.getProvider(model.providerID).catch(() => undefined),
    Auth.get(model.providerID).catch(() => undefined),
    SystemPrompt.environment(model).catch(() => [] as string[]),
    InstructionPrompt.system().catch(() => [] as string[]),
  ])

  const isCodexOAuth = providerInfo?.id === OPENAI_PROVIDER_ID && authInfo?.type === OAUTH_AUTH_TYPE
  const system: string[] = [
    ...(agentInfo?.prompt ? [agentInfo.prompt] : isCodexOAuth ? [] : SystemPrompt.provider(model)),
    ...environmentPrompts,
    ...instructionPrompts,
  ]

  if (readFormatType(payload) === STRUCTURED_OUTPUT_FORMAT_TYPE) {
    system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)
  }

  const userSystem = readUserSystem(payload)
  if (userSystem) {
    system.push(userSystem)
  }

  const header = system[0]
  await Plugin.trigger(
    "experimental.chat.system.transform",
    { sessionID: input.sessionID, model },
    { system },
  ).catch(() => undefined)

  if (header && system.length > 2 && system[0] === header) {
    const remaining = system.slice(1).join("\n")
    system.length = 0
    system.push(header, remaining)
  }

  const codexInstructions = isCodexOAuth ? SystemPrompt.instructions() : undefined
  const fullPrompt = [codexInstructions, ...system]
    .filter((segment): segment is string => typeof segment === "string" && segment.trim().length > 0)
    .join(SYSTEM_PROMPT_SECTION_SEPARATOR)
    .trim()

  return fullPrompt.length > 0 ? fullPrompt : undefined
}

async function resolvePromptModel(input: {
  payload: SerializableRecord
}) {
  const directModel = readModelRef(input.payload)
  if (directModel) {
    const resolved = await Provider.getModel(directModel.providerID, directModel.modelID).catch(() => undefined)
    if (resolved) return resolved
  }

  const agentName = await resolveAgentName(input.payload)
  if (agentName) {
    const agent = await Agent.get(agentName).catch(() => undefined)
    if (agent?.model) {
      const resolved = await Provider.getModel(agent.model.providerID, agent.model.modelID).catch(() => undefined)
      if (resolved) return resolved
    }
  }

  const fallbackModelRef = await Provider.defaultModel().catch(() => undefined)
  if (!fallbackModelRef) return undefined

  return Provider.getModel(fallbackModelRef.providerID, fallbackModelRef.modelID).catch(() => undefined)
}

async function resolveAgentName(payload: SerializableRecord): Promise<string> {
  const value = payload.agent
  if (typeof value === "string" && value.trim().length > 0) {
    return value
  }
  return Agent.defaultAgent().catch(() => "build")
}

function readModelRef(payload: SerializableRecord): ModelRef | undefined {
  const value = payload.model
  if (!isRecord(value)) return undefined

  const providerID = value.providerID
  const modelID = value.modelID
  if (typeof providerID !== "string" || providerID.trim().length === 0) return undefined
  if (typeof modelID !== "string" || modelID.trim().length === 0) return undefined

  return {
    providerID,
    modelID,
  }
}

function readFormatType(payload: SerializableRecord) {
  const value = payload.format
  if (!isRecord(value)) return undefined

  const type = value.type
  return typeof type === "string" && type.trim().length > 0 ? type : undefined
}

function readUserSystem(payload: SerializableRecord) {
  const value = payload.system
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isRecord(value: unknown): value is SerializableRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
