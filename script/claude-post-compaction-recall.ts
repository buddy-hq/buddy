#!/usr/bin/env bun
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import {
  consumeJsonl,
  isRecord,
  normalizeText,
  parseJson,
  readString,
  requireFlagValue,
  UUID_PATTERN,
  type TJsonObject,
  type TJsonValue,
} from "./post-compaction-recall-shared"
import { parseTBoolean, parseTString, stringifyCaughtError } from "./parse-values"

const LOCAL_SESSION_PATTERN =
  /^local_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_TRANSCRIPT_DIRECTORY = path.join("docs", "local", "post-compaction-recall", "claude")
const INJECTED_USER_BLOCKS = [
  /<cu_window_hints>[\s\S]*?<\/cu_window_hints>/gi,
  /<ide_opened_file>[\s\S]*?<\/ide_opened_file>/gi,
  /<system-reminder>[\s\S]*?<\/system-reminder>/gi,
]
const QUESTION_TOOL_NAME = "AskUserQuestion"

type ClaudeEntryKind = "A" | "I" | "Q" | "R" | "T" | "U"

type ClaudeTranscriptEntry = {
  body: string
  kind: ClaudeEntryKind
}

type ClaudeQuestionOption = {
  description: string
  label: string
}

type ClaudeQuestion = {
  header?: string
  multiSelect: boolean
  options: ClaudeQuestionOption[]
  question: string
}

export type ClaudePostCompactionTranscriptStats = {
  assistantMessages: number
  entries: number
  imageAttachments: number
  questionAnswers: number
  questionDismissals: number
  questionPrompts: number
  redactedThinkingBlocks: number
  skippedTrailingRecord: boolean
  thinkingBlocks: number
  userMessages: number
}

export type ClaudePostCompactionTranscript = {
  markdown: string
  stats: ClaudePostCompactionTranscriptStats
}

type ClaudeTranscriptBuilder = {
  addRecord: (record: TJsonValue) => void
  finish: (skippedTrailingRecord?: boolean) => ClaudePostCompactionTranscript
}

type CliOptions = {
  claudeAppHome: string
  claudeHome: string
  outputPath?: string
  sessionReference: string
  sourcePath?: string
}

type CliParseResult = { kind: "help" } | { kind: "run"; options: CliOptions }

function stripInjectedUserBlocks(value: string): string {
  let stripped = value
  for (const pattern of INJECTED_USER_BLOCKS) stripped = stripped.replace(pattern, "")
  return normalizeText(stripped)
}

function readBoolean(record: TJsonObject, key: string): boolean | undefined {
  return parseTBoolean(record[key])
}

function parseQuestionOption<TValue>(value: TValue): ClaudeQuestionOption {
  if (!isRecord(value)) throw new Error("Claude question option is not an object")

  const description = readString(value, "description")
  const label = readString(value, "label")
  if (!description || !label) {
    throw new Error("Claude question option is missing its label or description")
  }
  return { description, label }
}

function parseQuestion<TValue>(value: TValue): ClaudeQuestion {
  if (!isRecord(value)) throw new Error("Claude question is not an object")

  const question = readString(value, "question")
  if (!question) throw new Error("Claude question is missing its text")
  if (!Array.isArray(value.options)) {
    throw new Error(`Claude question ${question} is missing its options`)
  }

  const header = readString(value, "header")
  return Object.assign(
    {
      multiSelect: readBoolean(value, "multiSelect") ?? false,
      options: value.options.map(parseQuestionOption),
      question,
    },
    header ? { header } : undefined,
  )
}

function parseQuestionCall(content: TJsonObject): ClaudeQuestion[] {
  if (!isRecord(content.input) || !Array.isArray(content.input.questions)) {
    throw new Error("Claude question request has invalid input")
  }
  return content.input.questions.map(parseQuestion)
}

function renderQuestion(question: ClaudeQuestion): string {
  const header = question.header ? `[${question.header}] ` : ""
  const selectMode = question.multiSelect ? " [multi-select]" : ""
  const options = question.options.map(
    (option, index) => `${index + 1}. ${option.label} — ${option.description}`,
  )
  return `${header}${question.question}${selectMode}\n${options.join("\n")}`
}

function parseJsonStringAt(value: string, start: number): string | undefined {
  if (value[start] !== '"') return undefined

  let escaped = false
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === "\\") {
      escaped = true
      continue
    }
    if (character !== '"') continue

    const parsed = parseJson(value.slice(start, index + 1))
    return parseTString(parsed)
  }
  return undefined
}

function extractQuestionAnswer(value: string, question: ClaudeQuestion): string | undefined {
  const questionJson = JSON.stringify(question.question)
  const marker = `${questionJson}=`
  const markerIndex = value.indexOf(marker)
  if (markerIndex < 0) return undefined
  return parseJsonStringAt(value, markerIndex + marker.length)
}

function toolResultText(content: TJsonObject): string | undefined {
  const rawContent = content.content
  const asString = parseTString(rawContent)
  if (asString !== undefined) return normalizeText(asString)
  if (!Array.isArray(rawContent)) return undefined

  const parts: string[] = []
  for (const part of rawContent) {
    if (!isRecord(part) || part.type !== "text") continue
    const text = readString(part, "text")
    if (text && normalizeText(text).length > 0) parts.push(text)
  }
  return parts.length > 0 ? normalizeText(parts.join("\n")) : undefined
}

function messageContent(record: TJsonObject): readonly TJsonValue[] | string | undefined {
  if (!isRecord(record.message)) return undefined
  const content = record.message.content
  const asString = parseTString(content)
  if (asString !== undefined) return asString
  return Array.isArray(content) ? content : undefined
}

export function createClaudePostCompactionTranscriptBuilder(
  sessionId: string,
  capturedOn = new Date().toISOString().slice(0, 10),
): ClaudeTranscriptBuilder {
  if (!UUID_PATTERN.test(sessionId)) throw new Error(`Invalid Claude session id: ${sessionId}`)

  const entries: ClaudeTranscriptEntry[] = []
  const questionsByToolUseId = new Map<string, ClaudeQuestion[]>()
  let assistantMessages = 0
  let imageAttachments = 0
  let questionAnswers = 0
  let questionDismissals = 0
  let questionPrompts = 0
  let redactedThinkingBlocks = 0
  let thinkingBlocks = 0
  let userMessages = 0

  const addEntry = (kind: ClaudeEntryKind, value: string): void => {
    const body = normalizeText(value)
    if (body.length === 0) return

    const previous = entries.at(-1)
    if (previous?.kind === kind) {
      previous.body = `${previous.body}\n${body}`
      return
    }
    entries.push({ body, kind })
  }

  const addQuestionCall = (content: TJsonObject): void => {
    const toolUseId = readString(content, "id")
    if (!toolUseId) throw new Error("Claude question request is missing its tool-use id")

    const questions = parseQuestionCall(content)
    questionsByToolUseId.set(toolUseId, questions)
    for (const question of questions) {
      questionPrompts += 1
      addEntry("Q", renderQuestion(question))
    }
  }

  const addQuestionResult = (content: TJsonObject): void => {
    const toolUseId = readString(content, "tool_use_id")
    if (!toolUseId) return
    const questions = questionsByToolUseId.get(toolUseId)
    if (!questions) return

    const result = toolResultText(content)
    if (!result) return
    if (content.is_error === true) {
      questionDismissals += questions.length
      addEntry("R", "[dismissed]")
      return
    }

    const extractedAnswers = questions
      .map((question) => extractQuestionAnswer(result, question))
      .filter((answer): answer is string => answer !== undefined)
    if (extractedAnswers.length > 0) {
      questionAnswers += extractedAnswers.length
      for (const answer of extractedAnswers) addEntry("R", answer)
      return
    }

    questionAnswers += 1
    addEntry("R", result)
  }

  const addUserRecord = (record: TJsonObject): void => {
    const content = messageContent(record)
    const textContent = parseTString(content)
    if (textContent !== undefined) {
      const text = stripInjectedUserBlocks(textContent)
      if (text.length === 0) return
      userMessages += 1
      addEntry("U", text)
      return
    }
    if (!content) return

    let containsUserText = false
    for (const part of content) {
      if (!isRecord(part)) continue
      if (part.type === "text") {
        const rawText = readString(part, "text")
        if (!rawText) continue
        const text = stripInjectedUserBlocks(rawText)
        if (text.length === 0) continue
        containsUserText = true
        addEntry("U", text)
        continue
      }
      if (part.type === "image") {
        const mediaType = isRecord(part.source) ? readString(part.source, "media_type") : undefined
        imageAttachments += 1
        addEntry("I", mediaType ? `[${mediaType} attachment]` : "[image attachment]")
        continue
      }
      if (part.type === "tool_result") addQuestionResult(part)
    }
    if (containsUserText) userMessages += 1
  }

  const addAssistantRecord = (record: TJsonObject): void => {
    const content = messageContent(record)
    if (!Array.isArray(content)) return

    for (const part of content) {
      if (!isRecord(part)) continue
      if (part.type === "text") {
        const text = readString(part, "text")
        if (!text || normalizeText(text).length === 0) continue
        assistantMessages += 1
        addEntry("A", text)
        continue
      }
      if (part.type === "thinking") {
        const thinking = readString(part, "thinking")
        if (!thinking || normalizeText(thinking).length === 0) continue
        thinkingBlocks += 1
        addEntry("T", thinking)
        continue
      }
      if (part.type === "redacted_thinking") {
        redactedThinkingBlocks += 1
        addEntry("T", "[redacted by Claude]")
        continue
      }
      if (part.type === "tool_use" && part.name === QUESTION_TOOL_NAME) {
        addQuestionCall(part)
      }
    }
  }

  const addRecord = (value: TJsonValue): void => {
    if (!isRecord(value) || value.isMeta === true || value.isSidechain === true) return
    if (value.type === "user") {
      addUserRecord(value)
      return
    }
    if (value.type === "assistant") addAssistantRecord(value)
  }

  const finish = (skippedTrailingRecord = false): ClaudePostCompactionTranscript => {
    const stats: ClaudePostCompactionTranscriptStats = {
      assistantMessages,
      entries: entries.length,
      imageAttachments,
      questionAnswers,
      questionDismissals,
      questionPrompts,
      redactedThinkingBlocks,
      skippedTrailingRecord,
      thinkingBlocks,
      userMessages,
    }
    const warning = skippedTrailingRecord ? " trailing-jsonl=skipped" : ""
    const renderedEntries = entries.map((entry) => `${entry.kind}:\n${entry.body}`).join("\n")
    const markdown = `# Claude post-compaction recall
session=${sessionId}
captured=${capturedOn}
counts=U${userMessages} A${assistantMessages} T${thinkingBlocks} I${imageAttachments} Q${questionPrompts} R${questionAnswers} dismissed${questionDismissals} redactedT${redactedThinkingBlocks}${warning}
source=local raw Claude JSONL
excluded=ordinary tools/results, system/metadata, signatures, injected UI blocks
key=U user; A assistant; T assistant thinking; I image; Q question; R answer
---
${renderedEntries}
`
    return { markdown, stats }
  }

  return { addRecord, finish }
}

async function newestCandidate(candidates: string[], missingMessage: string): Promise<string> {
  if (candidates.length === 0) throw new Error(missingMessage)
  const onlyCandidate = candidates[0]
  if (candidates.length === 1 && onlyCandidate) return onlyCandidate

  const datedCandidates = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      modifiedAt: (await stat(candidate)).mtimeMs,
    })),
  )
  const newest = datedCandidates.toSorted((left, right) => right.modifiedAt - left.modifiedAt)[0]
  if (!newest) throw new Error(missingMessage)
  return newest.candidate
}

async function resolveLocalSessionId(
  claudeAppHome: string,
  sessionReference: string,
): Promise<string> {
  const glob = new Bun.Glob(`claude-code-sessions/**/${sessionReference}.json`)
  const candidates: string[] = []
  for await (const relativePath of glob.scan({ cwd: claudeAppHome, onlyFiles: true })) {
    candidates.push(path.join(claudeAppHome, relativePath))
  }

  const metadataPath = await newestCandidate(
    candidates,
    `No Claude desktop metadata found for ${sessionReference} under ${claudeAppHome}`,
  )
  const metadata = parseJson(await readFile(metadataPath, "utf8"))
  if (!isRecord(metadata)) throw new Error(`Claude metadata is invalid: ${metadataPath}`)
  const cliSessionId = readString(metadata, "cliSessionId")
  if (!cliSessionId || !UUID_PATTERN.test(cliSessionId)) {
    throw new Error(`Claude metadata has no valid cliSessionId: ${metadataPath}`)
  }
  return cliSessionId
}

async function resolveSessionId(options: CliOptions): Promise<string> {
  if (UUID_PATTERN.test(options.sessionReference)) return options.sessionReference
  return resolveLocalSessionId(options.claudeAppHome, options.sessionReference)
}

async function findRolloutPath(claudeHome: string, sessionId: string): Promise<string> {
  const glob = new Bun.Glob(`projects/**/${sessionId}.jsonl`)
  const candidates: string[] = []
  for await (const relativePath of glob.scan({ cwd: claudeHome, onlyFiles: true })) {
    candidates.push(path.join(claudeHome, relativePath))
  }
  return newestCandidate(
    candidates,
    `No raw Claude rollout found for session ${sessionId} under ${claudeHome}`,
  )
}

function parseCliOptions(args: string[]): CliParseResult {
  if (args.includes("--help") || args.includes("-h")) return { kind: "help" }

  let claudeAppHome = path.join(homedir(), "Library", "Application Support", "Claude")
  let claudeHome = path.join(homedir(), ".claude")
  let outputPath: string | undefined
  let sessionReference: string | undefined
  let sourcePath: string | undefined

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--claude-app-home") {
      claudeAppHome = path.resolve(requireFlagValue(args, index, argument))
      index += 1
      continue
    }
    if (argument === "--claude-home") {
      claudeHome = path.resolve(requireFlagValue(args, index, argument))
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
    if (argument.startsWith("--")) throw new Error(`Unknown option: ${argument}`)
    if (sessionReference) throw new Error(`Unexpected positional argument: ${argument}`)
    sessionReference = argument
  }

  if (!sessionReference) throw new Error("A Claude session id is required")
  if (!UUID_PATTERN.test(sessionReference) && !LOCAL_SESSION_PATTERN.test(sessionReference)) {
    throw new Error(`Invalid Claude session id: ${sessionReference}`)
  }

  return {
    kind: "run",
    options: Object.assign(
      {
        claudeAppHome,
        claudeHome,
        sessionReference,
      },
      outputPath ? { outputPath } : undefined,
      sourcePath ? { sourcePath } : undefined,
    ),
  }
}

function printHelp(): void {
  console.log(`Usage:
  bun ./script/claude-post-compaction-recall.ts <session-id> [options]

<session-id> may be a raw Claude CLI UUID or a Claude desktop local_<UUID>.

Options:
  --output <path>           Transcript path. Defaults to docs/local/post-compaction-recall/claude/<cli-session-id>.md
  --claude-home <path>      Claude CLI data directory. Defaults to ~/.claude
  --claude-app-home <path>  Claude desktop data directory. Defaults to ~/Library/Application Support/Claude
  --source <path>           Use an exact Claude JSONL file instead of locating it
  --help                    Show this help
`)
}

async function main(): Promise<void> {
  const parsed = parseCliOptions(process.argv.slice(2))
  if (parsed.kind === "help") {
    printHelp()
    return
  }

  const sessionId = await resolveSessionId(parsed.options)
  const sourcePath =
    parsed.options.sourcePath ?? (await findRolloutPath(parsed.options.claudeHome, sessionId))
  const sourceStats = await stat(sourcePath)
  if (!sourceStats.isFile()) throw new Error(`Claude rollout source is not a file: ${sourcePath}`)

  const outputPath =
    parsed.options.outputPath ??
    path.resolve(process.cwd(), DEFAULT_TRANSCRIPT_DIRECTORY, `${sessionId}.md`)
  const builder = createClaudePostCompactionTranscriptBuilder(sessionId)
  const skippedTrailingRecord = await consumeJsonl(sourcePath, builder.addRecord)
  const transcript = builder.finish(skippedTrailingRecord)

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, transcript.markdown, "utf8")

  console.log(`Transcript written to ${outputPath}`)
  console.log(`Source: ${sourcePath}`)
  console.log(
    `Recovered ${transcript.stats.userMessages} user messages, ${transcript.stats.assistantMessages} assistant messages, ${transcript.stats.thinkingBlocks} thinking blocks, ${transcript.stats.imageAttachments} image markers, ${transcript.stats.questionPrompts} question prompts, and ${transcript.stats.questionAnswers} submitted answers.`,
  )
  if (transcript.stats.questionDismissals > 0) {
    console.log(`Recorded ${transcript.stats.questionDismissals} dismissed questions.`)
  }
  if (skippedTrailingRecord) {
    console.warn("Skipped one incomplete trailing record from the active Claude rollout.")
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(stringifyCaughtError(error))
    process.exitCode = 1
  })
}
