export function pathSegments(path: string): string[] {
  return path.split(/[/\\]/).filter((segment) => segment.length > 0)
}

export type TDirectoryDisplay = {
  /** The folder itself. The only part shown at full strength. */
  name: string
  /**
   * Everything before the name, already collapsed and elided, ending in the
   * separator that hands off to it. Empty when the path is a single segment.
   */
  ancestors: string
}

/** Ancestors kept beside the folder name once a path is deep enough to elide. */
const VISIBLE_ANCESTOR_SEGMENTS = 1
const ELLIPSIS = "…"
const HOME_ALIAS = "~"
const POSIX_SEPARATOR = "/"
const WINDOWS_SEPARATOR = "\\"

function isWindowsPath(path: string): boolean {
  return path.includes(WINDOWS_SEPARATOR)
}

/**
 * Turns a path into something a person can read at a glance: deep ancestors
 * elide and the folder name stays whole. `~` is preserved only when the input
 * already uses it, so an arbitrary shared or public directory is never
 * presented as the current user's home. Pass the untouched path separately
 * when a tooltip needs it.
 */
export function describeDirectory(absolutePath: string): TDirectoryDisplay {
  const separator = isWindowsPath(absolutePath) ? WINDOWS_SEPARATOR : POSIX_SEPARATOR
  const segments = pathSegments(absolutePath)
  const name = segments.at(-1) ?? absolutePath
  const parents = segments.slice(0, -1)

  const explicitHome = parents[0] === HOME_ALIAS
  const visibleParentLimit = VISIBLE_ANCESTOR_SEGMENTS + (explicitHome ? 1 : 0)
  const elided =
    parents.length > visibleParentLimit
      ? [
          ...(explicitHome ? [HOME_ALIAS] : []),
          ELLIPSIS,
          ...parents.slice(-VISIBLE_ANCESTOR_SEGMENTS),
        ]
      : parents

  return {
    name,
    ancestors: elided.length > 0 ? `${elided.join(separator)}${separator}` : "",
  }
}
