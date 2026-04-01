import React from "react"
import ReactDOM from "react-dom/client"
import "./styles.css"

function LoadingWindow() {
  React.useEffect(() => {
    window.api.loadingWindowComplete()
  }, [])

  return (
    <div className="relative flex h-full items-center justify-center bg-background text-muted-foreground">
      <div className="flex flex-col items-center gap-4">
        <img src="/buddy-icon.png" alt="Buddy" className="h-20 w-20 rounded-2xl animate-pulse" />
        <p className="text-sm">Starting Buddy...</p>
      </div>
    </div>
  )
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
