import { Hono } from "hono"
import { InvalidFreeformFigureIDError } from "../learning/freeform-figures/path.js"
import { FreeformFigureNotFoundError, FreeformFigureService } from "../learning/freeform-figures/service.js"
import type { EnsureAllowedDirectory } from "./support.js"

export const FreeformFigureRoutes = (input: { ensureAllowedDirectory: EnsureAllowedDirectory }) =>
  new Hono().get("/:figureID", async (c) => {
    const directoryResult = input.ensureAllowedDirectory(c.req.raw)
    if (!directoryResult.ok) return directoryResult.response

    try {
      const svg = await FreeformFigureService.read(directoryResult.directory, c.req.param("figureID"))
      return new Response(svg, {
        headers: {
          "cache-control": "public, max-age=31536000, immutable",
          "content-type": "image/svg+xml; charset=utf-8",
        },
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
  })
