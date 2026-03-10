import path from "node:path"

class InvalidFreeformFigureIDError extends Error {
  constructor(figureID: string) {
    super(`Invalid freeform figure id '${figureID}'.`)
    this.name = "InvalidFreeformFigureIDError"
  }
}

function root(directory: string): string {
  return path.join(directory, ".buddy", "freeform-figures")
}

function glob(directory: string): string {
  return path.join(root(directory), "*.svg")
}

function sanitizeFigureID(figureID: string): string {
  if (!/^[a-f0-9]{64}$/u.test(figureID)) {
    throw new InvalidFreeformFigureIDError(figureID)
  }

  return figureID
}

function file(directory: string, figureID: string): string {
  return path.join(root(directory), `${sanitizeFigureID(figureID)}.svg`)
}

const FreeformFigurePath = {
  file,
  glob,
  root,
  sanitizeFigureID,
}

export {
  FreeformFigurePath,
  InvalidFreeformFigureIDError,
}
