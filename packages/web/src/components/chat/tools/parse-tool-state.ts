import { z } from "zod"
import type { FileChange, ToolOutcome, ToolQuestion, ToolSummary, ToolTodo } from "@buddy/transcript-contract/message"
import {
  EMPTY_JSON_OBJECT,
  parseTJsonObject,
  parseTNumber,
  parseTString,
  readNonEmptyString,
  type TJsonObject,
  type TJsonValue,
  type ToolAttachment,
  type ToolShell,
} from "../tools/types"
import { toToolStatus } from "../utils/tool"
import type { ToolState } from "./registry"
import type { MessagePart } from "@/state/chat-types"

const countSchema = z.int().nonnegative()

const fileChangesSchema = z.array(
  z.object({
    path: z.string().optional(),
    relativePath: z.string().optional(),
    kind: z.enum(["add", "update", "delete", "move"]).optional(),
    patch: z.string().optional(),
    before: z.string().optional(),
    after: z.string().optional(),
    content: z.string().optional(),
    additions: countSchema.optional(),
    deletions: countSchema.optional(),
  }),
) satisfies z.ZodType<readonly FileChange[]>

const toolSummarySchema = z.object({
  kind: z.string(),
  subject: z.string().optional(),
  detail: z.string().optional(),
  agent: z.string().optional(),
  args: z
    .array(z.object({ name: z.string(), value: z.union([z.string(), z.number()]) }))
    .optional(),
  items: z.array(z.string()).optional(),
  requested: countSchema.optional(),
  result: z
    .object({
      unit: z.string(),
      count: countSchema.optional(),
      text: z.string().optional(),
      truncated: z.boolean().optional(),
    })
    .optional(),
}) satisfies z.ZodType<ToolSummary>

const toolShellSchema = z.object({
  command: z.string().optional(),
  output: z.string().optional(),
}) satisfies z.ZodType<ToolShell>

const toolTodosSchema = z.array(
  z.object({
    text: z.string(),
    status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
    priority: z.string().optional(),
  }),
) satisfies z.ZodType<readonly ToolTodo[]>

const toolQuestionsSchema = z.array(
  z.object({
    text: z.string(),
    header: z.string().optional(),
    options: z.array(z.object({ label: z.string(), description: z.string().optional() })),
    multiple: z.boolean().optional(),
    answers: z.array(z.string()).optional(),
  }),
) satisfies z.ZodType<readonly ToolQuestion[]>

const toolOutcomeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rejected"), message: z.string().optional() }),
  z.object({ type: z.literal("interrupted") }),
  z.object({ type: z.literal("dismissed") }),
]) satisfies z.ZodType<ToolOutcome>

function parseWith<TOutput>(schema: z.ZodType<TOutput>, value: TJsonValue | undefined): TOutput | undefined {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseAttachments(partID: string, value: TJsonValue | undefined): ToolAttachment[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((attachment, index): ToolAttachment[] => {
    const record = parseTJsonObject(attachment)
    if (!record) return []

    const mime = readNonEmptyString(record.mime)
    const url = readNonEmptyString(record.url)
    if (!mime || !url) return []

    const filename = readNonEmptyString(record.filename)
    return [
      Object.assign(
        {
          id: readNonEmptyString(record.id) ?? `${partID}:attachment:${index}`,
          mime,
          url,
        },
        filename !== undefined ? { filename } : undefined,
      ),
    ]
  })
}

export function readToolSummaryKind(part: MessagePart): string | undefined {
  return parseTString(parseTJsonObject(parseTJsonObject(part.state)?.summary)?.kind)
}

export function parseToolState(part: MessagePart): ToolState {
  const rawState = parseTJsonObject(part.state) ?? EMPTY_JSON_OBJECT
  const status = toToolStatus(rawState.status)
  const input = parseTJsonObject(rawState.input) ?? EMPTY_JSON_OBJECT
  const rawTime = parseTJsonObject(rawState.time) ?? EMPTY_JSON_OBJECT
  const stateMetadata = parseTJsonObject(rawState.metadata) ?? EMPTY_JSON_OBJECT
  const partMetadata = parseTJsonObject(part.metadata) ?? EMPTY_JSON_OBJECT
  const metadata: TJsonObject = {
    ...partMetadata,
    ...stateMetadata,
  }

  const start = parseTNumber(rawTime.start)
  const end = parseTNumber(rawTime.end)
  const output = parseTString(rawState.output)
  const error = parseTString(rawState.error)
  const errorType = parseTString(rawState.errorType)
  const title = readNonEmptyString(rawState.title)
  const fileChanges = parseWith(fileChangesSchema, rawState.fileChanges)
  const summary = parseWith(toolSummarySchema, rawState.summary)
  const shell = parseWith(toolShellSchema, rawState.shell)
  const todos = parseWith(toolTodosSchema, rawState.todos)
  const questions = parseWith(toolQuestionsSchema, rawState.questions)
  const skillContent = parseTString(rawState.skillContent)
  const outcome = parseWith(toolOutcomeSchema, rawState.outcome)
  return Object.assign(
    Object.assign(
      {
        status,
        input,
        metadata,
        attachments: parseAttachments(part.id, rawState.attachments),
      },
      start !== undefined ? { start } : undefined,
      end !== undefined ? { end } : undefined,
      output !== undefined ? { output } : undefined,
    ),
    Object.assign(
      {},
      error !== undefined ? { error } : undefined,
      errorType !== undefined ? { errorType } : undefined,
      title !== undefined ? { title } : undefined,
    ),
    Object.assign(
      {},
      fileChanges !== undefined ? { fileChanges } : undefined,
      summary !== undefined ? { summary } : undefined,
      shell !== undefined ? { shell } : undefined,
      todos !== undefined ? { todos } : undefined,
    ),
    Object.assign(
      {},
      questions !== undefined ? { questions } : undefined,
      skillContent !== undefined ? { skillContent } : undefined,
      outcome !== undefined ? { outcome } : undefined,
    ),
  )
}
