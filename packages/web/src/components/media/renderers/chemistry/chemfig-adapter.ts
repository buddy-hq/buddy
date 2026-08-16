import { z } from "zod"
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

const chemfigErrorSchema = z.object({ code: z.string() })

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
  const parsedError = chemfigErrorSchema.safeParse(result.error)
  throw new ChemfigRenderRequestError(
    buddyResultMessage(result),
    parsedError.success ? parsedError.data.code : undefined,
  )
}
