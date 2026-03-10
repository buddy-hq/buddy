import type { Context } from "hono"
import { Hono } from "hono"
import type { EnsureAllowedDirectory } from "../http"
import {
  FigureNotFoundError,
  FigureService,
  InvalidFigureIDError,
} from "../learning/capabilities"

const figureSvgPath = "/:figureID"

const figureSvgHeaders = {
  "cache-control": "private, max-age=31536000, immutable",
  "content-type": "image/svg+xml; charset=utf-8",
  vary: "x-buddy-directory",
}

function createFigureSvgHandler(input: { ensureAllowedDirectory: EnsureAllowedDirectory }) {
  return async (c: Context): Promise<Response> => {
    const directoryResult = input.ensureAllowedDirectory(c.req.raw)
    if (!directoryResult.ok) return directoryResult.response

    try {
      const svg = await FigureService.read(directoryResult.directory, c.req.param("figureID"))
      return new Response(svg, {
        headers: figureSvgHeaders,
      })
    } catch (error) {
      if (error instanceof InvalidFigureIDError) {
        return c.json({ error: error.message }, 400)
      }
      if (error instanceof FigureNotFoundError) {
        return c.json({ error: error.message }, 404)
      }
      throw error
    }
  }
}

export const FigureRoutes = (input: { ensureAllowedDirectory: EnsureAllowedDirectory }): Hono =>
  new Hono().get(figureSvgPath, createFigureSvgHandler(input))
