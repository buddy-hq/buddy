import GithubSlugger from "github-slugger"

const MARKDOWN_HEADING_SELECTOR = "h1,h2,h3,h4,h5,h6"
const MARKDOWN_CONTENT_SELECTOR = ".mdxeditor-root-contenteditable"

/** A rendered document heading, identified with Markdown's unique heading slug. */
export type MarkdownBenchHeading = {
  readonly id: string
  readonly label: string
  readonly level: number
  readonly element: HTMLElement
}

function documentElements(root: HTMLElement, selector: string): HTMLElement[] {
  const content = root.matches(MARKDOWN_CONTENT_SELECTOR)
    ? root
    : (root.querySelector<HTMLElement>(MARKDOWN_CONTENT_SELECTOR) ?? root)
  return Array.from(content.querySelectorAll<HTMLElement>(selector)).filter(
    (element) =>
      !element.closest("[data-markdown-export-ignore]") &&
      !element.closest('[data-component="markdown-bench-obsidian-note-embed"]') &&
      (!content.matches(MARKDOWN_CONTENT_SELECTOR) ||
        element.closest(MARKDOWN_CONTENT_SELECTOR) === content),
  )
}

/** Read live headings without assigning attributes to DOM owned by the editor. */
export function readMarkdownBenchHeadings(root: HTMLElement): MarkdownBenchHeading[] {
  const slugger = new GithubSlugger()
  return documentElements(root, MARKDOWN_HEADING_SELECTOR).flatMap((element) => {
    const label = element.textContent?.trim() ?? ""
    if (!label) return []
    return [{ id: slugger.slug(label), label, level: Number(element.tagName.slice(1)), element }]
  })
}

function normalizedMarkdownFragment(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/^#+/u, "")
    .replace(/^\^/u, "")
    .replaceAll("-", " ")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase()
}

function decodedMarkdownFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

/** Resolve explicit anchors, Markdown heading slugs, and Obsidian heading/block links. */
export function findMarkdownBenchFragmentTarget(
  root: HTMLElement,
  fragment: string,
): HTMLElement | undefined {
  const decoded = decodedMarkdownFragment(fragment).trim()
  if (!decoded) return undefined
  const explicitTarget = documentElements(root, "[id]").find((element) => element.id === decoded)
  if (explicitTarget) return explicitTarget
  const headings = readMarkdownBenchHeadings(root)
  const slugTarget = headings.find((heading) => heading.id === decoded)
  if (slugTarget) return slugTarget.element
  const normalized = normalizedMarkdownFragment(decoded)
  if (decoded.startsWith("^")) {
    return documentElements(root, "p,li,blockquote").find((element) =>
      (element.textContent?.trim() ?? "").endsWith(decoded),
    )
  }
  return headings.find((heading) => normalizedMarkdownFragment(heading.label) === normalized)
    ?.element
}
