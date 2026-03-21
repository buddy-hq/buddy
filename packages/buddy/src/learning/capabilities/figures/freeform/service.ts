import { InvalidFreeformFigureIDError } from "./path"
import { FreeformFigureNotFoundError, FreeformFigureRenderError } from "./service/errors"
import { readFreeformFigure } from "./service/io"
import { renderFreeformFigure } from "./service/render"

const FreeformFigureService = {
  read: readFreeformFigure,
  render: renderFreeformFigure,
}

function mapFreeformFigureRouteError(error: unknown): Response | undefined {
  if (error instanceof InvalidFreeformFigureIDError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof FreeformFigureNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof FreeformFigureRenderError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  return undefined
}

export {
  FreeformFigureNotFoundError,
  FreeformFigureRenderError,
  FreeformFigureService,
  mapFreeformFigureRouteError,
}

export type { FreeformFigureLintIssue } from "./service/types"
