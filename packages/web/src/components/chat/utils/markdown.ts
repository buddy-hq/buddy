export function cleanReasoningHeading(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~]+/g, "")
    .trim()
}

export function reasoningHeading(text: string): string | undefined {
  const markdown = text.replace(/\r\n?/g, "\n")

  const html = markdown.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
  if (html?.[1]) {
    const value = cleanReasoningHeading(html[1].replace(/<[^>]+>/g, " "))
    if (value) return value
  }

  const atx = markdown.match(/^\s{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/m)
  if (atx?.[1]) {
    const value = cleanReasoningHeading(atx[1])
    if (value) return value
  }

  const setext = markdown.match(/^([^\n]+)\n(?:=+|-+)[ \t]*$/m)
  if (setext?.[1]) {
    const value = cleanReasoningHeading(setext[1])
    if (value) return value
  }

  // OpenAI reasoning summaries title each section with a bold line
  // (**Title**), not a markdown heading, so match a line that is entirely bold.
  const strong = markdown.match(/^[ \t]*(\*\*|__)(.+?)\1[ \t]*$/m)
  if (strong?.[2]) {
    const value = cleanReasoningHeading(strong[2])
    if (value) return value
  }

  return undefined
}
