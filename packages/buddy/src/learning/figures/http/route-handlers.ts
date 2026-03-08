import type { Context } from "hono"
import { InvalidFigureIDError } from "../path.js"
import { FigureNotFoundError, FigureService } from "../service.js"
import type { EnsureAllowedDirectory } from "../../../http/directory.js"
import { figureSvgHeaders } from "./route-definitions.js"

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

export { createFigureSvgHandler }
