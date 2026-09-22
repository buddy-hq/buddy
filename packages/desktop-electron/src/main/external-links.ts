import { READER_EXTERNAL_LINK_PROTOCOLS, readAllowedExternalLink } from "@buddy/reader-contract"

const DESKTOP_EXTERNAL_LINK_PROTOCOLS = [...READER_EXTERNAL_LINK_PROTOCOLS, "obsidian:"] as const

type PreventableEvent = { preventDefault(): void }

export type AppWindowNavigationBoundary = {
  currentUrl(): string
  setWindowOpenHandler(handler: (url: string) => { action: "deny" }): void
  onWillNavigate(handler: (event: PreventableEvent, url: string) => void): void
}

export function openDesktopExternalLink<TValue>(
  value: TValue,
  openExternal: (url: string) => Promise<void>,
): void {
  const safeUrl = readAllowedExternalLink(value, DESKTOP_EXTERNAL_LINK_PROTOCOLS)
  if (!safeUrl) return
  openExternal(safeUrl).catch((error) => {
    console.warn("failed to open external link", error)
  })
}

export function isAppDocumentNavigation(appUrl: string, navigationUrl: string): boolean {
  try {
    const current = new URL(appUrl)
    const next = new URL(navigationUrl)
    if (current.protocol === "file:") {
      return next.protocol === "file:" && next.pathname === current.pathname
    }
    return next.origin === current.origin
  } catch {
    return false
  }
}

export function wireAppWindowExternalLinks(
  appWindow: AppWindowNavigationBoundary,
  openExternal: (url: string) => Promise<void>,
): void {
  appWindow.setWindowOpenHandler((url) => {
    openDesktopExternalLink(url, openExternal)
    return { action: "deny" }
  })
  appWindow.onWillNavigate((event, url) => {
    if (isAppDocumentNavigation(appWindow.currentUrl(), url)) return
    event.preventDefault()
    openDesktopExternalLink(url, openExternal)
  })
}
