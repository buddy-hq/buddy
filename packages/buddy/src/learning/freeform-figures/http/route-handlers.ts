import type { Context } from "hono"
import { InvalidFreeformFigureIDError } from "../path.js"
import { FreeformFigureNotFoundError, FreeformFigureService } from "../service.js"
import type { EnsureAllowedDirectory } from "../../../http/directory.js"
import { freeformFigureSvgHeaders } from "./route-definitions.js"

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

export { createFreeformFigureSvgHandler }
