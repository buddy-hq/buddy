import type { ChemistryRenderErrorCode } from "./types"

class ChemistryRenderError extends Error {
  readonly code: ChemistryRenderErrorCode
  readonly httpStatus: 400 | 404 | 413 | 422 | 503 | 504

  constructor(input: {
    code: ChemistryRenderErrorCode
    message: string
    httpStatus: 400 | 404 | 413 | 422 | 503 | 504
    cause?: unknown
  }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause })
    this.name = "ChemistryRenderError"
    this.code = input.code
    this.httpStatus = input.httpStatus
  }
}

function mapChemistryRouteError<TError>(error: TError): Response | undefined {
  if (!(error instanceof ChemistryRenderError)) return undefined

  return Response.json(
    {
      error: error.message,
      code: error.code,
    },
    { status: error.httpStatus },
  )
}

export { ChemistryRenderError, mapChemistryRouteError }
