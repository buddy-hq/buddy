import { Hono } from "hono"
import type { EnsureAllowedDirectory } from "../../../http/directory.js"
import { freeformFigureSvgPath } from "./route-definitions.js"
import { createFreeformFigureSvgHandler } from "./route-handlers.js"

export const FreeformFigureRoutes = (input: { ensureAllowedDirectory: EnsureAllowedDirectory }): Hono =>
  new Hono().get(freeformFigureSvgPath, createFreeformFigureSvgHandler(input))
