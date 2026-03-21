import { applyThemePreload } from "./preload-runtime"

applyThemePreload({
  document,
  storage: localStorage,
  matchMedia: window.matchMedia.bind(window),
})
