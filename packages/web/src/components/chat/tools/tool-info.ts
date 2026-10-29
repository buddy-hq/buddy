import { basename, dirname } from "../utils/path"
import { isChatToolPart } from "../utils/part-guards"
import type { ToolSummary } from "@buddy/transcript-contract/message"
import type { ToolPresentationSnapshot } from "@buddy/transcript-contract/tool-presentation"
import type { MessagePart } from "@/state/chat-types"
import { language } from "@/context/language"
import { formatHtmlWidgetViewport, resolveHtmlWidgetViewport } from "@/lib/html-widgets"
import {
  getSkillToolTitle,
  getSkillReferenceToolTitle,
  humanizeSkillDisplayName,
  resolveSkillReference,
} from "./skill-reference"
import type { ToolInfo, ToolState } from "./types"
import { parseToolPresentation } from "./parse-tool-presentation"

const IMAGE_FILE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]

function isImageFilePath(filePath: string | undefined): boolean {
  if (!filePath) return false
  const lower = filePath.toLowerCase()
  return IMAGE_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function hasImageAttachments(state: ToolState): boolean {
  return state.attachments?.some((a) => a.mime.startsWith("image/")) ?? false
}

const KNOWLEDGE_GRAPH_TOOL_TITLES = {
  "search-standards": "Search Standards",
  "read-standard": "Get Standard",
  "read-learning-components": "Learning Components",
  "read-prerequisites": "Prerequisites",
  "read-next-standards": "Next Standards",
  "read-crosswalk": "Crosswalk",
  "query-standards": "Standards SQL",
} as const

const MAX_VISIBLE_TOOLS = 4

type VisibleToolPresentationSnapshot = Exclude<ToolPresentationSnapshot, { archetype: "silent" }>

type ToolResult = NonNullable<ToolSummary["result"]>

function formatCountSummary(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`
}

function formatResultCount(
  result: ToolResult,
  singular: string,
  plural: string,
): string | undefined {
  return result.count !== undefined ? formatCountSummary(result.count, singular, plural) : undefined
}

function formatTokenResult(result: ToolResult): string | undefined {
  if (result.count !== undefined) {
    return language.t(
      result.truncated ? "chatTools.info.tokensLoadedTruncated" : "chatTools.info.tokensLoaded",
      { count: result.count.toLocaleString() },
    )
  }
  return result.truncated ? language.t("chatTools.info.outputTruncated") : undefined
}

function formatViewportResult(result: ToolResult): string | undefined {
  const viewport = result.text === undefined ? undefined : resolveHtmlWidgetViewport(result.text)
  return viewport ? formatHtmlWidgetViewport(viewport) : undefined
}

function formatToolResult(result: ToolResult | undefined): string | undefined {
  if (!result) return undefined

  switch (result.unit) {
    case "characters":
      return result.count !== undefined ? `${result.count.toLocaleString()} chars` : undefined
    case "matches":
      return result.count !== undefined
        ? language.t(
            result.count === 1
              ? "chatTools.info.resultCount.one"
              : "chatTools.info.resultCount.other",
            { count: result.count },
          )
        : undefined
    case "command":
      return language.t("chatTools.commandExecuted")
    case "value":
      return result.text !== undefined
        ? language.t("chatTools.info.result", { value: result.text })
        : undefined
    case "matched-tools":
      return result.count ? `${result.count} matched` : undefined
    case "loaded-tools":
      return result.count !== undefined ? `${result.count} loaded` : undefined
    case "tokens":
      return formatTokenResult(result)
    case "viewport":
      return formatViewportResult(result)
    case "standards": {
      const standards = formatResultCount(result, "standard", "standards")
      return standards ? `Found ${standards}` : undefined
    }
    case "label":
      return result.text
    case "learning-components":
      return formatResultCount(result, "learning component", "learning components")
    case "prerequisites":
      return formatResultCount(result, "prerequisite", "prerequisites")
    case "next-standards":
      return formatResultCount(result, "next standard", "next standards")
    case "crosswalks":
      return formatResultCount(result, "crosswalk", "crosswalks")
    case "rows":
      return formatResultCount(result, "row", "rows")
    default:
      return undefined
  }
}

function formatToolArgs(summary: ToolSummary): string[] {
  return (summary.args ?? []).map((arg) => `${arg.name}=${arg.value}`)
}

function formatMatchedToolNames(items: readonly string[] | undefined): string | undefined {
  if (!items || items.length === 0) return undefined
  const hidden = items.length - MAX_VISIBLE_TOOLS
  return items.slice(0, MAX_VISIBLE_TOOLS).join(", ") + (hidden > 0 ? ` +${hidden} more` : "")
}

function withMetadataTitle(
  info: ToolInfo,
  presentation: VisibleToolPresentationSnapshot,
): ToolInfo {
  return {
    ...info,
    title: presentation.action,
    subtitle: presentation.detail,
  }
}

export function getToolInfo(
  state: ToolState,
  presentation: VisibleToolPresentationSnapshot,
): ToolInfo {
  const summary = state.summary
  const subject = summary?.subject
  const result = formatToolResult(summary?.result)

  const active = state.status === "pending" || state.status === "running"
  const metadataTitle = presentation

  switch (summary?.kind) {
    case "read-file": {
      const args = formatToolArgs(summary)
      const isImage = isImageFilePath(subject) || hasImageAttachments(state)
      const skillReference = resolveSkillReference(subject)
      if (skillReference) {
        return withMetadataTitle(
          {
            title: getSkillReferenceToolTitle(active),
            subtitle: skillReference.displayName,
            detail: skillReference.skillName,
            summary: result,
            args,
          },
          metadataTitle,
        )
      }
      const title = active
        ? language.t(isImage ? "chatTools.info.read.image.running" : "chatTools.info.read.running")
        : language.t(isImage ? "chatTools.info.read.image" : "chatTools.info.read")
      return withMetadataTitle(
        {
          title,
          subtitle: subject ? basename(subject) : undefined,
          detail: subject ? dirname(subject) : undefined,
          summary: result,
          args,
        },
        metadataTitle,
      )
    }
    case "list-files":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.list.running" : "chatTools.info.list"),
          subtitle: subject ? dirname(subject) : "/",
          summary: result,
        },
        metadataTitle,
      )
    case "find-files":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.glob.running" : "chatTools.info.glob"),
          subtitle: subject,
          detail: summary.detail,
          summary: result,
          args: formatToolArgs(summary),
        },
        metadataTitle,
      )
    case "search-files":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.grep.running" : "chatTools.info.grep"),
          subtitle: subject,
          detail: summary.detail,
          summary: result,
          args: formatToolArgs(summary),
        },
        metadataTitle,
      )
    case "fetch-url":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.webfetch.running" : "chatTools.info.webfetch"),
          subtitle: subject,
          summary: result,
        },
        metadataTitle,
      )
    case "search-web":
      return withMetadataTitle(
        {
          title: language.t(
            active ? "chatTools.info.websearch.running" : "chatTools.info.websearch",
          ),
          subtitle: subject,
          summary: result,
        },
        metadataTitle,
      )
    case "search-code":
      return withMetadataTitle(
        {
          title: language.t(
            active ? "chatTools.info.codesearch.running" : "chatTools.info.codesearch",
          ),
          subtitle: subject,
          summary: result,
        },
        metadataTitle,
      )
    case "search-tools":
      return withMetadataTitle(
        {
          title: "Search Tools",
          subtitle: formatMatchedToolNames(summary.items) ?? subject,
          summary: result,
        },
        metadataTitle,
      )
    case "load-tools":
      return withMetadataTitle(
        {
          title: "Load Tools",
          subtitle:
            summary.requested !== undefined
              ? `${summary.requested.toLocaleString()} requested`
              : undefined,
          summary: result,
        },
        metadataTitle,
      )
    case "delegate":
      return withMetadataTitle(
        {
          title: summary.agent
            ? language.t("chatTools.info.agent", { subagent: summary.agent })
            : language.t(active ? "chatTools.info.agentTask.running" : "chatTools.info.agentTask"),
          subtitle: subject,
        },
        metadataTitle,
      )
    case "write-file":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.write.running" : "chatTools.info.write"),
          subtitle: subject ? basename(subject) : undefined,
          detail: subject ? dirname(subject) : undefined,
        },
        metadataTitle,
      )
    case "edit-file":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.edit.running" : "chatTools.info.edit"),
          subtitle: subject ? basename(subject) : undefined,
          detail: subject ? dirname(subject) : undefined,
        },
        metadataTitle,
      )
    case "change-files":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.patch.running" : "chatTools.info.patch"),
          subtitle: subject,
        },
        metadataTitle,
      )
    case "run-command":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.shell.running" : "chatTools.info.shell"),
          subtitle: subject,
          summary: result,
        },
        metadataTitle,
      )
    case "ask-questions":
      return withMetadataTitle(
        {
          title: language.t(
            active ? "chatTools.info.questions.running" : "chatTools.info.questions",
          ),
          subtitle: subject,
        },
        metadataTitle,
      )
    case "update-plan":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.todos.running" : "chatTools.todos"),
        },
        metadataTitle,
      )
    case "calculate":
      return withMetadataTitle(
        {
          title: language.t(
            active ? "chatTools.info.pythonCalculator.running" : "chatTools.info.pythonCalculator",
          ),
          subtitle: subject,
          summary: result,
        },
        metadataTitle,
      )
    case "load-text":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.fullText.running" : "chatTools.info.fullText"),
          subtitle: subject,
          summary: result,
        },
        metadataTitle,
      )
    case "prepare-resource":
      return withMetadataTitle(
        {
          title: active ? "Preparing Resource" : "Prepare Resource",
          subtitle: subject,
        },
        metadataTitle,
      )
    case "reflect":
      return withMetadataTitle(
        {
          title: active ? "Pedagogy Reflection" : "Pedagogy Reflection",
        },
        metadataTitle,
      )
    case "use-skill":
      return withMetadataTitle(
        {
          title: getSkillToolTitle(active),
          subtitle: subject ? humanizeSkillDisplayName(subject) : undefined,
        },
        metadataTitle,
      )
    case "search-memory":
      return withMetadataTitle(
        {
          title: active ? "Searching Memory" : "Search Memory",
          subtitle: subject,
        },
        metadataTitle,
      )
    case "update-memory":
      return withMetadataTitle(
        {
          title: active ? "Updating Memory" : "Update Memory",
        },
        metadataTitle,
      )
    case "show-figure":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.figure.running" : "chatTools.info.figure"),
          subtitle: subject,
        },
        metadataTitle,
      )
    case "show-diagram":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.mermaid.running" : "chatTools.info.mermaid"),
          subtitle: subject,
        },
        metadataTitle,
      )
    case "show-widget":
      return withMetadataTitle(
        {
          title: active ? "Presenting HTML Widget" : "HTML Widget",
          subtitle: subject,
          summary: result,
        },
        metadataTitle,
      )
    case "save-questions":
      return withMetadataTitle(
        {
          title: "Save Question Set",
          subtitle: subject,
        },
        metadataTitle,
      )
    case "search-standards":
    case "read-standard":
    case "read-learning-components":
    case "read-prerequisites":
    case "read-next-standards":
    case "read-crosswalk":
    case "query-standards":
      return withMetadataTitle(
        {
          title: KNOWLEDGE_GRAPH_TOOL_TITLES[summary.kind],
          subtitle: subject,
          summary: result,
        },
        metadataTitle,
      )
    default:
      return {
        title: metadataTitle.action,
        subtitle: metadataTitle.detail,
        summary: result,
      }
  }
}

export function getToolInfoForPart(part: MessagePart, state: ToolState): ToolInfo | undefined {
  if (!isChatToolPart(part)) return undefined
  const presentation = parseToolPresentation(part)
  if (!presentation || presentation.archetype === "silent") return undefined
  return getToolInfo(state, presentation)
}
