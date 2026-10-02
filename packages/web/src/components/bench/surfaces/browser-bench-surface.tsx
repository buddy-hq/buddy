import { useMemo } from "react"
import { Globe } from "@/icons/app-icons"
import { BenchStaticContextProvider } from "@/components/bench/bench-static-context-provider"
import { usePlatform } from "@/context/platform"
import type { BenchTarget } from "@/lib/bench-navigation"
import { BrowserTab } from "./browser/browser-tab"
import "./browser-bench-surface.css"

const BROWSER_UNAVAILABLE_METADATA = ["surface: browser", "surface_status: unavailable"]

export function BrowserBenchSurface(props: {
  directory: string
  target: Extract<BenchTarget, { type: "browser" }>
}) {
  const browser = usePlatform().inAppBrowser
  const idleBrowser = useMemo(() => ({ url: props.target.url, loading: false }), [props.target.url])

  if (!browser) {
    return (
      <BenchStaticContextProvider
        status="unavailable"
        metadata={BROWSER_UNAVAILABLE_METADATA}
        content="This Browser tab cannot show its page: the Browser needs the Buddy desktop app, and this notebook is open in a web build."
        browser={idleBrowser}
      >
        <div className="flex h-full items-center justify-center bg-background-base p-8">
          <div className="max-w-sm text-center">
            <Globe className="mx-auto mb-3 size-6 text-icon-base" />
            <p className="text-sm font-medium text-text-strong">Browser requires Buddy desktop.</p>
            <p className="mt-1 text-sm text-text-weak">
              Open this notebook in the Buddy app to browse here.
            </p>
          </div>
        </div>
      </BenchStaticContextProvider>
    )
  }

  return <BrowserTab directory={props.directory} target={props.target} browser={browser} />
}
