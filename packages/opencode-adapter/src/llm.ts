import { Effect } from "effect"
import * as Stream from "effect/Stream"
import * as OpenCodeLLM from "opencode/session/llm"
import * as OpenCodeSession from "opencode/session/session"
import { createStructuredOutputTool } from "opencode/session/prompt"
import { makeRuntime } from "opencode/effect/run-service"
import { withCurrentInstance } from "./effect-runtime"
import { MessageID, ModelID, ProviderID, SessionID } from "./id"
import { Permission } from "./permission"
import type { Provider } from "./provider"

const runtime = makeRuntime(OpenCodeLLM.Service, OpenCodeLLM.defaultLayer)

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

const LEARNER_MEMORY_AGENT_NAME = "learner-memory"
const DEFAULT_RETRIES = 1
const DEFAULT_SMALL_TEXT_TIMEOUT_MS = 45_000
const STRUCTURED_OUTPUT_SYSTEM_PROMPT =
  "IMPORTANT: The user has requested structured output. You MUST use the StructuredOutput tool to provide your final response. Do NOT respond with plain text."

function learnerMemoryAgent(): OpenCodeLLM.StreamInput["agent"] {
  return {
    name: LEARNER_MEMORY_AGENT_NAME,
    description: "Extract durable learner memory candidates.",
    mode: "primary",
    permission: Permission.fromConfig({ "*": "deny" }),
    options: {},
  }
}

function learnerMemoryUser(input: SmallTextInput): OpenCodeLLM.StreamInput["user"] {
  return {
    id: MessageID.make(input.messageID),
    sessionID: SessionID.make(input.sessionID),
    role: "user",
    time: {
      created: Date.now(),
    },
    agent: LEARNER_MEMORY_AGENT_NAME,
    model: {
      providerID: ProviderID.make(input.providerID),
      modelID: ModelID.make(input.modelID),
    },
  }
}

async function generateSmallText(input: SmallTextInput): Promise<SmallTextResult> {
  let text = ""
  let usage: SmallTextUsage | undefined
  await runtime.runPromise((svc) =>
    withCurrentInstance(
      svc
        .stream({
          user: learnerMemoryUser(input),
          sessionID: input.sessionID,
          agent: learnerMemoryAgent(),
          model: input.model,
          system: [input.system],
          messages: [{ role: "user", content: input.prompt }],
          small: true,
          tools: {},
          toolChoice: "none",
          retries: input.retries ?? DEFAULT_RETRIES,
        })
        .pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              if (event.type === "text-delta") {
                text += event.text
              }
              if (event.type === "finish-step") {
                usage = OpenCodeSession.getUsage({
                  model: input.model,
                  usage: event.usage,
                  metadata: event.providerMetadata,
                })
              }
            }),
          ),
          Effect.timeoutOrElse({
            duration: input.timeoutMs ?? DEFAULT_SMALL_TEXT_TIMEOUT_MS,
            orElse: () => Effect.die(new Error("Small model text generation timed out")),
          }),
          Effect.orDie,
        ),
    ),
  )

  return {
    text,
    providerID: input.model.providerID,
    modelID: input.model.id,
    ...(usage ? { usage } : {}),
  }
}

async function generateStructuredText(input: StructuredTextInput): Promise<StructuredTextResult> {
  let text = ""
  let usage: SmallTextUsage | undefined
  let structured: unknown
  await runtime.runPromise((svc) =>
    withCurrentInstance(
      svc
        .stream({
          user: learnerMemoryUser(input),
          sessionID: input.sessionID,
          agent: learnerMemoryAgent(),
          model: input.model,
          system: [input.system, STRUCTURED_OUTPUT_SYSTEM_PROMPT],
          messages: [{ role: "user", content: input.prompt }],
          small: true,
          tools: {
            StructuredOutput: createStructuredOutputTool({
              schema: input.schema,
              onSuccess(output) {
                structured = output
              },
            }),
          },
          toolChoice: "required",
          retries: input.retries ?? DEFAULT_RETRIES,
        })
        .pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              if (event.type === "text-delta") {
                text += event.text
              }
              if (event.type === "finish-step") {
                usage = OpenCodeSession.getUsage({
                  model: input.model,
                  usage: event.usage,
                  metadata: event.providerMetadata,
                })
              }
            }),
          ),
          Effect.timeoutOrElse({
            duration: input.timeoutMs ?? DEFAULT_SMALL_TEXT_TIMEOUT_MS,
            orElse: () => Effect.die(new Error("Small model structured generation timed out")),
          }),
          Effect.orDie,
        ),
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
