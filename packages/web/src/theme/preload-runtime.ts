import { SYSTEM_DARK_MEDIA_QUERY, colorSchemeMode, readColorScheme } from "./color-scheme"
import { PRELOAD_STYLE_ID } from "./storage"
import {
  applyDocumentThemeState,
  cacheThemeSlotsCss,
  dropOutdatedThemeCssCache,
  readCachedThemeCss,
  rootThemeCss,
} from "./theme-css"
import { migrateThemeSlots } from "./theme-slots"

type ThemePreloadEnvironment = {
  document: Document
  storage: Storage
  matchMedia: (query: string) => MediaQueryList
}

export function applyThemePreload(environment: ThemePreloadEnvironment) {
  const { document, storage } = environment

  dropOutdatedThemeCssCache(storage)
  const slots = migrateThemeSlots(storage)
  const mode = colorSchemeMode(
    readColorScheme(storage),
    environment.matchMedia(SYSTEM_DARK_MEDIA_QUERY).matches,
  )

  applyDocumentThemeState(document, slots[mode], mode)

  if (!readCachedThemeCss(storage, mode)) cacheThemeSlotsCss(storage, slots)
  const css = readCachedThemeCss(storage, mode)
  if (!css) return

  const style = document.createElement("style")
  style.id = PRELOAD_STYLE_ID
  style.textContent = rootThemeCss(mode, css)
  document.head.appendChild(style)
}
