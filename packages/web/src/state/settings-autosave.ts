export type AutosaveAttemptOptions = {
  force?: boolean
}

function createAutosavePayloadKey(payload: unknown): string | undefined {
  const key = JSON.stringify(payload)
  return typeof key === "string" ? key : undefined
}

function shouldSkipFailedAutosave(input: {
  key: string | undefined
  failedKey: string | undefined
  force?: boolean
}): boolean {
  return !input.force && input.key !== undefined && input.key === input.failedKey
}

function retainFailedAutosaveKey(input: {
  key: string | undefined
  failedKey: string | undefined
}): string | undefined {
  return input.key === undefined ? undefined : input.failedKey
}

export { createAutosavePayloadKey, shouldSkipFailedAutosave, retainFailedAutosaveKey }
