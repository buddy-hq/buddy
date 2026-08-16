import React from "react"
import ReactDOM from "react-dom/client"
import { parseTNonEmptyString, readBuddyRendererGlobals } from "../shared/parse-external"
import "./styles.css"

const BUDDY_ICON_FILENAME = "buddy-icon.png"

function LoadingWindow() {
  React.useEffect(() => {
    window.api.loadingWindowComplete()
  }, [])

  const iconUrl = resolveBuddyIconUrl()

  return (
    <div className="relative flex h-full items-center justify-center bg-background-base text-text-weak">
      <div className="flex flex-col items-center gap-4">
        <img src={iconUrl} alt="Buddy" className="h-28 w-28 rounded-3xl animate-pulse" />
        <p className="text-sm">Starting Buddy...</p>
      </div>
    </div>
  )
}

function resolveBuddyIconUrl() {
  const assetBaseUrl = parseTNonEmptyString(readBuddyRendererGlobals(window)?.assetBaseUrl)

  if (assetBaseUrl !== undefined) {
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
