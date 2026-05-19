import { reasoningHeading } from "../utils/markdown"
import { stripAnsi } from "../utils/path"
import { readNonEmptyString } from "./types"
import type {
  ResolvedSummaryContent,
  ResolvedSummaryContentFormat,
  ResolvedToolSummary,
  ToolPartProps,
  ToolSummary,
} from "./tool-registry-types"

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

export function resolveToolSummary(
  summary: ToolSummary,
  props: ToolPartProps,
): ResolvedToolSummary {
  const errorVisibility = summary.suppressError ? "suppressed" : "visible"

  switch (summary.pattern) {
    case "info":
      return {
        display: summary.display,
        label: buildLabel(props.info.title, props.info.summary ?? props.info.subtitle),
        details: [props.info.subtitle, props.info.summary]
          .filter(isNonEmptyString)
          .map((value) => ({ value, format: "text" as const })),
        errorVisibility,
      }
    case "metadata":
      return {
        display: summary.display,
        label: props.info.title,
        details: [props.info.subtitle, props.info.summary]
          .filter(isNonEmptyString)
          .map((value) => ({ value, format: "text" as const })),
        errorVisibility,
      }
    case "query": {
      const queryText = props.info.summary ?? searchInputText(props) ?? props.info.subtitle
      return {
        display: summary.display,
        label: buildLabel(props.info.title, queryText),
        errorVisibility,
      }
    }
    case "read": {
      const fileName = props.info.subtitle
      const fileDirectory = props.info.detail
      const snippet = summarizeText(props.state.output, SUMMARY_ROW_PREVIEW_MAX_CHARS)
      const markdown = isMarkdownRead(props)
      const heading = markdown ? reasoningHeading(props.state.output ?? "") : undefined
      const format: ResolvedSummaryContentFormat = markdown ? "markdown" : "text"
      const details: ResolvedSummaryContent[] = [fileName, fileDirectory]
        .filter(isNonEmptyString)
        .map((value) => ({ value, format: "text" }))

      if (snippet) {
        details.push({ value: snippet, format })
      }

      return {
        display: summary.display,
        label: buildLabel(props.info.title, heading ?? fileName),
        details,
        errorVisibility,
      }
    }
    case "command": {
      const command = readNonEmptyString(props.state.input.command) ?? props.info.subtitle

      return {
        display: summary.display,
        label: buildLabel(props.info.title, command),
        details: [command]
          .filter(isNonEmptyString)
          .map((value) => ({ value, format: "text" as const })),
        errorVisibility,
      }
    }
    case "link": {
      const link = readNonEmptyString(props.state.input.url) ?? props.info.subtitle

      return {
        display: summary.display,
        label: buildLabel(props.info.title, link),
        details: [link]
          .filter(isNonEmptyString)
          .map((value) => ({ value, format: "text" as const })),
        errorVisibility,
      }
    }
  }
}
