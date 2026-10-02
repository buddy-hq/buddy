import {
  IN_APP_BROWSER_AUDIO_CHANNEL,
  IN_APP_BROWSER_FAVICON_CHANNEL,
  IN_APP_BROWSER_MESSAGE_CHANNEL,
  IN_APP_BROWSER_NEW_TAB_CHANNEL,
  IN_APP_BROWSER_SHORTCUT_CHANNEL,
  IN_APP_BROWSER_SHORTCUT_MODIFIER_CHANNEL,
  type InAppBrowserAudioMessage,
  type InAppBrowserFavicon,
  type InAppBrowserFaviconMessage,
  type InAppBrowserHostMessage,
  type InAppBrowserNewTabMessage,
  type InAppBrowserShortcutID,
  type InAppBrowserShortcutMessage,
  type InAppBrowserShortcutModifierMessage,
  type InAppBrowserShortcutModifierState,
} from "@buddy/browser-contract"
import type { WebContents } from "electron"

function sendToHost<TPayload extends { webContentsID: number }>(
  guest: WebContents,
  channel: string,
  payload: TPayload,
): void {
  const host = guest.hostWebContents
  if (!host || host.isDestroyed()) return
  host.send(channel, payload)
}

export function sendInAppBrowserNotice(guest: WebContents, message: string): void {
  sendToHost(guest, IN_APP_BROWSER_MESSAGE_CHANNEL, {
    webContentsID: guest.id,
    message,
  } satisfies InAppBrowserHostMessage)
}

export function sendInAppBrowserFavicon(guest: WebContents, favicon: InAppBrowserFavicon): void {
  sendToHost(guest, IN_APP_BROWSER_FAVICON_CHANNEL, {
    webContentsID: guest.id,
    favicon,
  } satisfies InAppBrowserFaviconMessage)
}

export function sendInAppBrowserAudio(guest: WebContents, audible: boolean): void {
  sendToHost(guest, IN_APP_BROWSER_AUDIO_CHANNEL, {
    webContentsID: guest.id,
    audible,
  } satisfies InAppBrowserAudioMessage)
}

export function sendInAppBrowserShortcut(
  guest: WebContents,
  shortcut: InAppBrowserShortcutID,
): void {
  sendToHost(guest, IN_APP_BROWSER_SHORTCUT_CHANNEL, {
    webContentsID: guest.id,
    shortcut,
  } satisfies InAppBrowserShortcutMessage)
}

export function sendInAppBrowserShortcutModifier(
  guest: WebContents,
  state: InAppBrowserShortcutModifierState,
): void {
  sendToHost(guest, IN_APP_BROWSER_SHORTCUT_MODIFIER_CHANNEL, {
    webContentsID: guest.id,
    state,
  } satisfies InAppBrowserShortcutModifierMessage)
}

export function sendInAppBrowserNewTab(guest: WebContents, url: string): void {
  sendToHost(guest, IN_APP_BROWSER_NEW_TAB_CHANNEL, {
    webContentsID: guest.id,
    url,
  } satisfies InAppBrowserNewTabMessage)
}
