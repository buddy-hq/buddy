import { ipcRenderer } from "electron"
import { installInAppBrowserCitations } from "./in-app-browser-citations"
import { IN_APP_BROWSER_MOUSE_NAVIGATION_CHANNEL } from "../shared/in-app-browser-mouse-navigation-channel"
import {
  IN_APP_BROWSER_NAVIGATION_BLOCKED_CHANNEL,
  installInAppBrowserPageNavigationGuard,
  type InAppBrowserActivationPathTarget,
} from "../shared/in-app-browser-navigation"

const MOUSE_BUTTON_BACK = 3
const MOUSE_BUTTON_FORWARD = 4

type BrowserMouseEvent = {
  readonly button: number
  readonly isTrusted: boolean
  composedPath(): readonly InAppBrowserActivationPathTarget[]
  preventDefault(): void
  stopImmediatePropagation(): void
}

type BrowserEventTarget = {
  addEventListener(
    type: string,
    listener: (event: BrowserMouseEvent) => void,
    capture?: boolean,
  ): void
  removeEventListener(
    type: string,
    listener: (event: BrowserMouseEvent) => void,
    capture?: boolean,
  ): void
}

// Electron executes this preload in a frame global; the Node-only preload tsconfig omits DOM types.
declare const window: BrowserEventTarget

function directionForButton(button: number): "back" | "forward" | undefined {
  if (button === MOUSE_BUTTON_BACK) return "back"
  if (button === MOUSE_BUTTON_FORWARD) return "forward"
  return undefined
}

function suppressNavigationButton(event: BrowserMouseEvent): void {
  if (!event.isTrusted || directionForButton(event.button) === undefined) return
  event.preventDefault()
  event.stopImmediatePropagation()
}

function requestNavigation(event: BrowserMouseEvent): void {
  if (!event.isTrusted) return
  const direction = directionForButton(event.button)
  if (direction === undefined) return
  event.preventDefault()
  event.stopImmediatePropagation()
  ipcRenderer.send(IN_APP_BROWSER_MOUSE_NAVIGATION_CHANNEL, { direction })
}

window.addEventListener("mousedown", suppressNavigationButton, true)
window.addEventListener("mouseup", requestNavigation, true)
window.addEventListener("auxclick", suppressNavigationButton, true)
installInAppBrowserPageNavigationGuard(window, () => {
  ipcRenderer.send(IN_APP_BROWSER_NAVIGATION_BLOCKED_CHANNEL)
})
installInAppBrowserCitations()
