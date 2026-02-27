import React from "react"
import ReactDOM from "react-dom/client"
import { PlatformProvider, createBrowserPlatform, setRuntimePlatform } from "./context/platform"
import { ServerProvider, createBrowserServerConnection } from "./context/server"
import "./index.css"

const rootElement = document.getElementById("root")!
document.documentElement.classList.add("dark")

if (!rootElement.innerHTML) {
  const platform = createBrowserPlatform()
  setRuntimePlatform(platform)

  void import("./app").then(({ AppBaseProviders, AppInterface }) => {
    const root = ReactDOM.createRoot(rootElement)
    root.render(
      <React.StrictMode>
        <AppBaseProviders>
          <PlatformProvider value={platform}>
            <ServerProvider value={createBrowserServerConnection()}>
              <AppInterface />
            </ServerProvider>
          </PlatformProvider>
        </AppBaseProviders>
      </React.StrictMode>
    )
  })
}
