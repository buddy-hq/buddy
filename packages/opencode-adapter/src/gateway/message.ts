import type {
  SessionMessageInfo,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionStructuredError,
} from "@opencode/client"
import path from "node:path"
import { Result } from "effect"
import { Patch } from "@opencode/util/patch"
import type {
  AssistantMessage,
  FileChange,
  MessageError,
  MessageWithParts,
  Part,
  ToolPart,
  ToolState,
  ToolSummary,
} from "@buddy/transcript-contract/message"
import {
  isJsonObject,
  parseBooleanValue,
  parseFiniteNumber,
  parseJsonObject,
  parseJsonObjectFromText,
  parseStringValue,
  type TJsonObject,
} from "@buddy/transcript-contract/parse-external"
import { readCommandDisplay, readPromptPresentation } from "@buddy/transcript-contract/prompt"
import { isVisibleToUserTextPartInfo } from "@buddy/transcript-contract/message-visibility"
import type { EventClient, SessionClient } from "./client"
import {
  withToolPresentationOnPart,
  type ToolPresentationLookup,
} from "@buddy/transcript-contract/session-tool-presentation"
import { toBuddySubagentCompletion, toBuddySubagentPresentation } from "./subagent"
import { coreToolPresentationDetail, toolOutcome } from "./tool-presentation"
import {
  readMessageShellOutput,
  runningShellID,
  type LiveShellOutput,
  type ShellOutputClient,
} from "./shell-output"

const EmptyTokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }

function nonEmptyString<TValue>(value: TValue): string | undefined {
  const text = parseStringValue(value)
  return text?.trim() ? text : undefined
}

function nonNegativeInt<TValue>(value: TValue): number | undefined {
  const number = parseFiniteNumber(value)
  return number !== undefined && Number.isInteger(number) && number >= 0 ? number : undefined
}

function fileKind<TValue>(value: TValue): FileChange["kind"] {
  const kind = parseStringValue(value)
  if (kind === "add" || kind === "added") return "add"
  if (kind === "update" || kind === "modified") return "update"
  if (kind === "delete" || kind === "deleted") return "delete"
  return kind === "move" ? "move" : undefined
}

function filePath(value: string, directory: string): string {
  const windows =
    path.win32.isAbsolute(directory) &&
    (!path.posix.isAbsolute(directory) || directory.startsWith("//"))
  const paths = windows ? path.win32 : path.posix
  return paths.resolve(directory, value)
}

function toolFileChanges(
  name: string,
  input: TJsonObject,
  metadata: TJsonObject,
  directory: string,
): readonly FileChange[] | undefined {
  if (name !== "edit" && name !== "write" && name !== "patch" && name !== "apply_patch")
    return undefined
  const patchText = parseStringValue(input.patchText)
  const parsed =
    (name === "patch" || name === "apply_patch") && patchText !== undefined
      ? Patch.parse(patchText)
      : undefined
  const moves = new Set(
    parsed && Result.isSuccess(parsed)
      ? parsed.success.flatMap((hunk) =>
          hunk.type === "update" &&
          hunk.movePath &&
          filePath(hunk.path, directory) !== filePath(hunk.movePath, directory)
            ? [filePath(hunk.movePath, directory)]
            : [],
        )
      : [],
  )
  const files = Array.isArray(metadata.files)
    ? metadata.files.flatMap((value): FileChange[] => {
        if (!isJsonObject(value)) return []
        const target =
          nonEmptyString(value.filePath) ??
          nonEmptyString(value.file) ??
          nonEmptyString(value.path) ??
          nonEmptyString(value.relativePath)
        if (!target) return []
        const nativeKind = fileKind(value.type) ?? fileKind(value.status)
        const kind =
          nativeKind === "update" && moves.has(filePath(target, directory)) ? "move" : nativeKind
        return [
          {
            path: filePath(target, directory),
            relativePath: nonEmptyString(value.relativePath) ?? target,
            kind,
            patch: parseStringValue(value.patch) ?? parseStringValue(value.diff),
            before: parseStringValue(value.before),
            after: parseStringValue(value.after),
            content: name === "write" ? parseStringValue(input.content) : undefined,
            additions: nonNegativeInt(value.additions) ?? 0,
            deletions: nonNegativeInt(value.deletions) ?? 0,
          },
        ]
      })
    : []
  if (files.length) return files
  if (name === "patch" || name === "apply_patch") return []
  const diff = isJsonObject(metadata.filediff) ? metadata.filediff : undefined
  const target =
    name === "edit"
      ? (nonEmptyString(diff?.file) ?? nonEmptyString(input.filePath) ?? nonEmptyString(input.path))
      : (nonEmptyString(metadata.filepath) ??
        nonEmptyString(input.filePath) ??
        nonEmptyString(input.path))
  if (name === "write") {
    return [
      {
        path: target ? filePath(target, directory) : undefined,
        relativePath: target,
        content: parseStringValue(input.content),
      },
    ]
  }
  const before = parseStringValue(diff?.before) ?? parseStringValue(input.oldString)
  const after = parseStringValue(diff?.after) ?? parseStringValue(input.newString)
  return [
    {
      path: target ? filePath(target, directory) : undefined,
      relativePath: target,
      kind: "update",
      before,
      after,
      patch:
        parseStringValue(diff?.patch) ??
        (before === undefined && after === undefined ? parseStringValue(metadata.diff) : undefined),
      additions: nonNegativeInt(diff?.additions) ?? 0,
      deletions: nonNegativeInt(diff?.deletions) ?? 0,
    },
  ]
}

function standardLabel<TCode, TJurisdiction>(
  code: TCode,
  jurisdiction: TJurisdiction,
): string | undefined {
  const name = nonEmptyString(code)
  const region = nonEmptyString(jurisdiction)
  return name && region ? `${name} · ${region}` : (name ?? region)
}

function skillName(input: TJsonObject, metadata: TJsonObject, output?: string): string | undefined {
  return (
    nonEmptyString(metadata.name) ??
    nonEmptyString(input.name) ??
    output?.match(/<skill_content name="([^"]+)">/u)?.[1] ??
    nonEmptyString(input.id)
  )?.trim()
}

function todoStatus<TValue>(value: TValue): NonNullable<ToolState["todos"]>[number]["status"] {
  switch (parseStringValue(value)?.trim().toLowerCase()) {
    case "in_progress":
    case "in-progress":
    case "inprogress":
    case "running":
      return "in_progress"
    case "completed":
    case "complete":
    case "done":
      return "completed"
    case "cancelled":
    case "canceled":
    case "skipped":
      return "cancelled"
    default:
      return "pending"
  }
}

function toolDetails(
  name: string,
  input: TJsonObject,
  metadata: TJsonObject,
  output?: string,
): Pick<ToolState, "shell" | "todos" | "questions" | "skillContent"> {
  const todos = Array.isArray(metadata.todos) ? metadata.todos : input.todos
  const answers = Array.isArray(metadata.answers) ? metadata.answers : undefined
  return {
    shell:
      name === "shell" || name === "bash"
        ? {
            command: parseStringValue(input.command) ?? parseStringValue(metadata.command),
            output: output ?? parseStringValue(metadata.output),
          }
        : undefined,
    todos:
      name === "todowrite" && Array.isArray(todos)
        ? todos.flatMap((item) => {
            if (!isJsonObject(item)) return []
            const text = nonEmptyString(item.content)?.trim()
            return text === undefined
              ? []
              : [
                  {
                    text,
                    status: todoStatus(item.status),
                    priority: parseStringValue(item.priority),
                  },
                ]
          })
        : undefined,
    questions:
      name === "question" && Array.isArray(input.questions)
        ? input.questions.flatMap((item, index) => {
            if (!isJsonObject(item)) return []
            const text = parseStringValue(item.question)
            if (text === undefined) return []
            const answer = answers?.[index]
            return [
              {
                text,
                header: parseStringValue(item.header),
                multiple: parseBooleanValue(item.multiple),
                options: Array.isArray(item.options)
                  ? item.options.flatMap((option) => {
                      if (!isJsonObject(option)) return []
                      const label = parseStringValue(option.label)
                      return label === undefined
                        ? []
                        : [{ label, description: parseStringValue(option.description) }]
                    })
                  : [],
                answers:
                  answers === undefined || index >= answers.length
                    ? undefined
                    : Array.isArray(answer)
                      ? answer.flatMap((value) => {
                          const text = parseStringValue(value)
                          return text === undefined ? [] : [text]
                        })
                      : [],
              },
            ]
          })
        : undefined,
    skillContent:
      name === "skill" && output !== undefined
        ? output
            .replace(/^<skill_content name="[^"]+">\r?\n?/u, "")
            .replace(/\r?\n?<\/skill_content>\s*$/u, "")
        : undefined,
  }
}

function toolSummary(
  name: string,
  input: TJsonObject,
  metadata: TJsonObject,
  output?: string,
): ToolSummary | undefined {
  const text = (key: string) => parseStringValue(input[key])
  const description = text("description")
  const target = text("filePath") ?? text("path")
  const query = text("query")
  const format = text("format")
  const matches = (count?: number) =>
    count !== undefined
      ? { unit: "matches", count }
      : output
        ? {
            unit: "matches",
            count: output
              .trim()
              .split(/\r?\n/u)
              .filter((line) => line.trim().length > 0).length,
          }
        : undefined
  const args = (...keys: string[]): NonNullable<ToolSummary["args"]> =>
    keys.flatMap((key) => {
      const value =
        key === "offset" || key === "limit"
          ? parseFiniteNumber(input[key])
          : nonEmptyString(input[key])
      return value === undefined ? [] : [{ name: key, value }]
    })
  switch (name) {
    case "invalid":
      return { kind: "invalid-tool-call" }
    case "execute":
      return { kind: "run-connected-tools" }
    case "lsp":
      return { kind: "inspect-code" }
    case "plan_exit":
      return { kind: "finish-plan" }
    case "todoread":
      return { kind: "read-plan" }
    case "list_mcp_resources":
    case "opencode_list_mcp_resources":
      return { kind: "list-resources", subject: text("server") }
    case "list_mcp_resource_templates":
      return { kind: "list-resource-templates", subject: text("server") }
    case "read_mcp_resource":
    case "opencode_read_mcp_resource":
      return { kind: "read-resource", subject: text("uri") }
    case "read":
      return {
        kind: "read-file",
        subject: target,
        args: args("offset", "limit"),
        result: output ? { unit: "characters", count: output.length } : undefined,
      }
    case "write":
      return { kind: "write-file", subject: target }
    case "edit":
      return { kind: "edit-file", subject: target }
    case "patch":
    case "apply_patch":
      return { kind: "change-files", subject: description }
    case "shell":
    case "bash":
      return {
        kind: "run-command",
        subject: description,
        result: output ? { unit: "command" } : undefined,
      }
    case "list":
      return { kind: "list-files", subject: text("path"), result: matches() }
    case "glob":
      return {
        kind: "find-files",
        subject: text("pattern") ?? text("path"),
        detail: text("pattern") && text("path") ? text("path") : undefined,
        args: text("pattern") && text("path") ? args("path") : [],
        result: matches(),
      }
    case "grep":
      return {
        kind: "search-files",
        subject: text("pattern") ?? text("include") ?? text("path"),
        detail: text("path"),
        args: args("include", "path"),
        result: matches(nonNegativeInt(metadata.matches)),
      }
    case "webfetch":
      return {
        kind: "fetch-url",
        subject: text("url"),
        args: format === undefined ? undefined : [{ name: "format", value: format }],
      }
    case "websearch":
      return { kind: "search-web", subject: query, result: matches() }
    case "codesearch":
      return { kind: "search-code", subject: query, result: matches() }
    case "task":
    case "subagent":
      return { kind: "delegate", subject: description, agent: text("agent") }
    case "question":
      return { kind: "ask-questions", subject: description }
    case "todowrite":
      return { kind: "update-plan" }
    case "python_calculator":
      return {
        kind: "calculate",
        subject: description,
        result: output ? { unit: "value", text: output.trim() } : undefined,
      }
    case "learning_tool_search": {
      const items = Array.isArray(metadata.matchedToolIds)
        ? metadata.matchedToolIds.flatMap((value) => {
            const item = parseStringValue(value)
            return item === undefined ? [] : [item]
          })
        : []
      return {
        kind: "search-tools",
        subject: query,
        items,
        result: items.length ? { unit: "matched-tools", count: items.length } : undefined,
      }
    }
    case "learning_tool_load":
      return {
        kind: "load-tools",
        requested: Array.isArray(input.toolIds) ? input.toolIds.length : undefined,
        result: Array.isArray(metadata.registeredToolIds)
          ? { unit: "loaded-tools", count: metadata.registeredToolIds.length }
          : undefined,
      }
    case "ingest_full_text":
      return {
        kind: "load-text",
        subject: nonEmptyString(metadata.resource),
        result: {
          unit: "tokens",
          count: nonNegativeInt(metadata.fullTextEstimatedTokens),
          truncated: metadata.truncated === true,
        },
      }
    case "prepare_resource":
      return {
        kind: "prepare-resource",
        subject: parseStringValue(metadata.resource) ?? description,
      }
    case "reflection":
      return { kind: "reflect" }
    case "skill":
      return { kind: "use-skill", subject: skillName(input, metadata, output) }
    case "learner_memory_search":
      return { kind: "search-memory", subject: parseStringValue(metadata.query) }
    case "learner_memory_update":
      return { kind: "update-memory" }
    case "render_figure":
    case "render_freeform_figure":
      return { kind: "show-figure", subject: text("caption") ?? text("alt") }
    case "render_mermaid":
      return { kind: "show-diagram", subject: text("alt") }
    case "present_html_widget": {
      const result = isJsonObject(metadata.buddyObjectResult)
        ? metadata.buddyObjectResult
        : undefined
      const presentation = Array.isArray(result?.presentations)
        ? result.presentations.find(
            (entry) =>
              isJsonObject(entry) &&
              entry.surface === "inline" &&
              isJsonObject(entry.ref) &&
              entry.ref.kind === "html-widget" &&
              isJsonObject(entry.data) &&
              entry.data.renderer === "html-widget",
          )
        : undefined
      const ref =
        isJsonObject(presentation) && isJsonObject(presentation.ref) ? presentation.ref : undefined
      const data =
        isJsonObject(presentation) && isJsonObject(presentation.data)
          ? presentation.data
          : undefined
      const object = Array.isArray(result?.objects)
        ? result.objects.find(
            (entry) =>
              isJsonObject(entry) &&
              entry.kind === "html-widget" &&
              entry.objectID === ref?.objectID,
          )
        : undefined
      return {
        kind: "show-widget",
        subject:
          (isJsonObject(object) ? parseStringValue(object.title) : undefined) ??
          text("title") ??
          text("path"),
        result: data
          ? { unit: "viewport", text: parseStringValue(data.viewportPreset) }
          : undefined,
      }
    }
    case "save_question_set":
      return { kind: "save-questions", subject: description }
    case "search_standards":
    case "get_standard":
    case "get_learning_components":
    case "get_prerequisites":
    case "get_next_standards":
    case "get_crosswalk":
    case "query_standards_sql": {
      const value = isJsonObject(metadata.value)
        ? metadata.value
        : output
          ? parseJsonObjectFromText(output)
          : undefined
      const label = standardLabel(input.code, input.jurisdiction)
      if (name === "get_standard") {
        const standard = isJsonObject(value?.standard) ? value.standard : undefined
        return {
          kind: "read-standard",
          subject: label,
          result: { unit: "label", text: standardLabel(standard?.code, standard?.jurisdiction) },
        }
      }
      const family = {
        search_standards: {
          kind: "search-standards",
          count: "resultCount",
          list: "results",
          unit: "standards",
          subject: query,
        },
        get_learning_components: {
          kind: "read-learning-components",
          count: "componentCount",
          list: "components",
          unit: "learning-components",
          subject: label,
        },
        get_prerequisites: {
          kind: "read-prerequisites",
          count: "prerequisiteCount",
          list: "prerequisites",
          unit: "prerequisites",
          subject: label,
        },
        get_next_standards: {
          kind: "read-next-standards",
          count: "nextStandardCount",
          list: "nextStandards",
          unit: "next-standards",
          subject: label,
        },
        get_crosswalk: {
          kind: "read-crosswalk",
          count: "crosswalkCount",
          list: "crosswalks",
          unit: "crosswalks",
          subject:
            text("code") && text("targetJurisdiction")
              ? `${text("code")} → ${text("targetJurisdiction")}`
              : label,
        },
        query_standards_sql: {
          kind: "query-standards",
          count: "rowCount",
          list: "rows",
          unit: "rows",
          subject: text("sql"),
        },
      }[name]
      const list = value?.[family.list]
      return {
        kind: family.kind,
        subject: family.subject,
        result: value
          ? {
              unit: family.unit,
              count:
                nonNegativeInt(value[family.count]) ??
                (Array.isArray(list) ? list.length : undefined),
            }
          : undefined,
      }
    }
    default:
      return undefined
  }
}

export type MessageContext = {
  readonly sessionID: string
  readonly directory: string
  readonly parentID?: string
  readonly presentation?: ToolPresentationLookup
  readonly shellOutput?: ReadonlyMap<string, LiveShellOutput>
  readonly shellOutputClient?: ShellOutputClient
  readonly selection?: {
    readonly agent?: string
    readonly model?: SessionMessageAssistant["model"]
  }
  readonly importedCommandDisplay?: (messageID: string) => string | undefined
}

export function partID(messageID: string, index: number, key: string): string {
  return `prt_${messageID}_${index.toString().padStart(8, "0")}_${encodeURIComponent(key)}`
}

type ErrorCode = NonNullable<MessageError["code"]>
type ErrorClassification = { code: ErrorCode; anonymousCode?: ErrorCode }

const modelUnavailablePattern =
  /model .*(?:not supported|unsupported|disabled|not found|no longer available)|provider .*not supported|promotion has ended/iu
const overloadedPattern =
  /overload|capacity|no provider available|provider is busy|internal server error|service unavailable/iu
const providerErrorPatterns: readonly (readonly [ErrorCode, RegExp])[] = [
  ["temporarily_unavailable", overloadedPattern],
  ["model_unavailable", modelUnavailablePattern],
  [
    "access_denied",
    /not available (?:for your account|in your region)|region not allowed|permission denied|access denied/iu,
  ],
  [
    "quota_exceeded",
    /insufficient (?:balance|credits)|monthly (?:spending |usage )?limit|usage limit (?:has been )?reached|no payment method/iu,
  ],
  ["rate_limited", /rate[\s_-]*limit|too many requests|resource[\s_-]*exhausted|quota/iu],
]
const providerErrorIdentifiers: readonly (readonly [ErrorCode, readonly string[]])[] = [
  ["auth", ["authentication_error", "invalid_api_key", "unauthorized"]],
  ["credits_exhausted", ["insufficient_credits"]],
  ["quota_exceeded", ["billing_error", "insufficient_quota", "usage_limit", "usage_limit_reached"]],
  ["rate_limited", ["rate_limit_error", "rate_limited", "too_many_requests"]],
  [
    "temporarily_unavailable",
    ["overloaded_error", "server_error", "server_is_overloaded", "service_unavailable"],
  ],
  [
    "model_unavailable",
    ["model_disabled", "model_not_found", "model_not_supported", "unsupported_model"],
  ],
  ["region_blocked", ["region_not_allowed"]],
  ["access_denied", ["forbidden", "permission_denied"]],
  ["content_blocked", ["content_filter", "content_policy_violation"]],
  ["context_limit", ["context_length_exceeded", "context_window_exceeded"]],
]

function errorRecord(value: TJsonObject[string]): TJsonObject | undefined {
  if (isJsonObject(value)) return value
  const text = parseStringValue(value)
  return text === undefined ? undefined : parseJsonObjectFromText(text)
}

function providerErrorClassification(
  error: SessionStructuredError,
  payload: TJsonObject | undefined,
  providerID: string | undefined,
): ErrorClassification {
  const type = nonEmptyString(payload?.type)?.trim()
  const message = nonEmptyString(payload?.message)?.trim() ?? ""
  if (providerID === "opencode")
    switch (type) {
      case "AuthError":
        return modelUnavailablePattern.test(message)
          ? { code: "model_unavailable" }
          : { code: "auth", anonymousCode: "model_unavailable" }
      case "CreditsError":
        return { code: "credits_exhausted" }
      case "MonthlyLimitError":
      case "UserLimitError":
        return { code: "quota_exceeded" }
      case "RateLimitError":
      case "FreeUsageLimitError":
      case "GoUsageLimitError":
      case "BlackUsageLimitError":
        return { code: "rate_limited" }
      case "ModelError":
        return {
          code: overloadedPattern.test(message) ? "temporarily_unavailable" : "model_unavailable",
        }
      case "RegionError":
        return { code: "region_blocked" }
    }
  switch (error.type) {
    case "provider.auth":
      return { code: "auth", anonymousCode: "model_unavailable" }
    case "provider.quota":
      return { code: "quota_exceeded" }
    case "provider.rate-limit":
      return { code: "rate_limited" }
    case "provider.content-filter":
      return { code: "content_blocked" }
    case "provider.transport":
    case "provider.timeout":
      return { code: "network" }
    case "provider.internal":
      return { code: "temporarily_unavailable" }
    case "provider.invalid-output":
      return { code: "invalid_output" }
    case "provider.no-route":
    case "provider.unsupported-operation":
      return { code: "model_unavailable" }
  }
  const identifiers = [type, nonEmptyString(payload?.code)?.trim()].map((value) =>
    value?.toLowerCase(),
  )
  const structured = providerErrorIdentifiers.find(([, values]) =>
    identifiers.some((value) => value !== undefined && values.includes(value)),
  )
  if (structured) return { code: structured[0] }
  if (error.status === 402) return { code: "quota_exceeded" }
  if (error.status === 429) return { code: "rate_limited" }
  if (error.status !== undefined && error.status >= 500) return { code: "temporarily_unavailable" }
  if (error.status === 401) return { code: "auth", anonymousCode: "temporarily_unavailable" }
  if (error.status === 403) return { code: "auth" }
  if (error.status !== undefined) return { code: "unknown" }
  const searchable = `${message}\n${error.message}\n${error.response?.body ?? ""}`
  const pattern = providerErrorPatterns.find(([, pattern]) => pattern.test(searchable))
  if (pattern) return { code: pattern[0] }
  if (
    /invalid api key|missing api key|authentication failed|unauthorized|sign-in expired|token expired/iu.test(
      searchable,
    )
  ) {
    return { code: "auth", anonymousCode: "model_unavailable" }
  }
  if (
    /network|connection|econn|socket|timeout|timed out|unreachable|dns|fetch failed/iu.test(
      searchable,
    )
  )
    return { code: "network" }
  return { code: error.type === "provider.unknown" ? "model_unavailable" : "unknown" }
}

function messageErrorClassification(
  error: SessionStructuredError,
  payload: TJsonObject | undefined,
  providerID: string | undefined,
): ErrorClassification {
  switch (error.type) {
    case "ProviderAuthError":
      return { code: "auth", anonymousCode: "model_unavailable" }
    case "MessageOutputLengthError":
      return { code: "output_limit" }
    case "MessageAbortedError":
    case "aborted":
      return { code: "stopped" }
    case "StructuredOutputError":
      return { code: "invalid_output" }
    case "ContextOverflowError":
      return { code: "context_limit" }
    case "ContentFilterError":
      return { code: "content_blocked" }
    case "APIError":
      return providerErrorClassification(error, payload, providerID)
    default:
      return error.type.startsWith("provider.")
        ? providerErrorClassification(error, payload, providerID)
        : { code: "unknown" }
  }
}

export function toBuddyMessageError(
  error: SessionStructuredError,
  providerID?: string,
): MessageError {
  const root = error.response ? errorRecord(error.response.body) : undefined
  const payload = errorRecord(root?.error) ?? root
  const plan = nonEmptyString(payload?.plan_type)?.trim()
  const resetsAt = parseFiniteNumber(payload?.resets_at)
  const resetsInSeconds = parseFiniteNumber(payload?.resets_in_seconds)
  return {
    ...messageErrorClassification(error, payload, providerID),
    limit:
      plan !== undefined || resetsAt !== undefined || resetsInSeconds !== undefined
        ? { plan, resetsAt, resetsInSeconds }
        : undefined,
    name: error.type === "aborted" ? "MessageAbortedError" : error.type,
    message: error.message,
    data: { message: error.message, statusCode: error.status, responseBody: error.response?.body },
  }
}

function toolPart(
  part: SessionMessageAssistantTool,
  index: number,
  messageID: string,
  context: MessageContext,
): ToolPart {
  const id = partID(messageID, index, `tool:${part.id}`)
  const identity = {
    id,
    messageID,
    sessionID: context.sessionID,
    position: index,
    type: "tool",
    callID: part.id,
    tool: part.name,
    subagent: toBuddySubagentPresentation(part, messageID, context.sessionID),
  } as const
  const state = part.state
  const contents =
    state.status === "completed" || state.status === "error" ? (state.content ?? []) : []
  const contentTexts = contents.map((content) =>
    content.type === "text"
      ? content.text
      : [content.name, content.mime, content.uri].filter(Boolean).join(" "),
  )
  const output =
    state.status === "completed"
      ? state.content
          .flatMap((content) => (content.type === "text" ? [content.text] : []))
          .join("\n")
      : undefined
  const nativeText =
    state.status === "completed"
      ? contentTexts.join("\n")
      : state.status === "error"
        ? [state.error.message, ...contentTexts].filter(Boolean).join("\n")
        : undefined
  const fallbackText =
    state.status === "completed"
      ? [
          output,
          ...contents.flatMap((content, index) =>
            content.type === "file" ? [contentTexts[index]] : [],
          ),
        ]
          .filter(Boolean)
          .join("\n")
      : state.status === "error"
        ? state.error.message
        : undefined
  const sourceText = nativeText !== fallbackText ? nativeText : undefined
  const sourceIdentity = { ...identity, sourceText }
  const metadata = state.status === "streaming" ? {} : (state.metadata ?? {})
  const input =
    state.status === "streaming" ? (parseJsonObjectFromText(state.input) ?? {}) : state.input
  const summary = toolSummary(part.name, input, metadata, output)
  const detail =
    state.status === "streaming"
      ? undefined
      : coreToolPresentationDetail(summary?.kind, input, metadata)
  const normalized = {
    ...toolDetails(
      part.name,
      input,
      metadata,
      output ??
        (state.status === "error" && state.content !== undefined
          ? contents
              .flatMap((content) => (content.type === "text" ? [content.text] : []))
              .join("\n")
          : undefined),
    ),
    outcome: toolOutcome(part.name, state),
    summary,
    fileChanges: toolFileChanges(part.name, input, metadata, context.directory),
    filesChanged:
      state.status === "completed" &&
      ["write", "edit", "patch", "shell", "apply_patch", "bash"].includes(part.name) &&
      !("compacted" in part.time && part.time.compacted !== undefined),
  }
  const shellID = runningShellID(part)
  const liveOutput = shellID === undefined ? undefined : context.shellOutput?.get(shellID)
  if (normalized.shell && liveOutput)
    normalized.shell = { ...normalized.shell, output: liveOutput.output }
  if (state.status === "streaming") {
    return withToolPresentationOnPart(
      {
        ...sourceIdentity,
        state: { ...normalized, status: "pending", input: {}, raw: state.input, metadata },
      },
      context.presentation,
      detail,
    )
  }
  const time = { start: part.time.ran ?? part.time.created, end: part.time.completed }
  if (state.status === "running") {
    return withToolPresentationOnPart(
      {
        ...sourceIdentity,
        state: { ...normalized, status: "running", input: state.input, metadata, time },
      },
      context.presentation,
      detail,
    )
  }
  if (state.status === "error") {
    return withToolPresentationOnPart(
      {
        ...sourceIdentity,
        state: {
          ...normalized,
          status: "error",
          input: state.input,
          metadata,
          time,
          error: state.error.message,
          errorType: state.error.type,
        },
      },
      context.presentation,
      detail,
    )
  }
  const attachments = state.content
    .flatMap((content, attachmentIndex) =>
      content.type === "file"
        ? [
            {
              id: `${id}:attachment:${attachmentIndex}`,
              type: "file" as const,
              sessionID: context.sessionID,
              messageID,
              mime: content.mime,
              filename: content.name ?? undefined,
              url: content.uri,
            },
          ]
        : [],
    )
    .map((attachment, position) => Object.assign(attachment, { position }))
  return withToolPresentationOnPart(
    {
      ...sourceIdentity,
      state: {
        ...normalized,
        status: "completed",
        input: state.input,
        metadata,
        time,
        output: output ?? "",
        attachments,
      },
    },
    context.presentation,
    detail,
  )
}

export function toBuddyAssistantPart(
  content: SessionMessageAssistant["content"][number],
  index: number,
  message: SessionMessageAssistant,
  context: MessageContext,
): Part {
  if (content.type === "tool") return toolPart(content, index, message.id, context)
  const identity = {
    id: partID(message.id, index, content.type),
    messageID: message.id,
    sessionID: context.sessionID,
    position: index,
  }
  if (content.type === "reasoning") {
    return {
      ...identity,
      type: "reasoning",
      text: content.text,
      metadata: content.state,
      time: { start: content.time?.created ?? message.time.created, end: content.time?.completed },
    }
  }
  return { ...identity, type: "text", text: content.text, metadata: content.state }
}

function assistantInfo(message: SessionMessageInfo, context: MessageContext): AssistantMessage {
  const assistant = message.type === "assistant" ? message : undefined
  const model = assistant?.model
  const tokens =
    assistant?.tokens ??
    (message.type === "compaction" && message.status !== "running" ? message.tokens : undefined) ??
    EmptyTokens
  return {
    id: message.id,
    order: message.id,
    sessionID: context.sessionID,
    role: "assistant",
    time: message.time,
    parentID: context.parentID ?? "",
    agent: assistant?.agent ?? "",
    mode: assistant?.agent ?? "",
    modelID: model?.id ?? "",
    providerID: model?.providerID ?? "",
    variant: model?.variant,
    path: { cwd: context.directory, root: context.directory },
    cost:
      assistant?.cost ??
      (message.type === "compaction" && message.status !== "running" ? message.cost : undefined) ??
      0,
    tokens,
    usageRecorded: assistant?.tokens !== undefined,
    error: assistant?.error ? toBuddyMessageError(assistant.error, model?.providerID) : undefined,
    finish: assistant?.finish,
    metadata: message.metadata,
  }
}

function noticeText(
  message: Extract<SessionMessageInfo, { type: "synthetic" | "skill" | "shell" }>,
): string {
  if (message.type === "skill") return `Using skill: ${message.name}`
  if (message.type === "shell")
    return `${message.command}${message.output?.output ? `\n${message.output.output}` : ""}`
  const source = message.metadata?.source
  if (source === "subagent" || source === "shell") {
    const state = message.metadata?.state
    const label = source === "subagent" ? "Subagent" : "Shell"
    const status = state === "error" ? "failed" : state === "cancelled" ? "cancelled" : "completed"
    return `${label} ${status}${message.description ? `: ${message.description}` : ""}`
  }
  return message.description ?? message.text
}

function normalizeImportedCommand(
  message: SessionMessageInfo,
  importedCommandDisplay: MessageContext["importedCommandDisplay"],
): SessionMessageInfo {
  const display = message.type === "synthetic" ? importedCommandDisplay?.(message.id) : undefined
  if (message.type !== "synthetic" || display === undefined) return message
  return {
    id: message.id,
    type: "user",
    text: message.text,
    time: message.time,
    metadata: {
      ...message.metadata,
      buddy: { ...parseJsonObject(message.metadata?.buddy), command: { display } },
    },
  }
}

export function toBuddyMessage(
  native: SessionMessageInfo,
  context: MessageContext,
): MessageWithParts | undefined {
  const message = normalizeImportedCommand(native, context.importedCommandDisplay)
  const base = { sessionID: context.sessionID, messageID: message.id }
  if (message.type === "user") {
    const display = readCommandDisplay(message.metadata)
    const presentation =
      display === undefined ? readPromptPresentation(message.metadata, message.text) : undefined
    const parts: Part[] = presentation?.segments.length
      ? presentation.segments.map((segment, index) =>
          Object.assign({}, base, {
            id: partID(message.id, index, "text"),
            position: index,
            type: "text" as const,
            text: message.text.slice(segment.start, segment.end),
            synthetic: segment.synthetic,
            ignored: segment.ignored,
            metadata: segment.metadata,
          }),
        )
      : [
          {
            ...base,
            id: partID(message.id, 0, "text"),
            position: 0,
            type: "text",
            text: display ?? message.text,
          },
        ]
    function mentionRange(mention: { text: string; start: number; end: number } | undefined) {
      if (!mention) return undefined
      if (display !== undefined) {
        const start = display.indexOf(mention.text)
        return start < 0
          ? undefined
          : { value: mention.text, start, end: start + mention.text.length }
      }
      if (!presentation) return { value: mention.text, start: mention.start, end: mention.end }
      let offset = 0
      for (const segment of presentation.segments) {
        if (!isVisibleToUserTextPartInfo({ ...segment, type: "text" })) continue
        if (mention.start >= segment.start && mention.end <= segment.end)
          return {
            value: mention.text,
            start: offset + mention.start - segment.start,
            end: offset + mention.end - segment.start,
          }
        offset += segment.end - segment.start
      }
      return undefined
    }
    for (const file of message.files ?? []) {
      const source = { ...file.source, text: mentionRange(file.mention) }
      parts.push({
        ...base,
        id: partID(message.id, parts.length, "file"),
        position: parts.length,
        type: "file",
        mime: file.mime,
        filename: file.name,
        source,
        sourceText: file.mention?.text,
        url: `data:${file.mime};base64,${file.data}`,
      })
    }
    for (const agent of message.agents ?? []) {
      parts.push({
        ...base,
        id: partID(message.id, parts.length, "agent"),
        position: parts.length,
        type: "agent",
        name: agent.name,
        sourceText: agent.mention?.text,
        source: mentionRange(agent.mention),
      })
    }
    return {
      info: {
        id: message.id,
        order: message.id,
        sessionID: context.sessionID,
        role: "user",
        time: message.time,
        metadata: message.metadata,
        sourceText: message.text,
        agent: context.selection?.agent ?? "",
        model: {
          providerID: context.selection?.model?.providerID ?? "",
          modelID: context.selection?.model?.id ?? "",
          variant:
            context.selection?.model?.variant === "default"
              ? undefined
              : context.selection?.model?.variant,
        },
      },
      parts,
    }
  }
  if (message.type === "assistant") {
    return {
      info: assistantInfo(message, context),
      parts: message.content.map((content, index) =>
        toBuddyAssistantPart(content, index, message, context),
      ),
    }
  }
  if (message.type === "synthetic" || message.type === "skill" || message.type === "shell") {
    if (
      message.type === "synthetic" &&
      !message.description &&
      parseStringValue(message.metadata?.source) === undefined
    )
      return undefined
    const info = assistantInfo(message, context)
    return {
      info: {
        ...info,
        kind: message.type,
        description: "description" in message ? message.description : undefined,
        finish: message.type === "shell" && message.status === "running" ? undefined : "stop",
        time: {
          ...info.time,
          completed: message.type === "shell" ? message.time.completed : message.time.created,
        },
      },
      parts: [
        {
          ...base,
          id: partID(message.id, 0, "notice"),
          position: 0,
          type: "notice",
          text: noticeText(message),
          metadata: message.metadata,
          source:
            message.type === "synthetic"
              ? parseStringValue(message.metadata?.source)
              : message.type,
          status:
            message.type === "shell" ? message.status : parseStringValue(message.metadata?.state),
          completion: toBuddySubagentCompletion(message, context.sessionID),
        },
      ],
    }
  }
  if (message.type === "compaction") {
    const info = assistantInfo(message, context)
    return {
      info: {
        ...info,
        kind: "compaction",
        summary: true,
        finish: message.status === "running" ? undefined : "stop",
        time: {
          ...info.time,
          completed: message.status === "running" ? undefined : message.time.created,
        },
        error: message.status === "failed" ? toBuddyMessageError(message.error) : undefined,
      },
      parts: [
        {
          ...base,
          id: partID(message.id, 0, "compaction"),
          position: 0,
          type: "compaction",
          auto: message.reason === "auto",
          status: message.status,
          error: message.status === "failed" ? message.error.message : undefined,
          summary: "summary" in message ? message.summary : undefined,
          recent: "recent" in message ? message.recent : undefined,
        },
      ],
    }
  }
  return undefined
}

export async function listMessages(
  client: SessionClient,
  context: MessageContext,
  input: { readonly limit?: number; readonly before?: string } = {},
) {
  const limit =
    input.limit === undefined || input.limit === 0 ? 200 : Math.min(200, Math.max(1, input.limit))
  let cursor = input.before
  const messages: SessionMessageInfo[] = []
  do {
    const page = await client.message.list({
      sessionID: context.sessionID,
      limit,
      ...(cursor ? { cursor } : { order: "desc" }),
    })
    messages.unshift(...page.data.toReversed())
    cursor = page.cursor.next ?? undefined
    if (input.limit && messages.some((message) => toBuddyMessage(message, context) !== undefined))
      break
  } while (cursor)
  return { items: await mapSessionMessages(client, context, messages), cursor }
}

export async function listContextMessages(client: SessionClient, context: MessageContext) {
  const messages = await client.session.context({ sessionID: context.sessionID })
  return mapSessionMessages(client, context, messages)
}

async function mapSessionMessages(
  client: SessionClient,
  context: MessageContext,
  native: readonly SessionMessageInfo[],
) {
  const messages = native.map((message) =>
    normalizeImportedCommand(message, context.importedCommandDisplay),
  )
  const shellOutput = context.shellOutputClient
    ? await readMessageShellOutput(context.shellOutputClient, messages, context.directory)
    : context.shellOutput
  let parentID = context.parentID
  const leading = messages.find((message) => toBuddyMessage(message, context) !== undefined)
  if (leading && leading.type !== "user" && parentID === undefined) {
    parentID = (
      await previousUserMessage(
        client,
        context.sessionID,
        leading.id,
        undefined,
        context.importedCommandDisplay,
      )
    )?.id
  }
  let selection = context.selection
  const switched = { agent: false, model: false }
  const firstUser = messages.findIndex((message) => message.type === "user")
  const user = messages[firstUser]
  if (user) {
    const preceding = messages.slice(0, firstUser)
    switched.agent = preceding.some((message) => message.type === "agent-switched")
    switched.model = preceding.some((message) => message.type === "model-switched")
    if (!switched.agent || !switched.model) {
      const reply = messages.slice(firstUser + 1).find((message) => message.type === "assistant")
      const before = await selectionBefore(client, context.sessionID, user.id, undefined, reply)
      selection = before.selection
      switched.agent ||= before.switched.agent
      switched.model ||= before.switched.model
    }
  }
  return messages.flatMap((message, index) => {
    if (message.type === "agent-switched") {
      selection = { ...selection, agent: message.agent }
      switched.agent = true
    }
    if (message.type === "model-switched") {
      selection = { ...selection, model: message.model }
      switched.model = true
    }
    if (message.type === "user") {
      parentID = message.id
      if (!switched.agent || !switched.model) {
        const reply = messages
          .slice(index + 1)
          .find((message) => message.type === "assistant" || message.type === "user")
        if (reply?.type === "assistant") {
          if (!switched.agent) selection = { ...selection, agent: reply.agent }
          if (!switched.model) selection = { ...selection, model: reply.model }
        }
      }
    }
    const mapped = toBuddyMessage(message, { ...context, parentID, shellOutput, selection })
    return mapped ? [mapped] : []
  })
}

export async function getMessage(
  client: SessionClient,
  context: MessageContext,
  messageID: string,
) {
  const native = normalizeImportedCommand(
    await client.session.message.get({ sessionID: context.sessionID, messageID }),
    context.importedCommandDisplay,
  )
  const shellOutput = context.shellOutputClient
    ? await readMessageShellOutput(context.shellOutputClient, [native], context.directory)
    : context.shellOutput
  const selection =
    native.type === "user"
      ? await messageSelectionBefore(client, context.sessionID, messageID)
      : context.selection
  const message = toBuddyMessage(native, { ...context, shellOutput, selection })
  if (message?.info.role !== "assistant" || context.parentID !== undefined) return message
  const parent = await previousUserMessage(
    client,
    context.sessionID,
    messageID,
    undefined,
    context.importedCommandDisplay,
  )
  return { ...message, info: { ...message.info, parentID: parent?.id ?? "" } }
}

export async function messageSelectionBefore(
  client: Pick<EventClient, "session" | "message">,
  sessionID: string,
  messageID: string,
  signal?: AbortSignal,
  reply?: SessionMessageAssistant,
): Promise<NonNullable<MessageContext["selection"]>> {
  return (await selectionBefore(client, sessionID, messageID, signal, reply)).selection
}

async function selectionBefore(
  client: Pick<EventClient, "session" | "message">,
  sessionID: string,
  messageID: string,
  signal?: AbortSignal,
  reply?: SessionMessageAssistant,
) {
  const cursor = Buffer.from(
    JSON.stringify({ id: messageID, order: "desc", direction: "next" }),
  ).toString("base64url")
  const [agents, models] = await Promise.all([
    client.message.list({ sessionID, type: "agent-switched", limit: 1, cursor }, { signal }),
    client.message.list({ sessionID, type: "model-switched", limit: 1, cursor }, { signal }),
  ])
  const agent = agents.data[0]
  const model = models.data[0]
  const switched = {
    agent: agent?.type === "agent-switched",
    model: model?.type === "model-switched",
  }
  if (agent?.type === "agent-switched" && model?.type === "model-switched")
    return { selection: { agent: agent.agent, model: model.model }, switched }
  if (!reply) {
    const page = await client.message.list(
      {
        sessionID,
        type: "assistant",
        limit: 1,
        cursor: Buffer.from(
          JSON.stringify({ id: messageID, order: "asc", direction: "next" }),
        ).toString("base64url"),
      },
      { signal },
    )
    const message = page.data[0]
    if (message?.type === "assistant") reply = message
  }
  const fallback = reply ?? (await client.session.get({ sessionID }, { signal }))
  return {
    selection: {
      agent: agent?.type === "agent-switched" ? agent.agent : fallback.agent,
      model: model?.type === "model-switched" ? model.model : fallback.model,
    },
    switched,
  }
}

export async function previousUserMessage(
  client: Pick<SessionClient, "message">,
  sessionID: string,
  messageID: string,
  signal?: AbortSignal,
  importedCommandDisplay?: MessageContext["importedCommandDisplay"],
) {
  const before = Buffer.from(
    JSON.stringify({ id: messageID, order: "desc", direction: "next" }),
  ).toString("base64url")
  const page = await client.message.list(
    { sessionID, type: "user", limit: 1, cursor: before },
    { signal },
  )
  const user = page.data[0]?.type === "user" ? page.data[0] : undefined
  if (!importedCommandDisplay) return user
  let cursor: string | undefined = before
  do {
    const synthetic = await client.message.list(
      { sessionID, type: "synthetic", limit: 50, cursor },
      { signal },
    )
    for (const native of synthetic.data) {
      if (user && native.time.created < user.time.created) return user
      const message = normalizeImportedCommand(native, importedCommandDisplay)
      if (message.type === "user") return message
    }
    cursor = synthetic.cursor.next ?? undefined
  } while (cursor)
  return user
}
