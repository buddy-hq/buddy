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
