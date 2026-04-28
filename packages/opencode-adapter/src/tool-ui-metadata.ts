export const TOOL_PRESENTATIONS = ["hidden-summary", "default"] as const

export type ToolPresentation = (typeof TOOL_PRESENTATIONS)[number]

export type ToolUiLabels = {
  idle?: string
  running?: string
}

export type ToolUiMetadata = {
  presentation?: ToolPresentation
  labels?: ToolUiLabels
}

export function cloneToolUiMetadata(
  metadata: ToolUiMetadata | undefined,
): ToolUiMetadata | undefined {
  if (!metadata) return undefined

  return {
    ...(metadata.presentation ? { presentation: metadata.presentation } : {}),
    ...(metadata.labels
      ? {
          labels: {
            ...(metadata.labels.idle ? { idle: metadata.labels.idle } : {}),
            ...(metadata.labels.running ? { running: metadata.labels.running } : {}),
          },
        }
      : {}),
  }
}
