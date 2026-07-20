#!/usr/bin/env bun
import { createReadStream } from "node:fs"
import { mkdir, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { createInterface } from "node:readline"

const THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_TRANSCRIPT_DIRECTORY = path.join("docs", "local", "post-compaction-recall")
const INJECTED_USER_PREFIXES = [
  "<recommended_plugins>",
  "# AGENTS.md instructions",
  "<environment_context>",
]

type QuestionOption = {
  description: string
  label: string
}

type QuestionPrompt = {
  header?: string
  id: string
  options: QuestionOption[]
  question: string
}

type TranscriptEntry = {
  body: string
  heading: string
}

export type PostCompactionTranscriptStats = {
  assistantMessages: number
  entries: number
  questionAnswers: number
  questionPrompts: number
  skippedTrailingRecord: boolean
  userMessages: number
}

export type PostCompactionTranscript = {
  markdown: string
  stats: PostCompactionTranscriptStats
}

type TranscriptBuilder = {
  addRecord: (record: unknown) => void
  finish: (skippedTrailingRecord?: boolean) => PostCompactionTranscript
}

type CliOptions = {
  codexHome: string
  outputPath: string
  sourcePath?: string
  threadId: string
}

type CliParseResult = { kind: "help" } | { kind: "run"; options: CliOptions }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

function parseJson(value: string): unknown {
  const parsed: unknown = JSON.parse(value)
  return parsed
}

function normalizeText(value: string): string {
  return value.replaceAll("\r\n", "\n").trim()
}

function quoteMarkdown(value: string): string {
  return normalizeText(value)
    .split("\n")
    .map((line) => (line.length === 0 ? ">" : `> ${line}`))
    .join("\n")
}

function parseQuestionOption(value: unknown): QuestionOption {
  if (!isRecord(value)) {
    throw new Error("Question option is not an object")
  }

  const description = readString(value, "description")
  const label = readString(value, "label")
  if (!description || !label) {
    throw new Error("Question option is missing its label or description")
  }

  return { description, label }
}

function parseQuestionPrompt(value: unknown): QuestionPrompt {
  if (!isRecord(value)) {
    throw new Error("Question prompt is not an object")
  }

  const id = readString(value, "id")
  const question = readString(value, "question")
  if (!id || !question) {
    throw new Error("Question prompt is missing its id or question")
  }

  const rawOptions = value.options
  if (!Array.isArray(rawOptions)) {
    throw new Error(`Question ${id} is missing its options`)
  }

  const header = readString(value, "header")
  const prompt: QuestionPrompt = {
    id,
    options: rawOptions.map(parseQuestionOption),
    question,
  }
  if (header) prompt.header = header
  return prompt
}

function parseQuestionCall(payload: Record<string, unknown>): QuestionPrompt[] {
  const argumentsJson = readString(payload, "arguments")
  const callId = readString(payload, "call_id")
  if (!argumentsJson || !callId) {
    throw new Error("Question request is missing its arguments or call id")
  }

  const argumentsValue = parseJson(argumentsJson)
  if (!isRecord(argumentsValue) || !Array.isArray(argumentsValue.questions)) {
    throw new Error(`Question request ${callId} has invalid arguments`)
  }

  return argumentsValue.questions.map(parseQuestionPrompt)
}

function renderQuestion(question: QuestionPrompt): string {
  const lines: string[] = []
  if (question.header) lines.push(`**${question.header}**`, "")
  lines.push(question.question)

  if (question.options.length > 0) {
    lines.push("", "Options shown:")
    for (const [index, option] of question.options.entries()) {
      lines.push(`${index + 1}. **${option.label}** — ${option.description}`)
    }
  }

  return quoteMarkdown(lines.join("\n"))
}

function renderQuestionAnswer(question: QuestionPrompt, answers: string[]): string {
  const lines: string[] = []
  if (question.header) lines.push(`**${question.header}**`, "")
  lines.push(...answers)
  return quoteMarkdown(lines.join("\n"))
}

function messageTextParts(
  payload: Record<string, unknown>,
  contentType: "input_text" | "output_text",
): string[] {
  if (!Array.isArray(payload.content)) return []

  const parts: string[] = []
  for (const content of payload.content) {
    if (!isRecord(content) || content.type !== contentType) continue
    const text = readString(content, "text")
    if (text && normalizeText(text).length > 0) parts.push(text)
  }
  return parts
}

function isInjectedUserText(value: string): boolean {
  const normalized = value.trimStart()
  return INJECTED_USER_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

export function createPostCompactionTranscriptBuilder(
  threadId: string,
  capturedOn = new Date().toISOString().slice(0, 10),
): TranscriptBuilder {
  if (!THREAD_ID_PATTERN.test(threadId)) {
    throw new Error(`Invalid Codex thread id: ${threadId}`)
  }

  const entries: TranscriptEntry[] = []
  const questionsByCallId = new Map<string, QuestionPrompt[]>()
  let assistantMessages = 0
  let questionAnswers = 0
  let questionPrompts = 0
  let userMessages = 0

  const addEntry = (heading: string, body: string): void => {
    entries.push({ body, heading })
  }

  const addMessage = (payload: Record<string, unknown>): void => {
    const role = readString(payload, "role")
    if (role === "user") {
      const parts = messageTextParts(payload, "input_text").filter(
        (part) => !isInjectedUserText(part),
      )
      if (parts.length === 0) return
      userMessages += 1
      addEntry("User", parts.map(quoteMarkdown).join("\n\n"))
      return
    }

    if (role !== "assistant") return
    const parts = messageTextParts(payload, "output_text")
    if (parts.length === 0) return
    assistantMessages += 1
    const phase = readString(payload, "phase")
    const heading = phase ? `Assistant · ${phase}` : "Assistant"
    addEntry(heading, parts.map(quoteMarkdown).join("\n\n"))
  }

  const addQuestionCall = (payload: Record<string, unknown>): void => {
    const callId = readString(payload, "call_id")
    if (!callId) throw new Error("Question request is missing its call id")

    const questions = parseQuestionCall(payload)
    questionsByCallId.set(callId, questions)
    for (const question of questions) {
      questionPrompts += 1
      addEntry("Assistant · question", renderQuestion(question))
    }
  }

  const addQuestionAnswer = (payload: Record<string, unknown>): void => {
    const callId = readString(payload, "call_id")
    if (!callId) return
    const questions = questionsByCallId.get(callId)
    if (!questions) return

    const outputJson = readString(payload, "output")
    if (!outputJson) return

    let outputValue: unknown
    try {
      outputValue = parseJson(outputJson)
    } catch {
      return
    }
    if (!isRecord(outputValue) || !isRecord(outputValue.answers)) return

    for (const question of questions) {
      const answerValue = outputValue.answers[question.id]
      if (!isRecord(answerValue) || !Array.isArray(answerValue.answers)) {
        continue
      }

      const answers = answerValue.answers.filter(
        (answer): answer is string => typeof answer === "string",
      )
      if (answers.length === 0) continue

      questionAnswers += 1
      addEntry("User · question answer", renderQuestionAnswer(question, answers))
    }
  }

  const addRecord = (record: unknown): void => {
    if (!isRecord(record) || record.type !== "response_item") return
    if (!isRecord(record.payload)) return

    const payload = record.payload
    const payloadType = readString(payload, "type")
    if (payloadType === "message") {
      addMessage(payload)
      return
    }
    if (payloadType === "function_call" && payload.name === "request_user_input") {
      addQuestionCall(payload)
      return
    }
    if (payloadType === "function_call_output") {
      addQuestionAnswer(payload)
    }
  }

  const finish = (skippedTrailingRecord = false): PostCompactionTranscript => {
    const stats: PostCompactionTranscriptStats = {
      assistantMessages,
      entries: entries.length,
      questionAnswers,
      questionPrompts,
      skippedTrailingRecord,
      userMessages,
    }
    const renderedEntries = entries
      .map((entry, index) => `## ${index + 1}. ${entry.heading}\n\n${entry.body}`)
      .join("\n\n")
    const trailingRecordNote = skippedTrailingRecord
      ? "\n- Warning: one incomplete trailing JSONL record was skipped because the active thread was being written"
      : ""

    const markdown = `# Post-compaction conversation transcript

- Thread ID: \`${threadId}\`
- Captured: ${capturedOn}
- Source: local raw Codex rollout
- Ordinary messages: ${userMessages} user, ${assistantMessages} assistant
- Structured Q&A: ${questionPrompts} prompts, ${questionAnswers} submitted answers
- Excluded: injected environment instructions, reasoning, compaction records, commands, non-question tool calls, and non-question tool outputs${trailingRecordNote}
- Ordering: chronological

This generated file restores conversational context after compaction. Ordinary messages and submitted answers are preserved verbatim. Structured question prompts retain their header, wording, option labels, and option descriptions. Role headings and question formatting are the only additions.

${renderedEntries}
`

    return { markdown, stats }
  }

  return { addRecord, finish }
}

async function consumeRollout(sourcePath: string, builder: TranscriptBuilder): Promise<boolean> {
  const input = createReadStream(sourcePath, { encoding: "utf8" })
  const lines = createInterface({ crlfDelay: Infinity, input })
  let lineNumber = 0
  let pendingMalformedLine: number | undefined

  for await (const line of lines) {
    lineNumber += 1
    if (line.trim().length === 0) continue
    if (pendingMalformedLine !== undefined) {
      throw new Error(
        `Malformed JSONL record at line ${pendingMalformedLine} is not the trailing record`,
      )
    }

    let record: unknown
    try {
      record = parseJson(line)
    } catch {
      pendingMalformedLine = lineNumber
      continue
    }
    builder.addRecord(record)
  }

  return pendingMalformedLine !== undefined
}

async function findRolloutPath(codexHome: string, threadId: string): Promise<string> {
  const glob = new Bun.Glob(`sessions/**/rollout-*-${threadId}.jsonl`)
  const candidates: string[] = []
  for await (const relativePath of glob.scan({
    cwd: codexHome,
    onlyFiles: true,
  })) {
    candidates.push(path.join(codexHome, relativePath))
  }

  if (candidates.length === 0) {
    throw new Error(`No raw Codex rollout found for thread ${threadId} under ${codexHome}`)
  }
  if (candidates.length === 1) return candidates[0]

  const datedCandidates = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      modifiedAt: (await stat(candidate)).mtimeMs,
    })),
  )
  const newestCandidate = datedCandidates.toSorted(
    (left, right) => right.modifiedAt - left.modifiedAt,
  )[0]
  if (!newestCandidate) {
    throw new Error(`No raw Codex rollout found for thread ${threadId}`)
  }
  return newestCandidate.candidate
}

function requireFlagValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

function parseCliOptions(args: string[]): CliParseResult {
  if (args.includes("--help") || args.includes("-h")) return { kind: "help" }

  let codexHome = path.join(homedir(), ".codex")
  let outputPath: string | undefined
  let sourcePath: string | undefined
  let threadId: string | undefined

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--codex-home") {
      codexHome = path.resolve(requireFlagValue(args, index, argument))
      index += 1
      continue
    }
    if (argument === "--output") {
      outputPath = path.resolve(requireFlagValue(args, index, argument))
      index += 1
      continue
    }
    if (argument === "--source") {
      sourcePath = path.resolve(requireFlagValue(args, index, argument))
      index += 1
      continue
    }
    if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`)
    }
    if (threadId) throw new Error(`Unexpected positional argument: ${argument}`)
    threadId = argument
  }

  if (!threadId) throw new Error("A Codex thread id is required")
  if (!THREAD_ID_PATTERN.test(threadId)) {
    throw new Error(`Invalid Codex thread id: ${threadId}`)
  }

  return {
    kind: "run",
    options: {
      codexHome,
      outputPath:
        outputPath ?? path.resolve(process.cwd(), DEFAULT_TRANSCRIPT_DIRECTORY, `${threadId}.md`),
      ...(sourcePath ? { sourcePath } : {}),
      threadId,
    },
  }
}

function printHelp(): void {
  console.log(`Usage:
  bun ./script/post-compaction-recall.ts <thread-id> [options]

Options:
  --output <path>      Transcript path. Defaults to docs/local/post-compaction-recall/<thread-id>.md
  --codex-home <path>  Codex data directory. Defaults to ~/.codex
  --source <path>      Use an exact rollout JSONL file instead of locating it by thread id
  --help               Show this help
`)
}

async function main(): Promise<void> {
  const parsed = parseCliOptions(process.argv.slice(2))
  if (parsed.kind === "help") {
    printHelp()
    return
  }

  const { codexHome, outputPath, sourcePath, threadId } = parsed.options
  const resolvedSourcePath = sourcePath ?? (await findRolloutPath(codexHome, threadId))
  const sourceStats = await stat(resolvedSourcePath)
  if (!sourceStats.isFile()) {
    throw new Error(`Rollout source is not a file: ${resolvedSourcePath}`)
  }

  const builder = createPostCompactionTranscriptBuilder(threadId)
  const skippedTrailingRecord = await consumeRollout(resolvedSourcePath, builder)
  const transcript = builder.finish(skippedTrailingRecord)

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, transcript.markdown, "utf8")

  console.log(`Transcript written to ${outputPath}`)
  console.log(`Source: ${resolvedSourcePath}`)
  console.log(
    `Recovered ${transcript.stats.userMessages} user messages, ${transcript.stats.assistantMessages} assistant messages, ${transcript.stats.questionPrompts} question prompts, and ${transcript.stats.questionAnswers} submitted answers.`,
  )
  if (skippedTrailingRecord) {
    console.warn("Skipped one incomplete trailing record from the active rollout.")
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
