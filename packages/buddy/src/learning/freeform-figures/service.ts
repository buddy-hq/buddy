import { FreeformFigureNotFoundError, FreeformFigureRenderError } from "./service/errors.js"
import { readFreeformFigure } from "./service/io.js"
import { renderFreeformFigure } from "./service/render.js"

const FreeformFigureService = {
  read: readFreeformFigure,
  render: renderFreeformFigure,
}

export {
  FreeformFigureNotFoundError,
  FreeformFigureRenderError,
  FreeformFigureService,
}

export type { FreeformFigureLintIssue } from "./service/types.js"
