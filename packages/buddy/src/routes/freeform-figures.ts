import type { Context } from "hono"
import { Hono } from "hono"
import type { EnsureAllowedDirectory } from "../http"
import {
  FreeformFigureNotFoundError,
  FreeformFigureService,
  InvalidFreeformFigureIDError,
} from "../learning/capabilities"

const freeformFigureSvgPath = "/:figureID"

const freeformFigureSvgHeaders = {
  "cache-control": "private, max-age=31536000, immutable",
  "content-type": "image/svg+xml; charset=utf-8",
  vary: "x-buddy-directory",
}

function createFreeformFigureSvgHandler(input: { ensureAllowedDirectory: EnsureAllowedDirectory }) {
  return async (c: Context): Promise<Response> => {
    const directoryResult = input.ensureAllowedDirectory(c.req.raw)
    if (!directoryResult.ok) return directoryResult.response

    try {
      const svg = await FreeformFigureService.read(directoryResult.directory, c.req.param("figureID"))
      return new Response(svg, {
        headers: freeformFigureSvgHeaders,
      })
    } catch (error) {
      if (error instanceof InvalidFreeformFigureIDError) {
        return c.json({ error: error.message }, 400)
      }
      if (error instanceof FreeformFigureNotFoundError) {
        return c.json({ error: error.message }, 404)
      }
      throw error
    }
  }
}

export const FreeformFigureRoutes = (input: { ensureAllowedDirectory: EnsureAllowedDirectory }): Hono =>
  new Hono().get(freeformFigureSvgPath, createFreeformFigureSvgHandler(input))
