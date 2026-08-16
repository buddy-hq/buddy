import { z } from "zod"
import { parseWithSchema } from "./parse-external"

export type AutosaveAttemptOptions = {
  force?: boolean
}

function createAutosavePayloadKey<TPayload>(payload: TPayload): string | undefined {
  return parseWithSchema(z.string(), JSON.stringify(payload))
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
