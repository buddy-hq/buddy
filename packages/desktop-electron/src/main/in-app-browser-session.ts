import {
  inAppBrowserProfilePartition,
  parseInAppBrowserPartition,
  type InAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import { session, type Session } from "electron"
import { join } from "node:path"
import { IN_APP_BROWSER_PRELOAD_FROM_MAIN_DIRECTORY } from "../../scripts/in-app-browser-preload-artifact"
import { configureInAppBrowserSessionBoundary } from "./in-app-browser-boundary"

type ConfiguredSession = { readonly preloadID: string; readonly disposeBoundary: () => void }

const configuredSessions = new Map<Session, ConfiguredSession>()
const IN_APP_BROWSER_PRELOAD_PATH = join(__dirname, IN_APP_BROWSER_PRELOAD_FROM_MAIN_DIRECTORY)

/**
 * Open the Chromium session for an in-app browser partition string.
 *
 * Import and clear take the same partition the webview `partition` attribute
 * uses, then resolve it here so cookies land in that jar even when no tab has
 * opened the profile this run.
 */
export function inAppBrowserSessionFromPartition(partition: string): Session {
  const profileID = parseInAppBrowserPartition(partition)
  if (!profileID) {
    throw new Error(`in-app browser does not own partition ${partition}`)
  }
  return inAppBrowserProfileSession(profileID)
}

export function inAppBrowserProfileSession(profileID: InAppBrowserProfileID): Session {
  // Keep Electron's native User-Agent. Rewriting it, even to a Chrome-looking
  // string, makes Cloudflare Turnstile fail its integrity check (error 600010).
  const browserSession = session.fromPartition(inAppBrowserProfilePartition(profileID))
  if (configuredSessions.has(browserSession)) return browserSession
  const preloadID = browserSession.registerPreloadScript({
    id: "buddy-in-app-browser",
    type: "frame",
    filePath: IN_APP_BROWSER_PRELOAD_PATH,
  })
  try {
    const disposeBoundary = configureInAppBrowserSessionBoundary({
      setPermissionRequestHandler(handler) {
        browserSession.setPermissionRequestHandler(
          handler ? (_webContents, permission, callback) => handler(permission, callback) : null,
        )
      },
      setPermissionCheckHandler(handler) {
        browserSession.setPermissionCheckHandler(
          handler ? (_webContents, permission) => handler(permission) : null,
        )
      },
    })
    configuredSessions.set(browserSession, { preloadID, disposeBoundary })
  } catch (error) {
    browserSession.unregisterPreloadScript(preloadID)
    browserSession.setPermissionRequestHandler(null)
    browserSession.setPermissionCheckHandler(null)
    throw error
  }
  return browserSession
}

export function disposeInAppBrowserSessions(): void {
  for (const [browserSession, configured] of configuredSessions) {
    configured.disposeBoundary()
    browserSession.unregisterPreloadScript(configured.preloadID)
  }
  configuredSessions.clear()
}
