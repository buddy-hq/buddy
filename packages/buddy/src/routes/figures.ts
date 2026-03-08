import { Hono } from "hono"
import { InvalidFigureIDError } from "../learning/figures/path.js"
import { FigureNotFoundError, FigureService } from "../learning/figures/service.js"
import { createFigureSvgRoute } from "./handlers/figure-route.js"
import type { EnsureAllowedDirectory } from "./support/directory.js"

export const FigureRoutes = (input: { ensureAllowedDirectory: EnsureAllowedDirectory }): Hono =>
  createFigureSvgRoute({
    ensureAllowedDirectory: input.ensureAllowedDirectory,
    readFigure: FigureService.read,
    isInvalidFigureError: (error) => error instanceof InvalidFigureIDError,
    isNotFoundFigureError: (error) => error instanceof FigureNotFoundError,
  })
