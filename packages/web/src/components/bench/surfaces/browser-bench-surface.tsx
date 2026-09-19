import { Globe } from "@/icons/app-icons"
import { usePlatform } from "@/context/platform"
import type { BenchTarget } from "@/lib/bench-navigation"
import { BrowserTab } from "./browser/browser-tab"
import "./browser-bench-surface.css"

export function BrowserBenchSurface(props: {
  directory: string
  target: Extract<BenchTarget, { type: "browser" }>
}) {
  const browser = usePlatform().inAppBrowser

  if (!browser) {
    return (
      <div className="flex h-full items-center justify-center bg-background-base p-8">
        <div className="max-w-sm text-center">
          <Globe className="mx-auto mb-3 size-6 text-icon-base" />
          <p className="text-sm font-medium text-text-strong">Browser requires Buddy desktop.</p>
          <p className="mt-1 text-sm text-text-weak">
            Open this notebook in the Buddy app to browse here.
          </p>
        </div>
      </div>
    )
  }

  return <BrowserTab directory={props.directory} target={props.target} browser={browser} />
}
