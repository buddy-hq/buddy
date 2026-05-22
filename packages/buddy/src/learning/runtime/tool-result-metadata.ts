type ToolResultMetadata = Record<string, unknown>

export function mergeToolResultMetadata<Metadata extends ToolResultMetadata>(input: {
  title?: string
  metadata?: Metadata
}): Metadata | ToolResultMetadata {
  const metadata = input.metadata ?? {}
  if (!input.title) {
    return metadata
  }

  return {
    ...metadata,
    title: input.title,
  }
}
