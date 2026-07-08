import { buildProjectFileRawUrl } from "@/lib/project-file-raw-url"
import { resolveAssetUrl } from "@/lib/resource-url"
import { normalizeRelativePath } from "@/lib/workspace-file-paths"

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:/iu

function isAbsoluteUrl(value: string): boolean {
  return ABSOLUTE_URL_PATTERN.test(value)
}

function joinRelativeImagePath(documentPath: string, imagePath: string): string {
  const docDir = normalizeRelativePath(documentPath)
  const lastSlash = docDir.lastIndexOf("/")
  const baseDir = lastSlash >= 0 ? docDir.slice(0, lastSlash) : ""
  const normalizedImage = imagePath.replaceAll("\\", "/").replace(/^\.\/+/u, "")

  if (!baseDir) return normalizedImage
  if (normalizedImage.startsWith("/")) return normalizedImage.replace(/^\/+/u, "")
  return `${baseDir}/${normalizedImage}`
}

/**
 * Resolves an image `src` value from a Markdown/MDX Bench document into a URL
 * the renderer can actually load.
 *
 * - Absolute URLs (`https://`, `data:`, `blob:`, etc.) are passed through to
 *   `resolveAssetUrl`, which applies auth for embedded backends but otherwise
 *   leaves them untouched.
 * - Relative paths (`./foo.png`, `foo/bar.png`) are resolved against the
 *   directory of the owning document and rewritten to the project file raw
 *   endpoint (`/api/file/raw/...`) so the browser does not resolve them
 *   against the renderer origin (which would 404 inside Electron).
 */
export function resolveMarkdownBenchImageSrc(input: {
  directory: string
  documentPath: string
  src: string
}): string {
  const { src } = input
  if (!src) return src
  if (isAbsoluteUrl(src) || src.startsWith("data:") || src.startsWith("blob:")) {
    return resolveAssetUrl(src)
  }

  const resolvedPath = joinRelativeImagePath(input.documentPath, src)
  return resolveAssetUrl(buildProjectFileRawUrl({ directory: input.directory, path: resolvedPath }))
}
