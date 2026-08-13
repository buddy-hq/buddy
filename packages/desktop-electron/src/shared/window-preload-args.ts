const BUDDY_WINDOW_VERSION_ARG_PREFIX = "--buddy-window-version="

export function encodeBuddyWindowVersionArg(version: string): string {
  return `${BUDDY_WINDOW_VERSION_ARG_PREFIX}${encodeURIComponent(version)}`
}

export function readBuddyWindowVersionArg(argv: readonly string[]): string | undefined {
  for (let index = argv.length - 1; index >= 0; index -= 1) {
    const argument = argv[index]
    if (argument === undefined || !argument.startsWith(BUDDY_WINDOW_VERSION_ARG_PREFIX)) {
      continue
    }

    const encoded = argument.slice(BUDDY_WINDOW_VERSION_ARG_PREFIX.length)
    if (encoded.length === 0) {
      return undefined
    }

    try {
      const version = decodeURIComponent(encoded).trim()
      return version.length > 0 ? version : undefined
    } catch {
      return undefined
    }
  }

  return undefined
}
