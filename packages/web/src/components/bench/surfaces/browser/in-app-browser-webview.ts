import type { InAppBrowserWebviewStateReader } from "@/lib/in-app-browser-events"

export type InAppBrowserWebview = HTMLElement &
  InAppBrowserWebviewStateReader & {
    loadURL(url: string): Promise<void>
    goBack(): void
    goForward(): void
    reload(): void
    reloadIgnoringCache(): void
    openDevTools(): void
    setZoomFactor(factor: number): void
    setAudioMuted(muted: boolean): void
  }

// Electron throws while the guest is not attached, so calls are skipped then.
export type WithInAppBrowserWebview = (action: (webview: InAppBrowserWebview) => void) => void
