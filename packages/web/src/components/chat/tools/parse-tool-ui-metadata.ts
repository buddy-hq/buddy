import { isRecord, readNonEmptyString } from "./types"

export const TOOL_PRESENTATIONS = ["hidden-summary", "default"] as const

export type ToolPresentation = (typeof TOOL_PRESENTATIONS)[number]

export type ToolUiLabels = {
  idle?: string
  running?: string
}

export type ParsedToolUiMetadata = {
  presentation?: ToolPresentation
  labels?: ToolUiLabels
}

export function parseToolUiMetadata(
  metadata: Record<string, unknown>,
): ParsedToolUiMetadata | undefined {
  const buddy = isRecord(metadata.buddy) ? metadata.buddy : undefined
  const toolUi = isRecord(buddy?.toolUi) ? buddy.toolUi : undefined
  if (!toolUi) return undefined

  const presentation = toolUi.presentation
  if (
    presentation !== undefined &&
    presentation !== TOOL_PRESENTATIONS[0] &&
    presentation !== TOOL_PRESENTATIONS[1]
  ) {
    return undefined
  }

  const labels = isRecord(toolUi.labels) ? toolUi.labels : undefined
  const idle = readNonEmptyString(labels?.idle)
  const running = readNonEmptyString(labels?.running)

  if (!presentation && !idle && !running) return undefined

  return {
    ...(presentation ? { presentation } : {}),
    ...(idle || running
      ? {
          labels: {
            ...(idle ? { idle } : {}),
            ...(running ? { running } : {}),
          },
        }
      : {}),
  }
}
