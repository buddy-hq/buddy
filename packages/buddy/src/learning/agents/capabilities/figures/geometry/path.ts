import path from "node:path"

class InvalidFigureIDError extends Error {
  constructor(figureID: string) {
    super(`Invalid figure id '${figureID}'.`)
    this.name = "InvalidFigureIDError"
  }
}

function root(directory: string): string {
  return path.join(directory, ".buddy", "figures")
}

function glob(directory: string): string {
  return path.join(root(directory), "*.svg")
}

function sanitizeFigureID(figureID: string): string {
  if (!/^[a-f0-9]{64}$/u.test(figureID)) {
    throw new InvalidFigureIDError(figureID)
  }

  return figureID
}

function file(directory: string, figureID: string): string {
  return path.join(root(directory), `${sanitizeFigureID(figureID)}.svg`)
}

const FigurePath = {
  file,
  glob,
  root,
  sanitizeFigureID,
}

export {
  FigurePath,
  InvalidFigureIDError,
}
