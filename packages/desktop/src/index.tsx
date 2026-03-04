import React from "react"
import ReactDOM from "react-dom/client"
import { PlatformProvider, setRuntimePlatform } from "@buddy/web/context/platform"
import { ServerProvider } from "@buddy/web/context/server"
import { commands } from "./bindings"
import { createDesktopPlatform } from "./platform"
import { createDesktopServerConnection } from "./server"
import "./styles.css"

const rootElement = document.getElementById("root")!
document.documentElement.classList.add("dark")
const platform = createDesktopPlatform()

function ShellMessage(props: { children: React.ReactNode; tone?: "default" | "error" }) {
  const toneClass = props.tone === "error" ? "text-destructive" : "text-muted-foreground"

  return (
    <div className={`relative flex h-full items-center justify-center bg-background px-6 text-center ${toneClass}`}>
      {props.children}
      {platform.os === "windows" ? (
        <div data-tauri-decorum-tb className="absolute right-0 top-0 z-10 flex h-10 flex-row" />
      ) : null}
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="relative flex h-full items-center justify-center bg-background">
      <img src="/buddy-icon.png" alt="Buddy" className="h-24 w-24 rounded-2xl animate-pulse" />
      {platform.os === "windows" ? (
        <div data-tauri-decorum-tb className="absolute right-0 top-0 z-10 flex h-10 flex-row" />
      ) : null}
    </div>
  )
}

async function bootstrap() {
  const root = ReactDOM.createRoot(rootElement)
  setRuntimePlatform(platform)

  root.render(<LoadingScreen />)

  try {
    const server = await commands.awaitInitialization()
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
      </React.StrictMode>,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    root.render(<ShellMessage tone="error">Failed to start Buddy backend: {message}</ShellMessage>)
  }
}

if (!rootElement.innerHTML) {
  void bootstrap()
}
