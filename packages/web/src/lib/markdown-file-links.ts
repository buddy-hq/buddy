import {
  isLikelyExternalMediaPathCandidate,
  isLikelyPresentedMediaPathCandidate,
} from "./presented-media"
import { referencePath } from "./presented-media-markdown"
import { fileExtensionFromPath } from "./workspace-file-paths"

const URI_SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):/u
const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/u
const SLASH_PREFIXED_WINDOWS_DRIVE_PATTERN = /^\/[A-Za-z]:\//u
const FILE_URL_PATTERN = /^file:/iu
const UNC_PATH_PATTERN = /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/u
const LOCAL_HOSTNAME = "localhost"
const SAFE_EXTERNAL_LINK_SCHEMES = new Set(["http:", "https:", "mailto:", "obsidian:"])
const NAMED_URI_SCHEMES = new Set([
  ...SAFE_EXTERNAL_LINK_SCHEMES,
  "file:",
  "javascript:",
  "data:",
  "vbscript:",
  "blob:",
  "about:",
  "tel:",
  "callto:",
  "sms:",
  "cid:",
  "xmpp:",
  "matrix:",
])

export type TMarkdownFileLink =
  | { readonly kind: "external"; readonly url: string }
  | { readonly kind: "inside"; readonly path: string; readonly fragment?: string }
  | { readonly kind: "outside"; readonly path: string }

function fileUrlPath(target: string): string | undefined {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return undefined
  }
  const pathname = referencePath(url.pathname)
  const host = url.hostname.toLowerCase() === LOCAL_HOSTNAME ? "" : url.hostname
  if (host) return `\\\\${host}${pathname.replaceAll("/", "\\")}`
  return SLASH_PREFIXED_WINDOWS_DRIVE_PATTERN.test(pathname) ? pathname.slice(1) : pathname
}

function markdownUriScheme(href: string): string | undefined {
  if (WINDOWS_DRIVE_PATH_PATTERN.test(href)) return undefined
  const match = URI_SCHEME_PATTERN.exec(href)
  const schemeName = match?.[1]
  if (!schemeName) return undefined
  const scheme = `${schemeName.toLowerCase()}:`
  const rest = href.slice(match[0].length)
  if (rest.startsWith("//") || NAMED_URI_SCHEMES.has(scheme)) return scheme
  return undefined
}

function localLinkPath(target: string): string | undefined {
  const scheme = markdownUriScheme(target)
  if (scheme && scheme !== "file:") return undefined
  return referencePath(target)
}

function isExplicitRelativeFilePath(path: string): boolean {
  if (!/[a-z]/iu.test(fileExtensionFromPath(path))) return false
  if (path.startsWith("//")) return false
  if (markdownUriScheme(path)) return false
  return true
}

function isFileLinkPath(path: string): boolean {
  if (isLikelyPresentedMediaPathCandidate(path)) return true
  if (fileExtensionFromPath(path) === "") return false
  if (UNC_PATH_PATTERN.test(path) || isLikelyExternalMediaPathCandidate(path)) return true
  return isExplicitRelativeFilePath(path)
}

export function markdownFileLinkPath(href: string): string | undefined {
  const target = href.trim()
  if (!target || target.startsWith("#") || target.startsWith("//")) return undefined
  const path = FILE_URL_PATTERN.test(target) ? fileUrlPath(target) : localLinkPath(target)
  return path && isFileLinkPath(path) ? path : undefined
}

export function windowsDriveFileUrl(href: string): string | undefined {
  return WINDOWS_DRIVE_PATH_PATTERN.test(href) ? `file:///${href.replaceAll("\\", "/")}` : undefined
}

function decodeLinkPart(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function isAnchoredFilePath(filePath: string): boolean {
  return (
    FILE_URL_PATTERN.test(filePath) ||
    filePath === "~" ||
    filePath.startsWith("~/") ||
    filePath.startsWith("~\\") ||
    filePath.startsWith("/") ||
    filePath.startsWith("\\") ||
    WINDOWS_DRIVE_PATH_PATTERN.test(filePath) ||
    UNC_PATH_PATTERN.test(filePath)
  )
}

function explicitLinkScheme(href: string): string | undefined {
  if (WINDOWS_DRIVE_PATH_PATTERN.test(href)) return undefined
  const match = URI_SCHEME_PATTERN.exec(href)
  const schemeName = match?.[1]
  if (!schemeName) return undefined
  const scheme = `${schemeName.toLowerCase()}:`
  const rest = href.slice(match[0].length)
  if (rest.startsWith("//") || NAMED_URI_SCHEMES.has(scheme)) return scheme
  if (!/[\\/.]/u.test(rest)) return scheme
  return undefined
}

function splitDecodedHref(href: string) {
  const hash = href.indexOf("#")
  const beforeHash = hash < 0 ? href : href.slice(0, hash)
  const query = beforeHash.indexOf("?")
  const rawPath = query < 0 ? beforeHash : beforeHash.slice(0, query)
  const rawFragment = hash < 0 ? "" : href.slice(hash + 1)
  return { path: decodeLinkPart(rawPath), fragment: decodeLinkPart(rawFragment).trim() }
}

function directorySegments(documentPath: string): string[] {
  const parts = documentPath.replaceAll("\\", "/").split("/")
  parts.pop()
  return parts.filter((segment) => segment.length > 0 && segment !== ".")
}

function escapesNotebookRoot(filePath: string): boolean {
  let depth = 0
  for (const segment of filePath.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      if (depth === 0) return true
      depth -= 1
      continue
    }
    depth += 1
  }
  return false
}

function walkRelativePath(
  baseSegments: readonly string[],
  filePath: string,
): { readonly escaped: number; readonly segments: string[] } | undefined {
  const segments = [...baseSegments]
  let escaped = 0
  let sawTarget = false
  for (const segment of filePath.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue
    sawTarget = true
    if (segment === "..") {
      if (segments.length === 0) escaped += 1
      else segments.pop()
      continue
    }
    segments.push(segment)
  }
  if (!sawTarget || (escaped === 0 && segments.length === 0)) return undefined
  return { escaped, segments }
}

function insideFileLink(path: string, fragment: string): TMarkdownFileLink {
  return fragment ? { kind: "inside", path, fragment } : { kind: "inside", path }
}

function classifyFilePath(
  documentPath: string | undefined,
  filePath: string,
  fragment: string,
): TMarkdownFileLink | undefined {
  if (!filePath) return undefined
  if (isAnchoredFilePath(filePath)) return { kind: "outside", path: filePath }
  if (!documentPath) {
    return escapesNotebookRoot(filePath)
      ? { kind: "outside", path: filePath }
      : insideFileLink(filePath, fragment)
  }

  const walked = walkRelativePath(directorySegments(documentPath), filePath)
  if (!walked) return undefined
  if (walked.escaped > 0) {
    return {
      kind: "outside",
      path: `${"../".repeat(walked.escaped)}${walked.segments.join("/")}`,
    }
  }
  return insideFileLink(walked.segments.join("/"), fragment)
}

type TDirectoryParts = {
  readonly prefix: string
  readonly separator: string
  readonly segments: string[]
  readonly minimum: number
}

function directoryParts(directory: string): TDirectoryParts {
  const path = directory.trim()
  const unc = UNC_PATH_PATTERN.test(path)
  const drive = WINDOWS_DRIVE_PATH_PATTERN.test(path)
  const absolute = path.startsWith("/")
  const trimmed = path.replace(/[\\/]+$/u, "")
  if (unc) {
    return {
      prefix: "\\\\",
      separator: "\\",
      segments: trimmed
        .replaceAll("/", "\\")
        .split("\\")
        .filter((segment) => segment.length > 0),
      minimum: 2,
    }
  }
  if (drive) {
    return {
      prefix: "",
      separator: "\\",
      segments: trimmed
        .replaceAll("/", "\\")
        .split("\\")
        .filter((segment) => segment.length > 0),
      minimum: 1,
    }
  }
  return {
    prefix: absolute ? "/" : "",
    separator: "/",
    segments: trimmed.split("/").filter((segment) => segment.length > 0),
    minimum: 0,
  }
}

function joinDirectory(directory: string, relativePath: string): string {
  const base = directoryParts(directory)
  const segments = [...base.segments]
  for (const segment of relativePath.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      if (segments.length > base.minimum) segments.pop()
      continue
    }
    segments.push(segment)
  }
  if (segments.length === 1 && segments[0]?.endsWith(":")) return `${segments[0]}\\`
  if (segments.length === 0) return base.prefix === "/" ? "/" : base.prefix
  return `${base.prefix}${segments.join(base.separator)}`
}

export function anchorMarkdownOutsidePath(storageDirectory: string, outsidePath: string): string {
  const path = outsidePath.trim()
  if (!path || isAnchoredFilePath(path)) return path
  return joinDirectory(storageDirectory, path)
}

export function resolveLiteralMarkdownFileLink(
  documentPath: string | undefined,
  filePath: string,
): TMarkdownFileLink | undefined {
  const path = filePath.trim()
  if (!path) return undefined
  return classifyFilePath(documentPath, path, "")
}

export function resolveMarkdownFileLink(
  documentPath: string | undefined,
  href: string,
): TMarkdownFileLink | undefined {
  const normalizedHref = href.trim()
  if (!normalizedHref) return undefined
  if (normalizedHref.startsWith("//")) {
    return { kind: "external", url: `https:${normalizedHref}` }
  }

  const scheme = explicitLinkScheme(normalizedHref)
  if (scheme && SAFE_EXTERNAL_LINK_SCHEMES.has(scheme)) {
    return { kind: "external", url: normalizedHref }
  }
  if (scheme && scheme !== "file:") return undefined
  if (FILE_URL_PATTERN.test(normalizedHref)) {
    const path = fileUrlPath(normalizedHref)
    if (!path) return undefined
    return { kind: "outside", path }
  }

  const decoded = splitDecodedHref(normalizedHref)
  if (!decoded.path) {
    if (!documentPath) return undefined
    return insideFileLink(documentPath.replaceAll("\\", "/"), decoded.fragment)
  }
  return classifyFilePath(documentPath, decoded.path, decoded.fragment)
}
