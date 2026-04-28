import { language } from "@/context/language"

import { reasoningHeading } from "../utils/markdown"
import { stripAnsi } from "../utils/path"
import { readNonEmptyString } from "./types"
import type {
  ResolvedSummaryContent,
  ResolvedSummaryContentFormat,
  ResolvedToolSummaryAggregate,
  ResolvedToolSummary,
  ToolPartProps,
  ToolSummary,
} from "./tool-registry-types"

const PREVIEW_MAX_CHARS = 320
const SUMMARY_ROW_PREVIEW_MAX_CHARS = 220
const MARKDOWN_FILE_EXTENSIONS = new Set([".md", ".mdown", ".markdown", ".mdx"])

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function normalizeText(value: string): string {
  return stripAnsi(value).replace(/\r\n?/g, "\n").trim()
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value
  }

  return `${value.slice(0, maxChars).trimEnd()}...`
}

function summarizeText(value: string | undefined, maxChars: number): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const normalized = normalizeText(value)
  if (!normalized) {
    return undefined
  }

  return truncateText(normalized, maxChars)
}

function buildLabel(title: string, detail: string | undefined): string {
  return detail ? `${title}: ${detail}` : title
}

function fileExtension(path: string | undefined): string | undefined {
  if (!path) {
    return undefined
  }

  const match = path.toLowerCase().match(/(\.[^./\\]+)$/u)
  return match ? match[1] : undefined
}

function isMarkdownRead(props: ToolPartProps): boolean {
  const path =
    readNonEmptyString(props.state.input.filePath) ?? readNonEmptyString(props.info.subtitle)
  const extension = fileExtension(path)
  return extension ? MARKDOWN_FILE_EXTENSIONS.has(extension) : false
}

function searchInputText(props: ToolPartProps): string | undefined {
  switch (props.tool) {
    case "grep":
      return (
        readNonEmptyString(props.state.input.pattern) ??
        readNonEmptyString(props.state.input.include)
      )
    case "glob":
      return (
        readNonEmptyString(props.state.input.pattern) ?? readNonEmptyString(props.state.input.path)
      )
    case "list":
      return readNonEmptyString(props.state.input.path)
    case "codesearch":
    case "websearch":
      return readNonEmptyString(props.state.input.query)
    default:
      return undefined
  }
}

function resolveSummaryErrorPreview(props: ToolPartProps): string | undefined {
  const errorText = stripAnsi(String(props.state.error ?? "")).trim()
  if (errorText) {
    return errorText
  }

  const outputText = stripAnsi(String(props.state.output ?? "")).trim()
  if (outputText) {
    return outputText
  }

  if (props.tool === "bash") {
    return `${language.t("chatTools.shell")} failed.`
  }

  return props.info.title ? `${props.info.title} failed.` : "Step failed."
}

function resolveSummaryAggregate(summary: ToolSummary): ResolvedToolSummaryAggregate | undefined {
  const aggregate = summary.aggregate
  if (!aggregate || aggregate.mode === "none") {
    return undefined
  }

  switch (aggregate.mode) {
    case "label-times":
      return {
        key: aggregate.key,
        mode: aggregate.mode,
        label: aggregate.label,
        entryLabel: aggregate.entryLabel,
      }
    case "action-times":
      return {
        key: aggregate.key,
        mode: aggregate.mode,
        action: aggregate.action,
      }
    case "count-items":
      return {
        key: aggregate.key,
        mode: aggregate.mode,
        past: aggregate.past,
        singular: aggregate.singular,
        plural: aggregate.plural,
      }
  }
}

function withResolvedSummary(
  summary: ToolSummary,
  resolved: Omit<ResolvedToolSummary, "aggregate">,
): ResolvedToolSummary {
  return {
    ...resolved,
    aggregate: resolveSummaryAggregate(summary),
  }
}

export function resolveToolSummary(
  summary: ToolSummary,
  props: ToolPartProps,
): ResolvedToolSummary {
  switch (summary.pattern) {
    case "info":
      return withResolvedSummary(summary, {
        display: summary.display,
        label: buildLabel(props.info.title, props.info.summary ?? props.info.subtitle),
        details: [props.info.subtitle, props.info.summary]
          .filter(isNonEmptyString)
          .map((value) => ({ value, format: "text" as const })),
        errorPreview: summary.suppressError ? undefined : resolveSummaryErrorPreview(props),
        errorVisibility: summary.suppressError ? "suppressed" : "visible",
        suppressError: summary.suppressError,
      })
    case "metadata":
      return withResolvedSummary(summary, {
        display: summary.display,
        label: props.info.title,
        details: [props.info.subtitle, props.info.summary]
          .filter(isNonEmptyString)
          .map((value) => ({ value, format: "text" as const })),
        errorPreview: summary.suppressError ? undefined : resolveSummaryErrorPreview(props),
        errorVisibility: summary.suppressError ? "suppressed" : "visible",
        suppressError: summary.suppressError,
      })
    case "query": {
      const queryText = props.info.summary ?? searchInputText(props) ?? props.info.subtitle
      const previewValue = summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? queryText

      return withResolvedSummary(summary, {
        display: summary.display,
        label: buildLabel(props.info.title, queryText),
        preview: previewValue
          ? {
              value: previewValue,
              format: "text",
            }
          : undefined,
        errorPreview: summary.suppressError ? undefined : resolveSummaryErrorPreview(props),
        errorVisibility: summary.suppressError ? "suppressed" : "visible",
        suppressError: summary.suppressError,
      })
    }
    case "read": {
      const fileName = props.info.subtitle
      const fileDirectory = props.info.detail
      const snippet = summarizeText(props.state.output, SUMMARY_ROW_PREVIEW_MAX_CHARS)
      const markdown = isMarkdownRead(props)
      const heading = markdown ? reasoningHeading(props.state.output ?? "") : undefined
      const format: ResolvedSummaryContentFormat = markdown ? "markdown" : "text"
      const previewValue = summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? fileName
      const details: ResolvedSummaryContent[] = [fileName, fileDirectory]
        .filter(isNonEmptyString)
        .map((value) => ({ value, format: "text" }))

      if (snippet) {
        details.push({ value: snippet, format })
      }

      return withResolvedSummary(summary, {
        display: summary.display,
        label: buildLabel(props.info.title, heading ?? fileName),
        preview: previewValue
          ? {
              value: previewValue,
              format,
            }
          : undefined,
        details,
        errorPreview: summary.suppressError ? undefined : resolveSummaryErrorPreview(props),
        errorVisibility: summary.suppressError ? "suppressed" : "visible",
        suppressError: summary.suppressError,
      })
    }
    case "artifact": {
      const artifact = readNonEmptyString(props.state.metadata.artifact)
      const preview = summarizeText(props.state.output, PREVIEW_MAX_CHARS)

      return withResolvedSummary(summary, {
        display: summary.display,
        label: buildLabel(props.info.title, artifact ?? preview),
        details: [artifact, preview]
          .filter(isNonEmptyString)
          .map((value) => ({ value, format: "text" as const })),
        errorPreview: summary.suppressError ? undefined : resolveSummaryErrorPreview(props),
        errorVisibility: summary.suppressError ? "suppressed" : "visible",
        suppressError: summary.suppressError,
      })
    }
    case "command": {
      const command = readNonEmptyString(props.state.input.command) ?? props.info.subtitle
      const previewValue = summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? command

      return withResolvedSummary(summary, {
        display: summary.display,
        label: buildLabel(props.info.title, command),
        preview: previewValue
          ? {
              value: previewValue,
              format: "text",
            }
          : undefined,
        details: [command]
          .filter(isNonEmptyString)
          .map((value) => ({ value, format: "text" as const })),
        errorPreview: summary.suppressError ? undefined : resolveSummaryErrorPreview(props),
        errorVisibility: summary.suppressError ? "suppressed" : "visible",
        suppressError: summary.suppressError,
      })
    }
    case "link": {
      const link = readNonEmptyString(props.state.input.url) ?? props.info.subtitle
      const previewValue = summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? link

      return withResolvedSummary(summary, {
        display: summary.display,
        label: buildLabel(props.info.title, link),
        preview: previewValue
          ? {
              value: previewValue,
              format: "text",
            }
          : undefined,
        details: [link]
          .filter(isNonEmptyString)
          .map((value) => ({ value, format: "text" as const })),
        errorPreview: summary.suppressError ? undefined : resolveSummaryErrorPreview(props),
        errorVisibility: summary.suppressError ? "suppressed" : "visible",
        suppressError: summary.suppressError,
      })
    }
  }
}
