import type { FormInfo, FormAnswer, OpenCodeEvent } from "@opencode/client"
import type { BuddyEvent } from "@buddy/transcript-contract/event"
import z from "zod"

type QuestionSettlement = { sessionID: string; requestID: string; answers?: string[][] }

const toolSchema = z.object({ messageID: z.string(), id: z.string() })

export type BuddyQuestion = {
  id: string
  sessionID: string
  questions: { question: string; header: string; options: { label: string; description: string }[]; multiple: boolean; custom: boolean }[]
  tool?: { messageID: string; callID: string }
}

export function toBuddyQuestion(form: FormInfo): BuddyQuestion | undefined {
  if (form.metadata?.kind !== "question" || form.sessionID === "global") return undefined
  if (form.fields.some((field) => field.type !== "string" && field.type !== "multiselect")) return undefined
  const tool = toolSchema.safeParse(form.metadata.tool)
  return {
    id: form.id,
    sessionID: form.sessionID,
    questions: form.fields.map((field) => ({
      question: field.description ?? "",
      header: field.title ?? "",
      options: "options" in field ? (field.options ?? []).map((option) => ({ label: option.label, description: option.description ?? "" })) : [],
      multiple: field.type === "multiselect",
      custom: "custom" in field && field.custom === true,
    })),
    tool: tool.success ? { messageID: tool.data.messageID, callID: tool.data.id } : undefined,
  }
}

export function toFormAnswer(form: FormInfo, answers: readonly (readonly string[])[]): { ok: true; answer: FormAnswer } | { ok: false; error: string } {
  if (!toBuddyQuestion(form) || answers.length !== form.fields.length) return { ok: false, error: "Answers must match the pending questions" }
  const answer: FormAnswer = {}
  for (const [index, field] of form.fields.entries()) {
    const values = answers[index] ?? []
    if (field.type !== "string" && field.type !== "multiselect") return { ok: false, error: "Unsupported question field" }
    if (field.type === "string" && values.length > 1) return { ok: false, error: "A single-choice question accepts one answer" }
    if (values.length === 0 && field.required !== true) continue
    const selections = values.map((value) => field.options?.find((option) => option.label === value)?.value ?? value)
    answer[field.key] = field.type === "multiselect" ? selections : selections[0] ?? ""
  }
  return { ok: true, answer }
}

export function toBuddyQuestionEvent(event: OpenCodeEvent, directory: string): BuddyEvent | undefined {
  if (event.type === "form.created") {
    const question = toBuddyQuestion(event.data.form)
    return question ? { directory, payload: { type: "question.asked", properties: question } } : undefined
  }
  if (event.type !== "form.replied" && event.type !== "form.cancelled") return undefined
  if (event.data.sessionID === "global") return undefined
  const properties: QuestionSettlement = { sessionID: event.data.sessionID, requestID: event.data.id }
  if (event.type === "form.replied") {
    properties.answers = Object.entries(event.data.answer)
      .filter(([key]) => /^q\d+$/u.test(key))
      .toSorted(([left], [right]) => Number(left.slice(1)) - Number(right.slice(1)))
      .map(([, value]) => Array.isArray(value) ? value : [String(value)])
  }
  return {
    directory,
    payload: {
      type: event.type === "form.replied" ? "question.replied" : "question.rejected",
      properties,
    },
  }
}
