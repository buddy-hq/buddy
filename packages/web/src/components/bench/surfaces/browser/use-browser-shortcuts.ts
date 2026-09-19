import { useCallback, useEffect, useRef, type KeyboardEvent } from "react"
import {
  resolveInAppBrowserShortcutID,
  type AppShortcutPlatform,
  type InAppBrowserShortcutID,
} from "@buddy/browser-contract"
import type { InAppBrowserPlatform } from "@/context/platform"
import { useShortcutCommand } from "@/lib/use-shortcut-command"

type BrowserShortcutHandlers = { readonly [Shortcut in InAppBrowserShortcutID]: () => void }

export function useBrowserShortcuts(input: {
  browser: InAppBrowserPlatform
  active: boolean
  platform: AppShortcutPlatform
  webContentsID: number | null
  handlers: BrowserShortcutHandlers
}) {
  const { browser, platform, webContentsID } = input
  const handlersRef = useRef(input.handlers)
  handlersRef.current = input.handlers

  useShortcutCommand("composer.focus", () => handlersRef.current.focusAddress(), {
    enabled: input.active,
  })

  useEffect(() => {
    if (webContentsID === null) return
    return browser.onShortcut((message) => {
      if (message.webContentsID === webContentsID) handlersRef.current[message.shortcut]()
    })
  }, [browser, webContentsID])

  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const shortcut = resolveInAppBrowserShortcutID(
        {
          type: "keyDown",
          key: event.key,
          code: event.code,
          isAutoRepeat: event.repeat,
          isComposing: event.nativeEvent.isComposing,
          shift: event.shiftKey,
          control: event.ctrlKey,
          alt: event.altKey,
          meta: event.metaKey,
        },
        platform,
      )
      if (!shortcut) return
      event.preventDefault()
      handlersRef.current[shortcut]()
    },
    [platform],
  )
}
