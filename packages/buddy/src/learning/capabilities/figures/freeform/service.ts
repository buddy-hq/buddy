import { FreeformFigureNotFoundError, FreeformFigureRenderError } from "./service/errors"
import { readFreeformFigure } from "./service/io"
import { renderFreeformFigure } from "./service/render"

const FreeformFigureService = {
  read: readFreeformFigure,
  render: renderFreeformFigure,
}

export {
  FreeformFigureNotFoundError,
  FreeformFigureRenderError,
  FreeformFigureService,
}

export type { FreeformFigureLintIssue } from "./service/types"
