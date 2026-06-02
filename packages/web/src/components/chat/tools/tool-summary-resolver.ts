import { readNonEmptyString } from "./types"
import type {
  ResolvedSummaryContent,
  ResolvedToolSummary,
  ToolPartProps,
  ToolSummary,
} from "./tool-registry-types"

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function buildLabel(title: string, detail: string | undefined): string {
  return detail ? `${title}: ${detail}` : title
}

function joinSummaryDetails(primary: string | undefined, secondary: string | undefined): string | undefined {
  if (!primary) return secondary
  if (!secondary || secondary === primary) return primary
  return `${primary} · ${secondary}`
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
      const inputText = searchInputText(props)
      const active = props.state.status === "pending" || props.state.status === "running"
      const queryText = active
        ? (inputText ?? props.info.summary ?? props.info.subtitle)
        : (joinSummaryDetails(inputText, props.info.summary) ?? props.info.subtitle)
      return {
        display: summary.display,
        label: buildLabel(props.info.title, queryText),
        errorVisibility,
      }
    }
    case "read": {
      const fileName = props.info.subtitle
      const fileDirectory = props.info.detail
      const details: ResolvedSummaryContent[] = [fileName, fileDirectory]
        .filter(isNonEmptyString)
        .map((value) => ({ value, format: "text" }))

      return {
        display: summary.display,
        label: buildLabel(props.info.title, fileName),
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
