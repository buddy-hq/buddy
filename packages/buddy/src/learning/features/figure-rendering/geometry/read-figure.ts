import fs from "node:fs/promises"
import { FigurePath } from "./path"
import { FigureNotFoundError } from "../errors"

async function readGeometryFigure(directory: string, figureID: string): Promise<string> {
  const filepath = FigurePath.file(directory, figureID)

  try {
    return await fs.readFile(filepath, "utf8")
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      throw new FigureNotFoundError(figureID)
    }
    throw error
  }
}

export { readGeometryFigure }
