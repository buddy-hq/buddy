const freeformFigureSvgPath = "/:figureID"

const freeformFigureSvgHeaders = {
  "cache-control": "private, max-age=31536000, immutable",
  "content-type": "image/svg+xml; charset=utf-8",
  vary: "x-buddy-directory",
}

export {
  freeformFigureSvgHeaders,
  freeformFigureSvgPath,
}
