import path from "node:path"
import type { SessionMessageAssistantTool } from "@opencode/client"
import type { ToolOutcome } from "@buddy/transcript-contract/message"
import { isJsonObject, parseStringValue, type TJsonObject } from "@buddy/transcript-contract/parse-external"

const permissionDeniedPrefix = "The user rejected permission to use this specific tool call"

function displayText<TValue>(value: TValue): string | undefined {
  return parseStringValue(value)?.trim() || undefined
}

export function toolOutcome(name: string, state: SessionMessageAssistantTool["state"]): ToolOutcome | undefined {
  if (state.status !== "error") return undefined
  const { type, message } = state.error
  if (state.metadata?.interrupted === true) return { type: "interrupted" }
  if (type === "permission.rejected" || message.startsWith(permissionDeniedPrefix) || (type === "aborted" && message === "The user declined this tool call")) {
    const feedback = message.startsWith(permissionDeniedPrefix) ? message.match(/with the following (?:message|feedback):\s*([\s\S]*)$/u)?.[1] : message
    return { type: "rejected", message: message === "The user declined this tool call" ? undefined : feedback }
  }
  if (name === "question" && (/questionrejectederror|rejected/iu.test(message) || (type === "aborted" && message === "The user dismissed this question"))) {
    return { type: "dismissed" }
  }
  if (type === "aborted" || type === "tool.interrupted" || type === "MessageAbortedError") return { type: "interrupted" }
  return undefined
}

export function coreToolPresentationDetail(kind: string | undefined, input: TJsonObject, metadata: TJsonObject, title?: string): string | undefined {
  switch (kind) {
    case "invalid-tool-call": return displayText(input.tool)
    case "run-command": return displayText(title) ?? displayText(input.command)
    case "read-file":
    case "edit-file":
    case "write-file": {
      const target = displayText(input.path) ?? displayText(input.filePath)
      return target ? path.basename(target) : undefined
    }
    case "find-files":
    case "search-files": return displayText(input.pattern)
    case "delegate": return displayText(input.description)
    case "fetch-url": return displayText(input.url)
    case "search-web":
    case "search-code": return displayText(input.query)
    case "use-skill": return displayText(metadata.name) ?? displayText(input.name) ?? displayText(input.id)
    case "list-files": return displayText(input.path)
    case "list-resources":
    case "list-resource-templates": return displayText(input.server)
    case "read-resource": return displayText(input.uri)
    case "change-files": {
      const files = metadata.files
      if (!Array.isArray(files) || files.length === 0) return undefined
      if (files.length > 1) return `${files.length.toLocaleString()} files`
      const file = files[0]
      if (!isJsonObject(file)) return undefined
      const target = displayText(file.relativePath) ?? displayText(file.path) ?? displayText(file.filePath) ?? displayText(file.file)
      return target ? path.basename(target) : undefined
    }
    default: return undefined
  }
}
