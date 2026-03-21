import fs from "node:fs/promises"
import { FreeformFigurePath } from "../path"
import { FreeformFigureNotFoundError } from "./errors"

async function writeFreeformFigure(
  directory: string,
  figureID: string,
  svg: string,
): Promise<void> {
  await fs.mkdir(FreeformFigurePath.root(directory), { recursive: true })
  await fs.writeFile(FreeformFigurePath.file(directory, figureID), svg, "utf8")
}

async function readFreeformFigure(directory: string, figureID: string): Promise<string> {
  const filepath = FreeformFigurePath.file(directory, figureID)

  try {
    return await fs.readFile(filepath, "utf8")
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      throw new FreeformFigureNotFoundError(figureID)
    }
    throw error
  }
}

export { readFreeformFigure, writeFreeformFigure }
