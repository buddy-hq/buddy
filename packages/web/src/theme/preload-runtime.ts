import {
  DEFAULT_THEME_ID,
  PRELOAD_STYLE_ID,
  STORAGE_KEYS,
  THEME_CACHE_VERSION,
  normalizeThemeID,
} from './storage'

type ThemePreloadEnvironment = {
  document: Document
  storage: Storage
  matchMedia: (query: string) => MediaQueryList
}

function clearThemeCache(storage: Storage) {
  storage.removeItem(STORAGE_KEYS.THEME_CSS_LIGHT)
  storage.removeItem(STORAGE_KEYS.THEME_CSS_DARK)
}

export function applyThemePreload(environment: ThemePreloadEnvironment) {
  const storedThemeID = environment.storage.getItem(STORAGE_KEYS.THEME_ID)
  const themeID = normalizeThemeID(storedThemeID) ?? DEFAULT_THEME_ID
  const cachedVersion = environment.storage.getItem(STORAGE_KEYS.CACHE_VERSION)

  if (cachedVersion !== THEME_CACHE_VERSION || storedThemeID !== themeID) {
    clearThemeCache(environment.storage)
    environment.storage.setItem(STORAGE_KEYS.CACHE_VERSION, THEME_CACHE_VERSION)
  }

  if (storedThemeID !== themeID) {
    environment.storage.setItem(STORAGE_KEYS.THEME_ID, themeID)
  }

  const scheme = environment.storage.getItem(STORAGE_KEYS.COLOR_SCHEME) ?? 'system'
  const isDark =
    scheme === 'dark' ||
    (scheme === 'system' && environment.matchMedia('(prefers-color-scheme: dark)').matches)
  const mode = isDark ? 'dark' : 'light'

  environment.document.documentElement.dataset.theme = themeID
  environment.document.documentElement.dataset.colorScheme = mode
  environment.document.documentElement.classList.toggle('dark', isDark)
  environment.document.documentElement.style.colorScheme = mode

  const css = environment.storage.getItem(
    isDark ? STORAGE_KEYS.THEME_CSS_DARK : STORAGE_KEYS.THEME_CSS_LIGHT,
  )
  if (!css) return

  const style = environment.document.createElement('style')
  style.id = PRELOAD_STYLE_ID
  style.textContent = `:root{color-scheme:${mode};--text-mix-blend-mode:${isDark ? 'plus-lighter' : 'multiply'};${css}}`
  environment.document.head.appendChild(style)
}
