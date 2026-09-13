const WORKSPACE_FILE_INSTANCE_KEY_SEPARATOR = "\u0000"
const WINDOWS_PATH_SEPARATOR = "\\"
const POSIX_PATH_SEPARATOR = "/"

export function normalizeRelativePath(filepath: string) {
  return filepath.trim().replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "")
}

export function fileNameFromPath(filepath: string) {
  const normalized = normalizeRelativePath(filepath)
  if (!normalized) return normalized
  const lastSlash = normalized.lastIndexOf("/")
  if (lastSlash < 0) return normalized
  return normalized.slice(lastSlash + 1)
}

export function fileExtensionFromPath(filepath: string) {
  const name = fileNameFromPath(filepath).toLowerCase()
  const lastDot = name.lastIndexOf(".")
  if (lastDot <= 0 || lastDot === name.length - 1) return ""
  return name.slice(lastDot + 1)
}

export function absoluteWorkspaceFilePath(input: { directory: string; path: string }) {
  const normalizedDirectory = input.directory.replace(/[\\/]+$/u, "")
  const normalizedPath = input.path.replace(/^[\\/]+/u, "")
  const separator = normalizedDirectory.includes(WINDOWS_PATH_SEPARATOR)
    ? WINDOWS_PATH_SEPARATOR
    : POSIX_PATH_SEPARATOR
  return `${normalizedDirectory}${separator}${normalizedPath.replace(/[\\/]+/gu, separator)}`
}

// The inverse of `absoluteWorkspaceFilePath`: the notebook-relative path of an absolute path, or
// undefined when the path is not inside the notebook.
export function workspaceRelativeFilePath(input: { directory: string; path: string }) {
  const windows =
    /^[A-Za-z]:[\\/]/u.test(input.directory) || input.directory.includes(WINDOWS_PATH_SEPARATOR)
  const directory = input.directory
    .replace(/[\\/]+$/u, "")
    .replaceAll(WINDOWS_PATH_SEPARATOR, POSIX_PATH_SEPARATOR)
  const path = input.path.replaceAll(WINDOWS_PATH_SEPARATOR, POSIX_PATH_SEPARATOR)
  const prefix = `${directory}${POSIX_PATH_SEPARATOR}`
  const inside = windows
    ? path.toLowerCase().startsWith(prefix.toLowerCase())
    : path.startsWith(prefix)
  if (!inside) return undefined

  const relativePath = normalizeRelativePath(path.slice(prefix.length))
  if (!relativePath || relativePath.split(POSIX_PATH_SEPARATOR).includes("..")) return undefined
  return relativePath
}

export function workspaceFileInstanceKey(input: { directory: string; path: string }) {
  return `${input.directory}${WORKSPACE_FILE_INSTANCE_KEY_SEPARATOR}${input.path}`
}
