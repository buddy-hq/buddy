import { Hono } from "hono"
import type { EnsureAllowedDirectory } from "../support/directory.js"

type FigureRouteInput = {
  ensureAllowedDirectory: EnsureAllowedDirectory
  readFigure: (directory: string, figureID: string) => Promise<string>
  isInvalidFigureError: (error: unknown) => boolean
  isNotFoundFigureError: (error: unknown) => boolean
}

export function createFigureSvgRoute(input: FigureRouteInput) {
  return new Hono().get("/:figureID", async (c) => {
    const directoryResult = input.ensureAllowedDirectory(c.req.raw)
    if (!directoryResult.ok) return directoryResult.response

    try {
      const svg = await input.readFigure(directoryResult.directory, c.req.param("figureID"))
      return new Response(svg, {
        headers: {
          "cache-control": "private, max-age=31536000, immutable",
          "content-type": "image/svg+xml; charset=utf-8",
          vary: "x-buddy-directory",
        },
      })
    } catch (error) {
      if (input.isInvalidFigureError(error)) {
        return c.json({ error: error instanceof Error ? error.message : "Invalid figure id" }, 400)
      }
      if (input.isNotFoundFigureError(error)) {
        return c.json({ error: error instanceof Error ? error.message : "Figure not found" }, 404)
      }
      throw error
    }
  })
}
