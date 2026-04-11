import { promises as fs } from "node:fs"
import matter from "gray-matter"
import z from "zod"
import { ModelID, ProviderID } from "@buddy/opencode-adapter/id"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import { Provider } from "@buddy/opencode-adapter/provider"
import {
  RESOURCE_PACK_STATUS_READY,
  estimateTokenCountFromText,
  resolveResourcePackFullTextMetadata,
} from "../../../../../resource-packs"
import { listRegisteredResources } from "../../../../../resources/resource-registry-service"
import { createBuddyTool } from "../../../../tools/create-buddy-tool"

const MINIMUM_SPARE_AFTER_INGESTION_TOKENS = 100_000
const MINIMUM_OUTPUT_RESERVE_TOKENS = 8_000
const SAFETY_RESERVE_TOKENS = 12_000

const ResourceIngestFullTextParameters = z.object({
  resource: z
    .string()
    .min(1)
    .describe("Resource alias or ID to ingest into context from its prepared full-text file."),
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

async function resolveActiveModel(messages: MessageV2.WithParts[], extra: unknown) {
  const direct = ActiveModelSchema.safeParse(extra)
  if (direct.success) {
    return direct.data
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.info.role !== "user") continue

    const model = await Provider.getModel(
      ProviderID.make(message.info.model.providerID),
      ModelID.make(message.info.model.modelID),
    ).catch(() => undefined)
    if (model) return model
  }

  return undefined
}

function resolveContextBudget(input: {
  model: z.infer<typeof ActiveModelSchema>
  messages: MessageV2.WithParts[]
}) {
  const inputWindow = input.model.limit.input ?? input.model.limit.context
  const contextWindow = input.model.limit.context
  const outputReserve = Math.max(
    readOptionalNumber(input.model.limit.output) ?? 0,
    MINIMUM_OUTPUT_RESERVE_TOKENS,
  )
  const reserve = Math.max(
    MINIMUM_SPARE_AFTER_INGESTION_TOKENS,
    outputReserve + SAFETY_RESERVE_TOKENS,
  )
  const latestAssistantTotal = lastAssistantTokenTotal(input.messages)
  const messageHistoryEstimate = estimateMessageHistoryTokens(input.messages)
  const liveUsageEstimate = Math.max(latestAssistantTotal, messageHistoryEstimate)

  return {
    inputWindow,
    contextWindow,
    outputReserve,
    reserve,
    latestAssistantTotal,
    messageHistoryEstimate,
    liveUsageEstimate,
    remainingBeforeIngestion: Math.max(inputWindow - liveUsageEstimate, 0),
  }
}

function formatBudgetFailure(input: {
  resource: string
  fullTextTokens: number
  budget: ReturnType<typeof resolveContextBudget>
  model: z.infer<typeof ActiveModelSchema>
}) {
  const remainingAfterIngestion = input.budget.remainingBeforeIngestion - input.fullTextTokens
  return [
    `Cannot ingest full text for resource "${input.resource}" because the live session context is too full.`,
    `Model: ${input.model.providerID}/${input.model.id}`,
    `Input window: ${input.budget.inputWindow.toLocaleString()} tokens`,
    `Current live usage estimate: ${input.budget.liveUsageEstimate.toLocaleString()} tokens`,
    `Remaining before ingestion: ${input.budget.remainingBeforeIngestion.toLocaleString()} tokens`,
    `Full text estimate: ${input.fullTextTokens.toLocaleString()} tokens`,
    `Required reserve after ingestion: ${input.budget.reserve.toLocaleString()} tokens`,
    `Remaining after ingestion would be: ${remainingAfterIngestion.toLocaleString()} tokens`,
    "Use scoped reading instead of full-text ingestion in this session.",
  ].join("\n")
}

export const pedagogyResourceIngestFullTextTool = createBuddyTool(
  "pedagogy_resource_ingest_full_text",
  {
    description:
      "Load a resource's prepared full text into context after checking live session headroom against the active model limits.",
    parameters: ResourceIngestFullTextParameters,
    async execute(params, ctx) {
      await ctx.ask({
        permission: "pedagogy_resource_ingest_full_text",
        patterns: [params.resource],
        always: [params.resource],
        metadata: {},
      })

      const resources = await listRegisteredResources(ctx.directory)
      const resource = resources.find(
        (entry) => entry.alias === params.resource || entry.id === params.resource,
      )
      if (!resource) {
        throw new Error(`Resource not found: ${params.resource}`)
      }
      if (resource.status !== RESOURCE_PACK_STATUS_READY || !resource.packKey) {
        throw new Error(
          `Resource "${resource.alias}" is not ready for full-text ingestion. Current status: ${resource.status}.`,
        )
      }

      const fullTextMetadata = await resolveResourcePackFullTextMetadata({
        directory: ctx.directory,
        packKey: resource.packKey,
      })
      if (!fullTextMetadata) {
        throw new Error(`Resource "${resource.alias}" does not expose a prepared full-text file.`)
      }

      const model = await resolveActiveModel(ctx.messages, ctx.extra?.model)
      if (!model) {
        throw new Error("Could not resolve the active model for full-text ingestion.")
      }

      const fullTextSource = await fs.readFile(fullTextMetadata.fullTextAbsolutePath, "utf8")
      const parsed = matter(fullTextSource)
      const fullText = parsed.content.trim()
      if (!fullText) {
        throw new Error(`Prepared full text for resource "${resource.alias}" is empty.`)
      }

      const fullTextTokens =
        readOptionalNumber(parsed.data.est_tokens) ??
        fullTextMetadata.fullTextEstTokens ??
        estimateTokenCountFromText(fullText)

      const budget = resolveContextBudget({
        model,
        messages: ctx.messages,
      })
      const remainingAfterIngestion = budget.remainingBeforeIngestion - fullTextTokens
      if (remainingAfterIngestion < budget.reserve) {
        throw new Error(
          formatBudgetFailure({
            resource: resource.alias,
            fullTextTokens,
            budget,
            model,
          }),
        )
      }

      const output = [
        `<resource_full_text_ingestion resource="${resource.alias}" completed="true">`,
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
        </buddy_system_reminder>
        `,
        "</resource_full_text_ingestion>",
      ].join("\n")

      return {
        title: "pedagogy_resource_ingest_full_text",
        output,
        metadata: {
          resource: resource.alias,
          completed: true,
          model: `${model.providerID}/${model.id}`,
          inputWindow: budget.inputWindow,
          contextWindow: budget.contextWindow,
          liveUsageEstimate: budget.liveUsageEstimate,
          remainingBeforeIngestion: budget.remainingBeforeIngestion,
          remainingAfterIngestion,
          fullTextEstTokens: fullTextTokens,
          truncated: false,
        },
      }
    },
  },
)
