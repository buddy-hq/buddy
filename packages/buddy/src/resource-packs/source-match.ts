const RESOURCE_SOURCE_MTIME_MATCH_EPSILON_MS = 1 as const

export type ResourceSourceIdentityInput = {
  metadataSourcePath?: string
  metadataSourceRelpath?: string
  sourcePath: string
  sourceRelpath: string
}

export type ResourceSourceVersionInput = {
  metadataSourceMtimeMs?: number
  metadataSourceSizeBytes?: number
  sourceMtimeMs: number
  sourceSizeBytes: number
}

export function resourceSourceIdentityMatches(input: ResourceSourceIdentityInput): boolean {
  if (input.metadataSourcePath === input.sourcePath) {
    return true
  }

  return input.metadataSourceRelpath === input.sourceRelpath
}

export function resourceSourceVersionMatches(input: ResourceSourceVersionInput): boolean {
  if (input.metadataSourceMtimeMs === undefined || input.metadataSourceSizeBytes === undefined) {
    return false
  }

  return (
    input.metadataSourceSizeBytes === input.sourceSizeBytes &&
    Math.abs(input.metadataSourceMtimeMs - input.sourceMtimeMs) <=
      RESOURCE_SOURCE_MTIME_MATCH_EPSILON_MS
  )
}

export function resourceSourceSnapshotMatches(
  input: ResourceSourceIdentityInput & ResourceSourceVersionInput,
): boolean {
  return resourceSourceIdentityMatches(input) && resourceSourceVersionMatches(input)
}
