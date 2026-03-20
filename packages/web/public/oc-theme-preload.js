;(function () {
  var cacheVersion = "2"
  var themeKey = "opencode-theme-id"
  var schemeKey = "opencode-color-scheme"
  var cacheVersionKey = "opencode-theme-cache-version"
  var lightCssKey = "opencode-theme-css-light"
  var darkCssKey = "opencode-theme-css-dark"
  var themeId = localStorage.getItem(themeKey) || "oc-2"

  if (localStorage.getItem(cacheVersionKey) !== cacheVersion) {
    localStorage.removeItem(lightCssKey)
    localStorage.removeItem(darkCssKey)
    localStorage.setItem(cacheVersionKey, cacheVersion)
  }

  if (themeId === "oc-1") {
    themeId = "oc-2"
    localStorage.setItem(themeKey, themeId)
    localStorage.removeItem(lightCssKey)
    localStorage.removeItem(darkCssKey)
    localStorage.setItem(cacheVersionKey, cacheVersion)
  }

  var scheme = localStorage.getItem(schemeKey) || "system"
  var isDark = scheme === "dark" || (scheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  var mode = isDark ? "dark" : "light"

  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode
  document.documentElement.classList.toggle("dark", isDark)
  document.documentElement.style.colorScheme = mode

  var css = localStorage.getItem(isDark ? darkCssKey : lightCssKey)
  if (!css) return

  var style = document.createElement("style")
  style.id = "oc-theme-preload"
  style.textContent =
    ":root{color-scheme:" +
    mode +
    ";--text-mix-blend-mode:" +
    (isDark ? "plus-lighter" : "multiply") +
    ";" +
    css +
    "}"
  document.head.appendChild(style)
})()
