import { Hono } from "hono"
import { InvalidFreeformFigureIDError } from "../learning/freeform-figures/path.js"
import { FreeformFigureNotFoundError, FreeformFigureService } from "../learning/freeform-figures/service.js"
import { createFigureSvgRoute } from "./handlers/figure-route.js"
import type { EnsureAllowedDirectory } from "./support/directory.js"

export const FreeformFigureRoutes = (input: { ensureAllowedDirectory: EnsureAllowedDirectory }): Hono =>
  createFigureSvgRoute({
    ensureAllowedDirectory: input.ensureAllowedDirectory,
    readFigure: FreeformFigureService.read,
    isInvalidFigureError: (error) => error instanceof InvalidFreeformFigureIDError,
    isNotFoundFigureError: (error) => error instanceof FreeformFigureNotFoundError,
  })
