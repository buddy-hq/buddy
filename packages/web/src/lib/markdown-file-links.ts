import {
  isLikelyExternalMediaPathCandidate,
  isLikelyPresentedMediaPathCandidate,
} from "./presented-media"
import { referencePath } from "./presented-media-markdown"
import { fileExtensionFromPath } from "./workspace-file-paths"

const URI_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/u
const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/u
const SLASH_PREFIXED_WINDOWS_DRIVE_PATTERN = /^\/[A-Za-z]:\//u
const FILE_URL_PATTERN = /^file:/iu
const UNC_PATH_PATTERN = /^\\\\[^\\]+\\[^\\]+/u
const LOCAL_HOSTNAME = "localhost"

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

function localLinkPath(target: string): string | undefined {
  if (!WINDOWS_DRIVE_PATH_PATTERN.test(target) && URI_SCHEME_PATTERN.test(target)) return undefined
  return referencePath(target)
}

function isFileLinkPath(path: string): boolean {
  if (isLikelyPresentedMediaPathCandidate(path)) return true
  if (fileExtensionFromPath(path) === "") return false
  return UNC_PATH_PATTERN.test(path) || isLikelyExternalMediaPathCandidate(path)
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
