import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Provider } from "@buddy/opencode-adapter/provider"
import { Session } from "@buddy/opencode-adapter/session"
import { SessionPrompt } from "@buddy/opencode-adapter/session-prompt"
import type z from "zod"
import {
  ensureOpenCodeProjectOverlay,
  parseConfiguredModel,
  readProjectConfig,
} from "../../../config/compatibility.js"

type StructuredSchema = {
  type: "object"
  properties: Record<string, unknown>
  required?: readonly string[]
  additionalProperties?: boolean
}

type ModelRef = {
  providerID: string
  modelID: string
}

type ResolvedModel = {
  providerId: string
  modelId: string
  usedSmallModel: boolean
}

export type DecisionEngineResult<T> = {
  output?: T
  providerId?: string
  modelId?: string
  usedSmallModel: boolean
  error?: string
}

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function extractStructuredPayload(message: unknown): unknown {
  if (!isObject(message)) {
    return undefined
  }
  const info = message.info
  if (!isObject(info)) {
    return undefined
  }
  if (info.role !== "assistant") {
    return undefined
  }
  return info.structured
}

function parseModelRef(value: unknown): ModelRef | undefined {
  if (!isObject(value)) return undefined
  if (!("providerID" in value) || !("modelID" in value)) return undefined
  if (typeof value.providerID !== "string" || typeof value.modelID !== "string") return undefined
  if (!value.providerID || !value.modelID) return undefined
  return {
    providerID: value.providerID,
    modelID: value.modelID,
  }
}

async function resolveSessionModel(sessionID: string): Promise<ModelRef | undefined> {
  const messages = await Session.messages({
    sessionID,
    limit: 50,
  }).catch(() => [])

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!isObject(message)) continue
    const info = message.info
    if (!isObject(info)) continue
    if (info.role !== "user") continue

    const model = parseModelRef(info.model)
    if (model) {
      return model
    }
  }

  return undefined
}

async function resolvePreferredModel(reference: ModelRef): Promise<ResolvedModel | undefined> {
  const small = await Provider.getSmallModel(reference.providerID).catch(() => undefined)
  if (small) {
    return {
      providerId: small.providerID,
      modelId: small.id,
      usedSmallModel: small.providerID !== reference.providerID || small.id !== reference.modelID,
    }
  }

  const direct = await Provider.getModel(reference.providerID, reference.modelID).catch(() => undefined)
  if (!direct) {
    return undefined
  }

  return {
    providerId: direct.providerID,
    modelId: direct.id,
    usedSmallModel: false,
  }
}

export async function runStructuredDecision<T>(input: {
  directory: string
  title: string
  system: string
  prompt: string
  schema: z.ZodType<T>
  jsonSchema: StructuredSchema
  sessionId?: string
}): Promise<DecisionEngineResult<T>> {
  const projectConfig = await readProjectConfig(input.directory)
  const configured = parseConfiguredModel(projectConfig.model)

  await ensureOpenCodeProjectOverlay(input.directory)

  return OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const sessionModel = input.sessionId ? await resolveSessionModel(input.sessionId) : undefined
      const modelReference = sessionModel ?? configured
      if (!modelReference) {
        return {
          usedSmallModel: false,
          error: "Learner decision engine skipped because no session model or configured project model was found.",
        }
      }

      const model = await resolvePreferredModel(modelReference)
      if (!model) {
        return {
          usedSmallModel: false,
          error: `Learner decision engine could not resolve model ${modelReference.providerID}/${modelReference.modelID}.`,
        }
      }

      const session = await Session.create({
        title: input.title,
      })

      let decisionResult: DecisionEngineResult<T>
      try {
        const response = await SessionPrompt.prompt({
          sessionID: session.id,
          model: {
            providerID: model.providerId,
            modelID: model.modelId,
          },
          system: input.system,
          parts: [
            {
              type: "text",
              text: input.prompt,
            },
          ],
          format: {
            type: "json_schema",
            schema: input.jsonSchema,
            retryCount: 1,
          },
        })

        const structured = extractStructuredPayload(response)
        const parsed = input.schema.safeParse(structured)
        if (!parsed.success) {
          decisionResult = {
            providerId: model.providerId,
            modelId: model.modelId,
            usedSmallModel: model.usedSmallModel,
            error: `Structured output parse failed: ${parsed.error.issues[0]?.message ?? "invalid output"}`,
          }
          return decisionResult
        }

        decisionResult = {
          output: parsed.data,
          providerId: model.providerId,
          modelId: model.modelId,
          usedSmallModel: model.usedSmallModel,
        }
        return decisionResult
      } catch (error) {
        decisionResult = {
          providerId: model.providerId,
          modelId: model.modelId,
          usedSmallModel: model.usedSmallModel,
          error: asErrorMessage(error),
        }
        return decisionResult
      } finally {
        try {
          await Session.remove(session.id)
        } catch (error) {
          console.warn("Failed to remove decision session", error)
        }
      }
    },
  })
}
