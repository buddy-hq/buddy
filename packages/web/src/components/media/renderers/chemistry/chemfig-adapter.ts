import type { ChemistryRenderChemfigResponses } from "@buddy/sdk/types"
import { buddyResultMessage, getBuddyClient } from "@/lib/buddy-client"

export type ChemfigRenderResponse = ChemistryRenderChemfigResponses[200]

export class ChemfigRenderRequestError extends Error {
  readonly code: string | undefined

  constructor(message: string, code?: string) {
    super(message)
    this.name = "ChemfigRenderRequestError"
    this.code = code
  }
}

function errorCode(value: unknown): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined
  return "code" in value && typeof value.code === "string" ? value.code : undefined
}

export async function renderChemfigWithBuddy(input: {
  directory?: string
  source: string
  signal?: AbortSignal
}): Promise<ChemfigRenderResponse> {
  const result = await getBuddyClient(input.directory).chemistry.renderChemfig(
    {
      directory: input.directory,
      source: input.source,
    },
    input.signal ? { signal: input.signal } : undefined,
  )
  if (result.response?.ok && result.error === undefined && result.data !== undefined) {
    return result.data
  }
  throw new ChemfigRenderRequestError(buddyResultMessage(result), errorCode(result.error))
}
