import { Hono } from "hono"
import type { EnsureAllowedDirectory } from "../../../http/directory.js"
import { figureSvgPath } from "./route-definitions.js"
import { createFigureSvgHandler } from "./route-handlers.js"

export const FigureRoutes = (input: { ensureAllowedDirectory: EnsureAllowedDirectory }): Hono =>
  new Hono().get(figureSvgPath, createFigureSvgHandler(input))
