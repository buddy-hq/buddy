import RESOURCE_INGEST_FULL_TEXT_DESCRIPTION from "./ingest-full-text.md"
import { promises as fs } from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import z from "zod"
import { ModelID, ProviderID } from "@buddy/opencode-adapter/id"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import { Provider } from "@buddy/opencode-adapter/provider"
import { RESOURCE_PACK_STATUS_READY, estimateTokenCountFromText } from "../../../../resource-packs"
import { resolveResourceObjectByKey } from "../../../../resources/resource-registry-service"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"

// Full-text ingestion fills the next model request with prepared source text, so the
// relevant capacity is the model's usable input window: `limit.input` when the
// provider publishes one, otherwise `limit.context`. Some providers publish a
// smaller input window than context, and some publish very large output limits;
// output limit is a generation ceiling, not the amount of post-ingest prompt
// space Buddy needs to reserve for continued reading work.
const POST_FULL_TEXT_INGEST_RESERVE_RATIO = 0.25

// Below 48k leftover input tokens, a full-text-loaded session tends to become
// cramped for Buddy's instructions, recent chat, tool metadata, citations, and
// follow-up reading. This is intentionally a teaching-workflow floor, not a
// prediction of a fixed number of future turns.
const MINIMUM_POST_FULL_TEXT_INGEST_CONTEXT_TOKENS = 48_000

// Above 96k leftover input tokens, demanding more reserve mostly blocks useful
// whole-resource workflows on large-context models. The cap prevents million-token
// models from reserving hundreds of thousands of tokens just because they can.
const MAXIMUM_POST_FULL_TEXT_INGEST_CONTEXT_TOKENS = 96_000

const FULL_TEXT_TOOL_MAX_OUTPUT_LINES = 500_000
const FULL_TEXT_TOOL_MAX_OUTPUT_BYTES = 5_000_000
const INGEST_FULL_TEXT_REASON_CONTEXT_TOO_FULL = "context_too_full"
const INGEST_FULL_TEXT_FALLBACK_SCOPED_READING = "scoped_reading"

const ResourceIngestFullTextParameters = z.object({
  resourceKey: z
    .string()
    .min(1)
    .describe(
      "Resource objectID or alias to ingest into context from its prepared full-text file.",
    ),
})

const ActiveModelSchema = z.object({
  providerID: z.string(),
  id: z.string(),
  limit: z.object({
    context: z.number(),
    input: z.number().optional(),
    output: z.number().optional(),
  }),
})

function readOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readModelLimit(value: unknown) {
  if (!isRecord(value)) return undefined
  const context = readOptionalNumber(value.context)
  if (context === undefined) return undefined
  return {
    context,
    input: readOptionalNumber(value.input),
    output: readOptionalNumber(value.output),
  }
}

function normalizeActiveModel(value: unknown): z.infer<typeof ActiveModelSchema> | undefined {
  const direct = ActiveModelSchema.safeParse(value)
  if (direct.success) {
    return direct.data
  }

  if (!isRecord(value)) return undefined

  const limit = readModelLimit(value.limit)
  if (!limit) return undefined

  const providerID = value.providerID
  const modelID = value.id ?? value.modelID
  if (typeof providerID !== "string" || typeof modelID !== "string") {
    return undefined
  }

  return {
    providerID,
    id: modelID,
    limit,
  }
}

function assistantTokenTotal(message: MessageV2.Assistant) {
  return (
    message.tokens.total ??
    message.tokens.input +
      message.tokens.output +
      message.tokens.reasoning +
      message.tokens.cache.read +
      message.tokens.cache.write
  )
}

function lastAssistantTokenTotal(messages: MessageV2.WithParts[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.info.role !== "assistant") continue
    const total = assistantTokenTotal(message.info)
    if (total > 0) {
      return total
    }
  }
  return 0
}

function extractMessageText(message: MessageV2.WithParts) {
  const segments: string[] = []

  if (message.info.role === "user") {
    if (message.info.system) segments.push(message.info.system)
  }

  for (const part of message.parts) {
    switch (part.type) {
      case "text":
      case "reasoning":
        segments.push(part.text)
        break
      case "tool":
        if (part.state.status === "completed") {
          segments.push(part.state.output)
        } else if (part.state.status === "error") {
          segments.push(part.state.error)
        } else {
          segments.push(JSON.stringify(part.state.input))
        }
        break
      case "subtask":
        segments.push(part.prompt)
        segments.push(part.description)
        break
      case "agent":
        segments.push(part.name)
        if (part.source?.value) segments.push(part.source.value)
        break
      case "file":
        if (part.filename) segments.push(part.filename)
        if (part.source?.text?.value) segments.push(part.source.text.value)
        break
      default:
        break
    }
  }

  return segments.join("\n")
}

function estimateMessageHistoryTokens(messages: MessageV2.WithParts[]) {
  const serialized = messages.map((message) => extractMessageText(message)).join("\n\n")
  return estimateTokenCountFromText(serialized)
}

function clampPostFullTextIngestReserve(value: number) {
  return Math.min(
    Math.max(value, MINIMUM_POST_FULL_TEXT_INGEST_CONTEXT_TOKENS),
    MAXIMUM_POST_FULL_TEXT_INGEST_CONTEXT_TOKENS,
  )
}

async function resolveActiveModel(messages: MessageV2.WithParts[], extra: unknown) {
  const fromExtra = normalizeActiveModel(extra)
  if (fromExtra) {
    return fromExtra
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.info.role !== "user") continue

    const model = await Provider.getModel(
      ProviderID.make(message.info.model.providerID),
      ModelID.make(message.info.model.modelID),
    ).catch(() => undefined)
    if (model) {
      return normalizeActiveModel(model)
    }
  }

  return undefined
}

function resolveContextBudget(input: {
  model: z.infer<typeof ActiveModelSchema>
  messages: MessageV2.WithParts[]
}) {
  const inputWindow = input.model.limit.input ?? input.model.limit.context
  const contextWindow = input.model.limit.context
  const reserve = clampPostFullTextIngestReserve(inputWindow * POST_FULL_TEXT_INGEST_RESERVE_RATIO)
  const latestAssistantTotal = lastAssistantTokenTotal(input.messages)
  const messageHistoryEstimate = estimateMessageHistoryTokens(input.messages)
  const liveUsageEstimate = Math.max(latestAssistantTotal, messageHistoryEstimate)

  return {
    inputWindow,
    contextWindow,
    reserve,
    latestAssistantTotal,
    messageHistoryEstimate,
    liveUsageEstimate,
    remainingBeforeIngestion: Math.max(inputWindow - liveUsageEstimate, 0),
  }
}

function formatBudgetFallbackOutput(input: {
  objectID: string
  resource: string
  packPath: string | null
  fullTextPath: string
  fullTextTokens: number
  budget: ReturnType<typeof resolveContextBudget>
  model: z.infer<typeof ActiveModelSchema>
}) {
  const remainingAfterIngestion = input.budget.remainingBeforeIngestion - input.fullTextTokens
  return [
    `<resource_full_text_ingestion resource="${input.resource}" completed="false" reason="${INGEST_FULL_TEXT_REASON_CONTEXT_TOO_FULL}">`,
    `object_kind=resource`,
    `object_id=${input.objectID}`,
    `alias=${input.resource}`,
    `pack=${input.packPath ?? "none"}`,
    `full_text=${input.fullTextPath}`,
    `Model: ${input.model.providerID}/${input.model.id}`,
    `Input window: ${input.budget.inputWindow.toLocaleString()} tokens`,
    `Current live usage estimate: ${input.budget.liveUsageEstimate.toLocaleString()} tokens`,
    `Remaining before ingestion: ${input.budget.remainingBeforeIngestion.toLocaleString()} tokens`,
    `Full text estimate: ${input.fullTextTokens.toLocaleString()} tokens`,
    `Required reserve after ingestion: ${input.budget.reserve.toLocaleString()} tokens`,
    `Remaining after ingestion would be: ${remainingAfterIngestion.toLocaleString()} tokens`,
    `<buddy_system_reminder>
Full text is too large for live ingestion in this session. Continue with scoped reading from pack, using TOC, chunks, pages, or focused full-text sections as needed. Do not retry ingest_full_text unless the model or context window changes.
</buddy_system_reminder>`,
    "</resource_full_text_ingestion>",
  ].join("\n")
}

export const ingestFullTextTool = createBuddyTool({
  id: "ingest_full_text",
  description: RESOURCE_INGEST_FULL_TEXT_DESCRIPTION,
  parameters: ResourceIngestFullTextParameters,
  presentation: {
    archetype: "inline-output",
    icon: "file",
    renderer: "full-text",
    layoutRole: "card-output",
    collection: "full-text-collection",
    phases: {
      pending: {
        action: "Loading full text",
        detail: ({ input }) =>
          typeof input.resourceKey === "string" ? input.resourceKey : undefined,
      },
      running: {
        action: "Loading full text",
        detail: ({ input }) =>
          typeof input.resourceKey === "string" ? input.resourceKey : undefined,
      },
      completed: {
        action: "Loaded full text",
        detail: ({ input }) =>
          typeof input.resourceKey === "string" ? input.resourceKey : undefined,
      },
      error: {
        action: "Failed to load full text",
        detail: ({ input }) =>
          typeof input.resourceKey === "string" ? input.resourceKey : undefined,
      },
    },
    resolveSilentOutcome: ({ phase, metadata }) =>
      phase === "completed" &&
      metadata.reason === INGEST_FULL_TEXT_REASON_CONTEXT_TOO_FULL &&
      metadata.fallback === INGEST_FULL_TEXT_FALLBACK_SCOPED_READING
        ? "scoped-reading-fallback"
        : undefined,
  },
  output: {
    maxLines: FULL_TEXT_TOOL_MAX_OUTPUT_LINES,
    maxBytes: FULL_TEXT_TOOL_MAX_OUTPUT_BYTES,
  },
  async execute(params, ctx) {
    await ctx.ask({
      permission: "ingest_full_text",
      patterns: [params.resourceKey],
      always: [params.resourceKey],
      metadata: {},
    })

    const resource = await resolveResourceObjectByKey({
      directory: ctx.directory,
      resourceKey: params.resourceKey,
    })
    if (resource.status !== RESOURCE_PACK_STATUS_READY) {
      throw new Error(
        `Resource "${resource.alias}" is not ready for full-text ingestion. Current status: ${resource.status}.`,
      )
    }

    if (!resource.fullTextPath) {
      throw new Error(`Resource "${resource.alias}" does not expose a prepared full-text file.`)
    }

    const model = await resolveActiveModel(ctx.messages, ctx.extra?.model)
    if (!model) {
      throw new Error("Could not resolve the active model for full-text ingestion.")
    }

    const fullTextSource = await fs.readFile(
      path.resolve(ctx.directory, resource.fullTextPath),
      "utf8",
    )
    const parsed = matter(fullTextSource)
    const fullText = parsed.content.trim()
    if (!fullText) {
      throw new Error(`Prepared full text for resource "${resource.alias}" is empty.`)
    }

    const fullTextTokens =
      readOptionalNumber(parsed.data.est_tokens) ??
      resource.fullTextEstimatedTokens ??
      estimateTokenCountFromText(fullText)

    const budget = resolveContextBudget({
      model,
      messages: ctx.messages,
    })
    const remainingAfterIngestion = budget.remainingBeforeIngestion - fullTextTokens
    if (remainingAfterIngestion < budget.reserve) {
      return {
        title: "ingest_full_text",
        output: formatBudgetFallbackOutput({
          objectID: resource.objectID,
          resource: resource.alias,
          packPath: resource.packPath,
          fullTextPath: resource.fullTextPath,
          fullTextTokens,
          budget,
          model,
        }),
        metadata: {
          objectID: resource.objectID,
          resource: resource.alias,
          alias: resource.alias,
          completed: false,
          reason: INGEST_FULL_TEXT_REASON_CONTEXT_TOO_FULL,
          fallback: INGEST_FULL_TEXT_FALLBACK_SCOPED_READING,
          packPath: resource.packPath,
          fullTextPath: resource.fullTextPath,
          fullTextEstimatedTokens: fullTextTokens,
          model: `${model.providerID}/${model.id}`,
          inputWindow: budget.inputWindow,
          contextWindow: budget.contextWindow,
          liveUsageEstimate: budget.liveUsageEstimate,
          remainingBeforeIngestion: budget.remainingBeforeIngestion,
          remainingAfterIngestion,
          requiredReserveAfterIngestion: budget.reserve,
          truncated: false,
        },
      }
    }

    const output = [
      `<resource_full_text_ingestion resource="${resource.alias}" completed="true">`,
      `object_kind=resource`,
      `object_id=${resource.objectID}`,
      `alias=${resource.alias}`,
      `full_text=${resource.fullTextPath}`,
      `model=${model.providerID}/${model.id}`,
      `input_window=${budget.inputWindow}`,
      `context_window=${budget.contextWindow}`,
      `live_usage_estimate=${budget.liveUsageEstimate}`,
      `latest_assistant_total=${budget.latestAssistantTotal}`,
      `message_history_estimate=${budget.messageHistoryEstimate}`,
      `remaining_before_ingestion=${budget.remainingBeforeIngestion}`,
      `full_text_est_tokens=${fullTextTokens}`,
      `required_reserve_after_ingestion=${budget.reserve}`,
      `remaining_after_ingestion=${remainingAfterIngestion}`,
      "<full_text>",
      fullText,
      "</full_text>",
      `<buddy_system_reminder>
        Now that you have the full text of ${resource.alias}, you don't need to read individual chunks of this resource again. You can answer the questions about this resource from memory.
        Only exception is when the user explicly asks you to read a specific chunk or when you need to reference a specific location in the text.
        <caution>
        Long Response Caution: default to responding in Buddy's normal style — 1-4 sentences, ~15-60 words per turn, WhatsApp-style, casual. Break this rule only when the user is explicitly demanding something verbose. Answer only the user's actual question.
        </caution>
        </buddy_system_reminder>
        `,
      "</resource_full_text_ingestion>",
    ].join("\n")

    return {
      title: "ingest_full_text",
      output,
      metadata: {
        objectID: resource.objectID,
        resource: resource.alias,
        alias: resource.alias,
        completed: true,
        fullTextPath: resource.fullTextPath,
        fullTextEstimatedTokens: fullTextTokens,
        model: `${model.providerID}/${model.id}`,
        inputWindow: budget.inputWindow,
        contextWindow: budget.contextWindow,
        liveUsageEstimate: budget.liveUsageEstimate,
        remainingBeforeIngestion: budget.remainingBeforeIngestion,
        remainingAfterIngestion,
        truncated: false,
      },
    }
  },
})
