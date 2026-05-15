function resolveFigureAlt(input: { caption?: string; fallback: string }): string {
  const caption = input.caption?.trim()
  return caption && caption.length > 0 ? caption : input.fallback
}

function escapeFigureMarkdownAlt(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]")
}

export { resolveFigureAlt, escapeFigureMarkdownAlt }
