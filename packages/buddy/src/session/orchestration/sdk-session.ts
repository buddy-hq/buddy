import type { Context } from "hono"
import z from "zod"
import type { PromptInput, CommandInput } from "@buddy/opencode-adapter/gateway/write"
import { SessionTransformValidationError } from "./errors"
import { isJsonContentType } from "../../http/http"
import { invalidJsonResponse } from "../../http/request-json"
import {
  flattenPromptPartsForRuntime,
  resolvePromptCitationLocations,
  runtimePromptFromParts,
} from "../../learning/prompt/workspace-file-references"
import type { CitationLocationContext } from "../../learning/prompt/citation-source-location"
import { parseTSessionJsonObject, parseTSessionString, type TSessionJsonObject } from "./parse-values"

async function parseRequestJsonObject(c: Context): Promise<TSessionJsonObject | Response> {
  try {
    const value = await c.req.json()
    return parseTSessionJsonObject(value) ?? invalidJsonResponse()
  } catch {
    return invalidJsonResponse()
  }
}

export async function readValidatedJsonObject(c: Context): Promise<TSessionJsonObject | Response> {
  const contentType = c.req.header("content-type")
  if (!isJsonContentType(contentType)) {
    return invalidJsonResponse()
  }

  return parseRequestJsonObject(c)
}

async function flattenRuntimeParts<T>(parts: readonly T[], context: CitationLocationContext) {
  return flattenPromptPartsForRuntime(parts, await resolvePromptCitationLocations(parts, context))
}

export async function prepareRuntimePromptBody(
  body: TSessionJsonObject,
  context: CitationLocationContext,
): Promise<TSessionJsonObject> {
  const parts = Array.isArray(body.parts)
    ? await flattenRuntimeParts(body.parts, context)
    : [{ type: "text", text: parseTSessionString(body.text) ?? parseTSessionString(body.content) ?? "" }]
  const prompt = {
    ...body,
    ...runtimePromptFromParts({ parts, metadata: parseTSessionJsonObject(body.metadata), system: parseTSessionString(body.system) }),
  }
  if (body.messageID !== undefined) prompt.id = body.messageID
  if (body.noReply === true) prompt.resume = false
  return prompt
}

export async function prepareRuntimeCommandBody(
  body: TSessionJsonObject,
  context: CitationLocationContext,
): Promise<TSessionJsonObject> {
  const withRuntimeParts = Array.isArray(body.parts)
    ? {
        ...body,
        parts: await flattenRuntimeParts(body.parts, context),
      }
    : body

  if ("arguments" in withRuntimeParts) {
    return withRuntimeParts
  }

  return {
    ...withRuntimeParts,
    arguments: "",
  }
}

const Mention = z.object({ text: z.string(), start: z.number().int().nonnegative(), end: z.number().int().nonnegative() })
const Model = z.union([
  z.object({ providerID: z.string().min(1), modelID: z.string().min(1), variant: z.string().optional() }).transform((model) => ({ providerID: model.providerID, id: model.modelID, variant: model.variant })),
  z.string().transform((model, context) => {
    const slash = model.indexOf("/")
    if (slash <= 0 || slash === model.length - 1) {
      context.addIssue({ code: "custom", message: "Model must be provider/model" })
      return z.NEVER
    }
    return { providerID: model.slice(0, slash), id: model.slice(slash + 1), variant: undefined }
  }),
])
const RuntimePrompt = z.object({
  id: z.string().startsWith("msg_").optional(),
  text: z.string(),
  files: z.array(z.object({ uri: z.string(), name: z.string().optional(), description: z.string().optional(), mention: Mention.optional() })).optional(),
  agents: z.array(z.object({ name: z.string(), mention: Mention.optional() })).optional(),
  skills: z.array(z.object({ id: z.string(), mention: Mention.optional() })).optional(),
  metadata: z.record(z.string(), z.json()).optional(),
  delivery: z.enum(["queue", "steer"]).optional(),
  resume: z.boolean().optional(),
  agent: z.string().optional(),
  model: Model.optional(),
  variant: z.string().optional(),
})

export function buildSessionSdkParameters(input: {
  sessionID: string
  directory: string
  body: TSessionJsonObject
}): PromptInput {
  const parsed = RuntimePrompt.safeParse(input.body)
  if (!parsed.success) throw new SessionTransformValidationError(parsed.error.issues[0]?.message ?? "Invalid prompt")
  const { variant, model, ...prompt } = parsed.data
  return { ...prompt, sessionID: input.sessionID, model: model ? { ...model, variant: variant ?? model.variant } : undefined }
}

export function buildSessionCommandParameters(input: {
  sessionID: string
  directory: string
  body: TSessionJsonObject
}): CommandInput {
  const name = parseTSessionString(input.body.command)
  if (!name?.trim()) throw new SessionTransformValidationError("Command is required")
  const parts = Array.isArray(input.body.parts) ? input.body.parts.flatMap((part) => {
    const object = parseTSessionJsonObject(part)
    return object ? [object] : []
  }) : []
  const prompt = buildSessionSdkParameters({ ...input, body: { ...input.body, ...runtimePromptFromParts({ parts }), text: parseTSessionString(input.body.arguments) ?? "" } })
  return { sessionID: input.sessionID, name, text: prompt.text, files: prompt.files, agents: prompt.agents, skills: prompt.skills, delivery: prompt.delivery, agent: prompt.agent, model: prompt.model }
}
