function headingLevel(element: Element): number | undefined {
  const match = element.tagName.match(/^H([1-6])$/u)
  if (!match?.[1]) return undefined
  const level = Number.parseInt(match[1], 10)
  return Number.isFinite(level) ? level : undefined
}

function isHeadingBeforeSelectionStart(heading: Element, startContainer: Node): boolean {
  if (heading === startContainer) return true
  const position = heading.compareDocumentPosition(startContainer)
  return (
    (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ||
    (position & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0
  )
}

export function resolveSelectionHeadingPath(
  editorRoot: HTMLElement,
  range: Range,
): string[] | undefined {
  const headingPath: string[] = []
  const headings = editorRoot.querySelectorAll("h1,h2,h3,h4,h5,h6")

  for (const heading of headings) {
    if (!isHeadingBeforeSelectionStart(heading, range.startContainer)) {
      break
    }

    const level = headingLevel(heading)
    const text = heading.textContent?.trim()
    if (level === undefined || !text) {
      continue
    }

    headingPath.splice(level - 1)
    headingPath[level - 1] = text
  }

  const compactHeadingPath = headingPath.filter((entry) => entry.length > 0)
  return compactHeadingPath.length > 0 ? compactHeadingPath : undefined
}
