import { pathSegments } from "./directory-display"

export type TPermissionDockPathDisplay =
  | { kind: "plain"; path: string }
  | { kind: "split"; prefix: string; interactive: string; final: string }

function splitPath(prefix: string, tailSegments: string[]): TPermissionDockPathDisplay {
  const final = tailSegments[tailSegments.length - 1] ?? ""
  const interactive = tailSegments.slice(0, -1).join("/")

  return {
    kind: "split",
    prefix,
    interactive,
    final,
  }
}

export function getPermissionDockPathDisplay(path: string): TPermissionDockPathDisplay {
  const segments = pathSegments(path)
  if (segments.length <= 3) {
    return { kind: "plain", path }
  }

  const tailSegments = segments.slice(-3)
  const prefixSegments = segments.slice(0, -3)

  if (/^[A-Za-z]:/.test(path)) {
    const drive = prefixSegments[0] ?? ""
    const rest = prefixSegments.slice(1)
    const prefix = rest.length > 0 ? `${drive}/${rest.join("/")}/` : `${drive}/`
    return splitPath(prefix, tailSegments)
  }

  if (path.startsWith("/")) {
    return splitPath(`/${prefixSegments.join("/")}/`, tailSegments)
  }

  return splitPath(`${prefixSegments.join("/")}/`, tailSegments)
}
