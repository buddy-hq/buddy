export function basename(path: string): string {
  const normalized = path.replace(/\\+/g, "/")
  const segments = normalized.split("/").filter(Boolean)
  return segments.length > 0 ? segments[segments.length - 1] : path
}

export function dirname(path: string): string {
  const normalized = path.replace(/\\+/g, "/")
  const segments = normalized.split("/").filter(Boolean)
  if (segments.length <= 1) return "/"
  return segments.slice(0, -1).join("/")
}

export function stripAnsi(value: string): string {
  return value.replace(
    // eslint-disable-next-line no-control-regex
    /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g,
    "",
  )
}
