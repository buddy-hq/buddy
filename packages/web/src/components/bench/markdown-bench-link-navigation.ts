const URI_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/u
const SAFE_EXTERNAL_LINK_SCHEMES = new Set(["http:", "https:", "mailto:", "obsidian:"])

export type MarkdownBenchLinkTarget =
  | { type: "external"; url: string }
  | { type: "workspace-file"; path: string; fragment?: string }

function decodeLinkPart(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function normalizedWorkspaceLinkPath(documentPath: string, hrefPath: string): string | undefined {
  const normalizedHref = decodeLinkPart(hrefPath).replaceAll("\\", "/")
  const segments = normalizedHref.startsWith("/")
    ? []
    : documentPath.replaceAll("\\", "/").split("/").slice(0, -1)

  for (const segment of normalizedHref.split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      if (segments.length === 0) return undefined
      segments.pop()
      continue
    }
    segments.push(segment)
  }

  return segments.length > 0 ? segments.join("/") : undefined
}

export function resolveMarkdownBenchLink(
  documentPath: string,
  href: string,
): MarkdownBenchLinkTarget | undefined {
  const normalizedHref = href.trim()
  if (!normalizedHref) return undefined
  if (normalizedHref.startsWith("//")) {
    return { type: "external", url: `https:${normalizedHref}` }
  }
  if (URI_SCHEME_PATTERN.test(normalizedHref)) {
    const schemeEnd = normalizedHref.indexOf(":") + 1
    const scheme = normalizedHref.slice(0, schemeEnd).toLocaleLowerCase()
    return SAFE_EXTERNAL_LINK_SCHEMES.has(scheme)
      ? { type: "external", url: normalizedHref }
      : undefined
  }

  const fragmentStart = normalizedHref.indexOf("#")
  const hrefPath = fragmentStart < 0 ? normalizedHref : normalizedHref.slice(0, fragmentStart)
  const rawFragment = fragmentStart < 0 ? "" : normalizedHref.slice(fragmentStart + 1)
  const path = hrefPath
    ? normalizedWorkspaceLinkPath(documentPath, hrefPath)
    : documentPath.replaceAll("\\", "/")
  if (!path) return undefined
  const fragment = decodeLinkPart(rawFragment).trim()
  return {
    type: "workspace-file",
    path,
    ...(fragment ? { fragment } : {}),
  }
}
