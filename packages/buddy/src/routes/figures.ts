import { Hono } from "hono"
import { InvalidFigureIDError } from "../learning/figures/path.js"
import { FigureNotFoundError, FigureService } from "../learning/figures/service.js"
import type { EnsureAllowedDirectory } from "./support.js"

export const FigureRoutes = (input: { ensureAllowedDirectory: EnsureAllowedDirectory }) =>
  new Hono().get("/:figureID", async (c) => {
    const directoryResult = input.ensureAllowedDirectory(c.req.raw)
    if (!directoryResult.ok) return directoryResult.response

    try {
      const svg = await FigureService.read(directoryResult.directory, c.req.param("figureID"))
      return new Response(svg, {
        headers: {
          "cache-control": "public, max-age=31536000, immutable",
          "content-type": "image/svg+xml; charset=utf-8",
        },
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
  })
