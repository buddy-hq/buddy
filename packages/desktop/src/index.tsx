import React from "react"
import ReactDOM from "react-dom/client"
import { invoke } from "@tauri-apps/api/core"
import { PlatformProvider, setRuntimePlatform } from "@buddy/web/context/platform"
import { ServerProvider } from "@buddy/web/context/server"
import { createDesktopPlatform } from "./platform"
import {
  createDesktopServerConnection,
  type DesktopServerReadyData,
} from "./server"
import "./styles.css"

const rootElement = document.getElementById("root")!
document.documentElement.classList.add("dark")

async function bootstrap() {
  const root = ReactDOM.createRoot(rootElement)

  root.render(
    <div className="flex h-full items-center justify-center bg-background text-muted-foreground">
      Connecting to Buddy...
    </div>
  )

  const platform = createDesktopPlatform()
  setRuntimePlatform(platform)

  try {
    const server = await invoke<DesktopServerReadyData>("await_initialization")
    const { AppBaseProviders, AppInterface } = await import("@buddy/web/app")
    root.render(
      <React.StrictMode>
        <AppBaseProviders>
          <PlatformProvider value={platform}>
            <ServerProvider value={createDesktopServerConnection(server)}>
              <AppInterface />
            </ServerProvider>
          </PlatformProvider>
        </AppBaseProviders>
      </React.StrictMode>
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    root.render(
      <div className="flex h-full items-center justify-center bg-background px-6 text-center text-sm text-destructive">
        Failed to start Buddy backend: {message}
      </div>
    )
  }
}

if (!rootElement.innerHTML) {
  void bootstrap()
}
