export class ConfigSyncError extends Error {
  constructor(
    readonly file: string,
    cause: unknown,
  ) {
    super(`Failed to sync config: ${file}`, { cause })
    this.name = "ConfigSyncError"
  }
}
