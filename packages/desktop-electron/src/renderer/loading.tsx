import React from "react"
import ReactDOM from "react-dom/client"
import "./styles.css"

const BUDDY_ICON_FILENAME = "buddy-icon.png"

function LoadingWindow() {
  React.useEffect(() => {
    window.api.loadingWindowComplete()
  }, [])

  const iconUrl = resolveBuddyIconUrl()

  return (
    <div className="relative flex h-full items-center justify-center bg-background text-muted-foreground">
      <div className="flex flex-col items-center gap-4">
        <img src={iconUrl} alt="Buddy" className="h-20 w-20 rounded-2xl animate-pulse" />
        <p className="text-sm">Starting Buddy...</p>
      </div>
    </div>
  )
}

function resolveBuddyIconUrl() {
  const buddyGlobals = Reflect.get(window, "__BUDDY__")
  const assetBaseUrl =
    buddyGlobals && typeof buddyGlobals === "object"
      ? Reflect.get(buddyGlobals, "assetBaseUrl")
      : undefined

  if (typeof assetBaseUrl === "string" && assetBaseUrl.length > 0) {
    try {
      return new URL(BUDDY_ICON_FILENAME, assetBaseUrl).toString()
    } catch {
      // fallback below
    }
  }

  if (window.location.protocol === "file:") {
    try {
      return new URL(BUDDY_ICON_FILENAME, window.location.href).toString()
    } catch {
      // fallback below
    }
  }

  return `/${BUDDY_ICON_FILENAME}`
}

const rootElement = document.getElementById("root")
if (!(rootElement instanceof HTMLElement)) {
  throw new Error("Loading window root element not found")
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <LoadingWindow />
  </React.StrictMode>,
)
