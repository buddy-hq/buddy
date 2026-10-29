import type { FormInfo, FormAnswer, OpenCodeEvent } from "@opencode/client"
import type { AgentQuestion } from "@buddy/agent-runtime/forms"
import type { McpInputRequestedEvent, McpInputSettledEvent } from "@buddy/agent-runtime/events"
import type { BuddyEvent } from "@buddy/transcript-contract/event"
import z from "zod"

type QuestionSettlement = { sessionID: string; requestID: string; answers?: string[][] }

const mcpInputMetadataSchema = z.object({
  kind: z.literal("mcp-elicitation"),
  server: z.string(),
  message: z.string().optional(),
})
const toolSchema = z.object({ messageID: z.string(), id: z.string() })
const MaxHiddenForms = 128
const MaxMcpInputRequests = 256

export function toBuddyQuestion(form: FormInfo): AgentQuestion | undefined {
  if (form.metadata?.kind !== "question" || form.sessionID === "global") return undefined
  if (form.fields.some((field) => field.type !== "string" && field.type !== "multiselect"))
    return undefined
  const tool = toolSchema.safeParse(form.metadata.tool)
  return {
    id: form.id,
    sessionID: form.sessionID,
    questions: form.fields.map((field) => ({
      question: field.description ?? "",
      header: field.title ?? "",
      options:
        "options" in field
          ? (field.options ?? []).map((option) => ({
              label: option.label,
              description: option.description ?? "",
            }))
          : [],
      multiple: field.type === "multiselect",
      custom: "custom" in field && field.custom === true,
    })),
    tool: tool.success ? { messageID: tool.data.messageID, callID: tool.data.id } : undefined,
  }
}

export function toFormAnswer(
  form: FormInfo,
  answers: readonly (readonly string[])[],
): { ok: true; answer: FormAnswer } | { ok: false; error: string } {
  if (!toBuddyQuestion(form) || answers.length !== form.fields.length)
    return { ok: false, error: "Answers must match the pending questions" }
  const answer: FormAnswer = {}
  for (const [index, field] of form.fields.entries()) {
    const values = answers[index] ?? []
    if (field.type !== "string" && field.type !== "multiselect")
      return { ok: false, error: "Unsupported question field" }
    if (field.type === "string" && values.length > 1)
      return { ok: false, error: "A single-choice question accepts one answer" }
    if (values.length === 0 && field.required !== true) continue
    const selections = values.map(
      (value) => field.options?.find((option) => option.label === value)?.value ?? value,
    )
    answer[field.key] = field.type === "multiselect" ? selections : (selections[0] ?? "")
  }
  return { ok: true, answer }
}

export function toBuddyQuestionEvent(
  event: OpenCodeEvent,
  directory: string,
  hiddenForms: Set<string>,
  mcpInputRequests: Set<string>,
): BuddyEvent | undefined {
  if (event.type === "form.created") {
    const form = event.data.form
    const mcpInput = mcpInputMetadataSchema.safeParse(form.metadata)
    if (mcpInput.success) {
      hiddenForms.delete(form.id)
      mcpInputRequests.add(form.id)
      while (mcpInputRequests.size > MaxMcpInputRequests) {
        const oldest = mcpInputRequests.values().next().value
        if (oldest === undefined) break
        mcpInputRequests.delete(oldest)
      }
      const payload: McpInputRequestedEvent = {
        type: "mcp.input.requested",
        properties: {
          requestID: form.id,
          server: mcpInput.data.server,
          toolPrefix: mcpInput.data.server.replace(/[^a-zA-Z0-9_-]/g, "_"),
        },
      }
      if (mcpInput.data.message !== undefined) payload.properties.message = mcpInput.data.message
      return { payload }
    }
    const question = toBuddyQuestion(event.data.form)
    if (question) {
      hiddenForms.delete(question.id)
      return { directory, payload: { type: "question.asked", properties: question } }
    }
    hiddenForms.add(event.data.form.id)
    while (hiddenForms.size > MaxHiddenForms) {
      const first = hiddenForms.values().next().value
      if (first === undefined) break
      hiddenForms.delete(first)
    }
    return undefined
  }
  if (event.type !== "form.replied" && event.type !== "form.cancelled") return undefined
  if (mcpInputRequests.delete(event.data.id)) {
    const payload: McpInputSettledEvent = {
      type: "mcp.input.settled",
      properties: { requestID: event.data.id },
    }
    return { payload }
  }
  if (event.data.sessionID === "global") return undefined
  if (hiddenForms.has(event.data.id)) return undefined
  const properties: QuestionSettlement = {
    sessionID: event.data.sessionID,
    requestID: event.data.id,
  }
  if (event.type === "form.replied") {
    const answers: string[][] = []
    for (const [key, value] of Object.entries(event.data.answer)) {
      if (!/^q\d+$/u.test(key)) continue
      const index = Number(key.slice(1))
      while (answers.length <= index) answers.push([])
      answers[index] = Array.isArray(value) ? value : [String(value)]
    }
    properties.answers = answers
  }
  return {
    directory,
    payload: {
      type: event.type === "form.replied" ? "question.replied" : "question.rejected",
      properties,
    },
  }
}
