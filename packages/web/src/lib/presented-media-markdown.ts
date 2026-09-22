import { resolveAssetUrl } from "./resource-url"

const URI_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/u
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/u
const SAFE_EXTERNAL_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"])

export type PresentedMediaMarkdownLink =
  | { readonly type: "external-url"; readonly url: string }
  | { readonly type: "local-path"; readonly path: string }

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function referencePath(value: string): string {
  const queryIndex = value.indexOf("?")
  const fragmentIndex = value.indexOf("#")
  const end = [queryIndex, fragmentIndex]
    .filter((index) => index >= 0)
    .reduce((lowest, index) => Math.min(lowest, index), value.length)
  return decodePath(value.slice(0, end))
}

function resolveLocalFilePath(documentPath: string, hrefPath: string): string | undefined {
  const windows = WINDOWS_ABSOLUTE_PATH_PATTERN.test(documentPath)
  const normalizedDocument = documentPath.replaceAll("\\", "/")
  const normalizedHref = hrefPath.replaceAll("\\", "/")
  const documentDrive = normalizedDocument.match(/^([A-Za-z]:)\//u)?.[1]
  const hrefDrive = normalizedHref.match(/^([A-Za-z]:)\//u)?.[1]
  const absolute = normalizedHref.startsWith("/") || hrefDrive !== undefined
  const segments = absolute
    ? hrefDrive
      ? [hrefDrive]
      : documentDrive
        ? [documentDrive]
        : []
    : normalizedDocument.split("/").filter(Boolean).slice(0, -1)
  const minimumSegments = segments[0]?.endsWith(":") ? 1 : 0
  const hrefWithoutRoot = hrefDrive
    ? normalizedHref.slice(hrefDrive.length + 1)
    : normalizedHref.replace(/^\/+/, "")

  for (const segment of hrefWithoutRoot.split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      if (segments.length > minimumSegments) segments.pop()
      continue
    }
    segments.push(segment)
  }

  if (segments.length === minimumSegments) return undefined
  const separator = windows ? "\\" : "/"
  const joined = segments.join(separator)
  if (windows) return joined
  return normalizedDocument.startsWith("/") || normalizedHref.startsWith("/")
    ? `${separator}${joined}`
    : joined
}

/**
 * Rewrites a relative image reference through the owning media-presentation item.
 * Absolute web/data/blob references retain their normal URL semantics.
 */
export function resolvePresentedMediaMarkdownImageSrc(input: {
  readonly rawUrl: string | undefined
  readonly src: string
}): string {
  const src = input.src.trim()
  if (!src) return src
  if (src.startsWith("//")) return resolveAssetUrl(`https:${src}`)
  if (URI_SCHEME_PATTERN.test(src) || src.startsWith("/")) return resolveAssetUrl(src)
  if (!input.rawUrl) return src

  const path = referencePath(src).replace(/^\.\/+/, "")
  if (!path) return src
  const separator = input.rawUrl.includes("?") ? "&" : "?"
  return `${input.rawUrl}${separator}relativePath=${encodeURIComponent(path)}`
}

/** Resolves a link in external Markdown without treating it as a notebook-relative path. */
export function resolvePresentedMediaMarkdownLink(
  documentPath: string,
  href: string,
): PresentedMediaMarkdownLink | undefined {
  const normalizedHref = href.trim()
  if (!normalizedHref || normalizedHref.startsWith("#")) return undefined
  if (normalizedHref.startsWith("//")) {
    return { type: "external-url", url: `https:${normalizedHref}` }
  }
  if (
    !WINDOWS_ABSOLUTE_PATH_PATTERN.test(normalizedHref) &&
    URI_SCHEME_PATTERN.test(normalizedHref)
  ) {
    const schemeEnd = normalizedHref.indexOf(":") + 1
    const scheme = normalizedHref.slice(0, schemeEnd).toLocaleLowerCase()
    return SAFE_EXTERNAL_LINK_SCHEMES.has(scheme)
      ? { type: "external-url", url: normalizedHref }
      : undefined
  }

  const path = resolveLocalFilePath(documentPath, referencePath(normalizedHref))
  return path ? { type: "local-path", path } : undefined
}
