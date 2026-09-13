const MARKDOWN_FRAGMENT_TARGET_SELECTOR = "[id],h1,h2,h3,h4,h5,h6,p,li,blockquote"

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

export function findMarkdownBenchFragmentTarget(
  root: HTMLElement,
  fragment: string,
): HTMLElement | undefined {
  const decoded = decodedMarkdownFragment(fragment).trim()
  if (!decoded) return undefined
  const normalized = normalizedMarkdownFragment(decoded)
  const blockMarker = decoded.startsWith("^") ? decoded : `^${decoded}`
  return Array.from(root.querySelectorAll<HTMLElement>(MARKDOWN_FRAGMENT_TARGET_SELECTOR)).find(
    (element) => {
      if (element.id === decoded) return true
      const text = element.textContent?.trim() ?? ""
      if (decoded.startsWith("^") && text.endsWith(blockMarker)) return true
      return /^H[1-6]$/u.test(element.tagName) && normalizedMarkdownFragment(text) === normalized
    },
  )
}
