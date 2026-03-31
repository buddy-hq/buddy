import React from "react"
import ReactDOM from "react-dom/client"
import "@buddy/ui/styles"
import { PlatformProvider, createBrowserPlatform, setRuntimePlatform } from "./context/platform"
import { ServerProvider, createBrowserServerConnection } from "./context/server"
import { configureE2EPlatform } from "./e2e/driver"

const rootElement = document.getElementById("root")!

if (!rootElement.innerHTML) {
  const platform = configureE2EPlatform(createBrowserPlatform())
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
      </React.StrictMode>,
    )
  })
}
