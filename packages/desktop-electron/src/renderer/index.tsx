import React from "react"
import ReactDOM from "react-dom/client"
import { PlatformProvider, setRuntimePlatform, type Platform } from "@buddy/web/context/platform"
import { ServerProvider } from "@buddy/web/context/server"
import { createDesktopPlatform } from "./platform"
import { createDesktopServerConnection } from "./server"
import "./styles.css"

const rootElement = document.getElementById("root")

if (!(rootElement instanceof HTMLElement)) {
  throw new Error("Desktop renderer root element not found")
}
const rootHostElement: HTMLElement = rootElement

document.documentElement.classList.add("dark")
const ELECTRON_ENTRY_HTML_SUFFIX = "/index.html"
const BUDDY_ICON_FILENAME = "buddy-icon.png"

const platform = createDesktopPlatform()
installLegacyElectronApiBridge(platform)
wireDesktopEvents()
normalizeInitialRoute()

function normalizeInitialRoute() {
  if (window.location.protocol === "file:") {
    return
  }

  const pathname = window.location.pathname.replaceAll("\\", "/")
  const shouldNormalize = pathname === ELECTRON_ENTRY_HTML_SUFFIX

  if (!shouldNormalize) {
    return
  }

  if (!pathname.endsWith(ELECTRON_ENTRY_HTML_SUFFIX)) {
    return
  }

  const suffix = `${window.location.search}${window.location.hash}`
  const next = suffix ? `/${suffix}` : "/"
  window.history.replaceState(null, "", next)
}

function ShellMessage(props: { children: React.ReactNode; tone?: "default" | "error" }) {
  const toneClass = props.tone === "error" ? "text-destructive" : "text-muted-foreground"

  return (
    <div
      className={`relative flex h-full items-center justify-center bg-background px-6 text-center ${toneClass}`}
    >
      {props.children}
    </div>
  )
}

function LoadingScreen() {
  const iconUrl = resolveBuddyIconUrl()

  return (
    <div className="relative flex h-full items-center justify-center bg-background">
      <img src={iconUrl} alt="Buddy" className="h-24 w-24 rounded-2xl animate-pulse" />
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

function installLegacyElectronApiBridge(nextPlatform: Platform) {
  window.electronAPI = {
    openDirectoryPickerDialog: async () => {
      if (!nextPlatform.openDirectoryPickerDialog) {
        return null
      }
      return nextPlatform.openDirectoryPickerDialog({
        multiple: false,
        title: "Open project",
      })
    },
    openFilePickerDialog: async () => {
      if (!nextPlatform.openFilePickerDialog) {
        return null
      }
      return nextPlatform.openFilePickerDialog({
        multiple: false,
        title: "Select file",
      })
    },
  }
}

function wireDesktopEvents() {
  window.api.onMenuCommand((id) => {
    window.dispatchEvent(new CustomEvent("buddy:menu-command", { detail: { id } }))
  })

  window.api.onDeepLink((urls) => {
    window.dispatchEvent(new CustomEvent("buddy:deep-link", { detail: { urls } }))
  })
}

async function bootstrap() {
  const root = ReactDOM.createRoot(rootHostElement)
  setRuntimePlatform(platform)

  root.render(<LoadingScreen />)

  try {
    const server = await window.api.awaitInitialization(() => undefined)

    const { AppBaseProviders, AppInterface, resetAppRuntimeState } = await import("@buddy/web/app")
    resetAppRuntimeState()

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
