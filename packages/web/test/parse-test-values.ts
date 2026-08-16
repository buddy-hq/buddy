import {
  hasFunctionValue,
  parseBooleanValue,
  parseBuddyConfigObject,
  parseBuddyConfigValue,
  parseFiniteNumber,
  parseStringValue,
  stringifyCaughtError,
  type TBuddyConfigObject,
  type TBuddyConfigValue,
} from "../src/state/parse-external"

export type { TBuddyConfigObject, TBuddyConfigValue }

export {
  hasFunctionValue,
  parseBooleanValue,
  parseBuddyConfigObject,
  parseBuddyConfigValue,
  parseFiniteNumber,
  parseStringValue,
  stringifyCaughtError,
}

export const TRANSCRIPT_PERF_GLOBAL_KEY = "__BUDDY_TRANSCRIPT_PERF__"
export const TEST_CHEMISTRY_RENDERER_KEY = "__BUDDY_TEST_CHEMISTRY_RENDERER__"
export const TEST_MERMAID_RUNTIME_KEY = "__BUDDY_TEST_MERMAID_RUNTIME__"

export function setBuddyTestGlobal<TValue>(key: string, value: TValue): void {
  Object.assign(globalThis, { [key]: value })
}

export function parseRequestUrl(input: RequestInfo | URL): string {
  const asString = parseStringValue(input)
  if (asString !== undefined) return asString
  if (input instanceof URL) return input.toString()
  if (input instanceof Request) return input.url
  return ""
}

export function parseJsonObjectText(text: string): TBuddyConfigObject | undefined {
  try {
    return parseBuddyConfigObject(JSON.parse(text))
  } catch {
    return undefined
  }
}

export function parsePersistedStoreState(text: string | null): TBuddyConfigObject | undefined {
  if (text === null) return undefined
  return parseBuddyConfigObject(parseJsonObjectText(text)?.state)
}

export function parseJsonValueText(text: string): TBuddyConfigValue | undefined {
  try {
    return parseBuddyConfigValue(JSON.parse(text))
  } catch {
    return undefined
  }
}

export function createThemeMediaQueryList(matches: boolean): MediaQueryList {
  return new ThemeMediaQueryList(matches)
}

class ThemeMediaQueryList extends EventTarget implements MediaQueryList {
  matches: boolean
  media = "(prefers-color-scheme: dark)"
  onchange: MediaQueryList["onchange"] = null
  private mediaListeners = new Set<NonNullable<MediaQueryList["onchange"]>>()

  constructor(matches: boolean) {
    super()
    this.matches = matches
  }

  addListener(callback: MediaQueryList["onchange"]): void {
    if (callback) this.mediaListeners.add(callback)
  }

  removeListener(callback: MediaQueryList["onchange"]): void {
    if (callback) this.mediaListeners.delete(callback)
  }
}
