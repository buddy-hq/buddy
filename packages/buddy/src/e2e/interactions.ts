import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { SessionPrompt as OpenCodeSessionPrompt } from "@buddy/opencode-adapter/session-prompt"
import { SessionStatus as OpenCodeSessionStatus } from "@buddy/opencode-adapter/session-status"

type JsonRecord = Record<string, unknown>

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function parsePromptModel(input: JsonRecord) {
  const model = asRecord(input.model)
  if (!model) return undefined
  const providerID = asString(model.providerID)
  const modelID = asString(model.modelID)
  if (!providerID || !modelID) return undefined
  return { providerID, modelID }
}

function buildPromptParts(input: JsonRecord) {
  const parts = asArray(input.parts)
  if (parts.length > 0) return parts

  const content = asString(input.content) ?? ""
  if (!content.trim()) return []
  return [
    {
      type: "text",
      text: content,
    },
  ]
}

function buildCommandParts(input: JsonRecord) {
  const command = asString(input.command) ?? "command"
  const argumentsText = asString(input.arguments) ?? ""
  const commandText = `/${command}${argumentsText ? ` ${argumentsText}` : ""}`
  const commandPart = {
    type: "text",
    text: commandText,
  }

  const extraParts = asArray(input.parts)
  return [commandPart, ...extraParts]
}

async function runDeterministicPrompt(input: {
  directory: string
  sessionID: string
  transformedBody: JsonRecord
}) {
  const parts = buildPromptParts(input.transformedBody)
  const payload = {
    sessionID: input.sessionID,
    noReply: true,
    ...(parsePromptModel(input.transformedBody)
      ? { model: parsePromptModel(input.transformedBody) }
      : {}),
    ...(asString(input.transformedBody.agent)
      ? { agent: asString(input.transformedBody.agent) }
      : {}),
    ...(asString(input.transformedBody.system)
      ? { system: asString(input.transformedBody.system) }
      : {}),
    ...(asString(input.transformedBody.variant)
      ? { variant: asString(input.transformedBody.variant) }
      : { variant: "default" }),
    ...(parts.length > 0 ? { parts } : {}),
  }
  const parsed = OpenCodeSessionPrompt.PromptInput.safeParse(payload)
  if (!parsed.success) {
    throw new Error("Invalid transformed prompt payload for deterministic E2E prompt")
  }

  return OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const message = await OpenCodeSessionPrompt.prompt(parsed.data)
      OpenCodeSessionStatus.set(parsed.data.sessionID, { type: "idle" })
      return message
    },
  })
}

export async function runE2EDeterministicPrompt(input: {
  directory: string
  sessionID: string
  transformedBody: JsonRecord
}) {
  return runDeterministicPrompt(input)
}

export async function runE2EDeterministicCommand(input: {
  directory: string
  sessionID: string
  transformedBody: JsonRecord
}) {
  const withCommandParts: JsonRecord = {
    ...input.transformedBody,
    parts: buildCommandParts(input.transformedBody),
    content: undefined,
  }
  return runDeterministicPrompt({
    directory: input.directory,
    sessionID: input.sessionID,
    transformedBody: withCommandParts,
  })
}
