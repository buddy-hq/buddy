import { jsonSchema, streamText, tool, type LanguageModelUsage } from "ai"
import { Effect } from "effect"
import * as OpenCodeSession from "opencode/session/session"
import * as OpenCodeProvider from "opencode/provider/provider"
import * as ProviderTransform from "opencode/provider/transform"
import { makeRuntime } from "opencode/effect/run-service"
import { withCurrentInstance } from "./effect-runtime"
import type { Provider } from "./provider"

const runtime = makeRuntime(OpenCodeProvider.Service, OpenCodeProvider.defaultLayer)

type SmallTextInput = {
  sessionID: string
  messageID: string
  providerID: string
  modelID: string
  model: Provider.Model
  system: string
  prompt: string
  retries?: number
  timeoutMs?: number
}

type StructuredTextInput = SmallTextInput & {
  schema: Record<string, unknown>
}

type SmallTextResult = {
  text: string
  providerID: string
  modelID: string
  usage?: SmallTextUsage
}

type SmallTextUsage = {
  cost: number
  tokens: {
    total?: number
    input: number
    output: number
    reasoning: number
    cache: {
      read: number
      write: number
    }
  }
}

type StructuredTextResult = SmallTextResult & {
  structured: unknown
}

const DEFAULT_RETRIES = 1
const DEFAULT_SMALL_TEXT_TIMEOUT_MS = 45_000
const STRUCTURED_OUTPUT_SYSTEM_PROMPT =
  "IMPORTANT: The user has requested structured output. You MUST use the StructuredOutput tool to provide your final response. Do NOT respond with plain text."

type ProviderMetadataInput = Parameters<typeof OpenCodeSession.getUsage>[0]["metadata"]

type ModelOptions = Record<string, unknown>

function buildSmallModelHeaders(input: SmallTextInput): Record<string, string> {
  return {
    "x-session-affinity": input.sessionID,
    ...input.model.headers,
  }
}

function normalizeUsage(input: {
  model: Provider.Model
  usage: LanguageModelUsage
  providerMetadata?: ProviderMetadataInput
}): SmallTextUsage {
  const usage = {
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    totalTokens: input.usage.totalTokens,
    reasoningTokens: input.usage.outputTokenDetails?.reasoningTokens ?? input.usage.reasoningTokens,
    cachedInputTokens: input.usage.cachedInputTokens,
    inputTokenDetails: input.usage.inputTokenDetails,
    outputTokenDetails: input.usage.outputTokenDetails,
    cacheReadInputTokens:
      input.usage.inputTokenDetails?.cacheReadTokens ?? input.usage.cachedInputTokens,
    cacheWriteInputTokens: input.usage.inputTokenDetails?.cacheWriteTokens,
    nonCachedInputTokens:
      input.usage.inputTokens === undefined
        ? undefined
        : Math.max(
            0,
            input.usage.inputTokens -
              (input.usage.inputTokenDetails?.cacheReadTokens ??
                input.usage.cachedInputTokens ??
                0) -
              (input.usage.inputTokenDetails?.cacheWriteTokens ?? 0),
          ),
    providerMetadata: input.providerMetadata,
    visibleOutputTokens: Math.max(
      0,
      (input.usage.outputTokens ?? 0) -
        (input.usage.outputTokenDetails?.reasoningTokens ?? input.usage.reasoningTokens ?? 0),
    ),
  }

  return OpenCodeSession.getUsage({
    model: input.model,
    usage,
    metadata: input.providerMetadata,
  })
}

async function generateSmallText(input: SmallTextInput): Promise<SmallTextResult> {
  return runtime.runPromise((svc) =>
    withCurrentInstance(
      Effect.gen(function* () {
        const languageModel = yield* svc.getLanguage(input.model)
        const options: ModelOptions = {
          ...ProviderTransform.smallOptions(input.model),
          ...input.model.options,
        }
        const messages = ProviderTransform.message(
          [{ role: "user", content: input.prompt }],
          input.model,
          options,
        )
        const timeoutMessage = "Small model text generation timed out"
        const controller = new AbortController()
        const timer = setTimeout(
          () => controller.abort(new Error(timeoutMessage)),
          input.timeoutMs ?? DEFAULT_SMALL_TEXT_TIMEOUT_MS,
        )

        try {
          const result = streamText({
            model: languageModel,
            system: input.system,
            messages,
            providerOptions: ProviderTransform.providerOptions(input.model, options),
            headers: buildSmallModelHeaders(input),
            maxRetries: input.retries ?? DEFAULT_RETRIES,
            abortSignal: controller.signal,
            toolChoice: "none",
          })

          const [text, rawUsage, providerMetadata] = yield* Effect.promise(() =>
            Promise.all([result.text, result.totalUsage, result.providerMetadata]),
          )

          return {
            text,
            providerID: input.model.providerID,
            modelID: input.model.id,
            usage: normalizeUsage({
              model: input.model,
              usage: rawUsage,
              providerMetadata,
            }),
          }
        } finally {
          clearTimeout(timer)
        }
      }),
    ),
  )
}

async function generateStructuredText(input: StructuredTextInput): Promise<StructuredTextResult> {
  let structured: unknown
  const { text, usage } = await runtime.runPromise((svc) =>
    withCurrentInstance(
      Effect.gen(function* () {
        const languageModel = yield* svc.getLanguage(input.model)
        const options: ModelOptions = {
          ...ProviderTransform.smallOptions(input.model),
          ...input.model.options,
        }
        const messages = ProviderTransform.message(
          [{ role: "user", content: input.prompt }],
          input.model,
          options,
        )
        const timeoutMessage = "Small model structured generation timed out"
        const controller = new AbortController()
        const timer = setTimeout(
          () => controller.abort(new Error(timeoutMessage)),
          input.timeoutMs ?? DEFAULT_SMALL_TEXT_TIMEOUT_MS,
        )

        try {
          const result = streamText({
            model: languageModel,
            system: [input.system, STRUCTURED_OUTPUT_SYSTEM_PROMPT].join("\n"),
            messages,
            providerOptions: ProviderTransform.providerOptions(input.model, options),
            headers: buildSmallModelHeaders(input),
            maxRetries: input.retries ?? DEFAULT_RETRIES,
            abortSignal: controller.signal,
            toolChoice: "required",
            tools: {
              StructuredOutput: tool({
                description: "Return the final answer using the required JSON schema.",
                inputSchema: jsonSchema(input.schema),
                execute: async (output) => {
                  structured = output
                  return {
                    ok: true,
                  }
                },
              }),
            },
          })

          const [text, rawUsage, providerMetadata] = yield* Effect.promise(() =>
            Promise.all([result.text, result.totalUsage, result.providerMetadata]),
          )

          return {
            text,
            usage: normalizeUsage({
              model: input.model,
              usage: rawUsage,
              providerMetadata,
            }),
          }
        } finally {
          clearTimeout(timer)
        }
      }),
    ),
  )

  if (structured === undefined) {
    // Fallback: some models return JSON as plain text instead of using the tool
    const extracted = extractJsonFromText(text)
    if (extracted !== undefined) {
      structured = extracted
    } else {
      throw new Error("Model did not produce structured output")
    }
  }

  return {
    text,
    structured,
    providerID: input.model.providerID,
    modelID: input.model.id,
    ...(usage ? { usage } : {}),
  }
}

function extractJsonFromText(text: string): unknown | undefined {
  if (!text || text.trim().length === 0) return undefined

  // Try to find JSON in markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1])
    } catch {
      // ignore parse error, try other methods
    }
  }

  // Try to find JSON object directly in the text
  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0])
    } catch {
      // ignore parse error
    }
  }

  // Try the whole text as JSON
  try {
    return JSON.parse(text.trim())
  } catch {
    return undefined
  }
}

export const LLM = {
  generateSmallText,
  generateStructuredText,
}

export type {
  SmallTextInput,
  SmallTextResult,
  SmallTextUsage,
  StructuredTextInput,
  StructuredTextResult,
}
