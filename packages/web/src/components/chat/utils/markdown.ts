export function cleanReasoningHeading(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~]+/g, "")
    .trim()
}

type LeadingReasoningHeading = { label: string; end: number; removable: boolean }

function headingContentIsPlainText(value: string): boolean {
  return !/[`[\]<>*_~]/.test(value)
}

function leadingReasoningHeading(markdown: string): LeadingReasoningHeading | undefined {
  const html = markdown.match(/^[ \t]*<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>[ \t]*(?:\n|$)/i)
  if (html) {
    const content = html[1] ?? ""
    const label = cleanReasoningHeading(content.replace(/<[^>]+>/g, " "))
    if (label) {
      return { label, end: html[0].length, removable: headingContentIsPlainText(content) }
    }
  }

  const atx = markdown.match(/^[ \t]{0,3}#{1,6}[ \t]+([^\n]*?)(?:[ \t]+#+[ \t]*)?[ \t]*(?:\n|$)/)
  if (atx) {
    const content = atx[1] ?? ""
    const label = cleanReasoningHeading(content)
    if (label) {
      return { label, end: atx[0].length, removable: headingContentIsPlainText(content) }
    }
  }

  // A dash underline can also be a separator after prose. Preserve that prose
  // in the expanded body; only the unambiguous equals form is removed here.
  const setext = markdown.match(/^([^\n]+)\n=+[ \t]*(?:\n|$)/)
  if (setext) {
    const content = setext[1] ?? ""
    const label = cleanReasoningHeading(content)
    if (label) {
      return { label, end: setext[0].length, removable: headingContentIsPlainText(content) }
    }
  }

  const strong = markdown.match(/^[ \t]*(\*\*|__)([^\n]+?)\1[ \t]*(?:\n|$)/)
  if (strong?.[1] && strong[2] && !strong[2].includes(strong[1])) {
    const label = cleanReasoningHeading(strong[2])
    if (label) {
      return { label, end: strong[0].length, removable: headingContentIsPlainText(strong[2]) }
    }
  }

  return undefined
}

export function reasoningHeading(text: string): string | undefined {
  const markdown = text.replace(/\r\n?/g, "\n")
  const withoutLeadingBlankLines = markdown.replace(/^(?:[ \t]*\n)*/, "")
  const leading = leadingReasoningHeading(withoutLeadingBlankLines)
  if (leading) return leading.label

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
  if (strong?.[1] && strong[2] && !strong[2].includes(strong[1])) {
    const value = cleanReasoningHeading(strong[2])
    if (value) return value
  }

  return undefined
}

/** Keep a reasoning summary's leading title in its entry label, not in its expanded body too. */
export function reasoningBodyWithoutLeadingHeading(text: string): string {
  const markdown = text.replace(/\r\n?/g, "\n")
  const withoutLeadingBlankLines = markdown.replace(/^(?:[ \t]*\n)*/, "")
  const leading = leadingReasoningHeading(withoutLeadingBlankLines)
  if (!leading?.removable) return text
  const body = withoutLeadingBlankLines.slice(leading.end)
  return body.startsWith("\n") ? body.slice(1) : body
}
