import { useMemo } from "react"
import { useRegisterBenchContextProvider } from "@/components/bench/bench-route-context"
import type { BenchTarget } from "@/lib/bench-navigation"
import type { InAppBrowserTabRuntime } from "@/state/in-app-browser-tabs-store"

export function useBrowserBenchContext(input: {
  target: Extract<BenchTarget, { type: "browser" }>
  runtime: InAppBrowserTabRuntime
}) {
  const { runtime } = input
  const provider = useMemo(
    () => ({
      read: () => ({
        targetStatus: runtime.error
          ? ("error" as const)
          : runtime.loading
            ? ("loading" as const)
            : ("ready" as const),
        title: runtime.title,
        browser: { url: runtime.url, loading: runtime.loading },
        metadata: [
          "surface: browser",
          "control: user-only",
          `loading: ${runtime.loading ? "yes" : "no"}`,
        ],
        content:
          "This is a live Browser tab controlled by the user. The agent knows its URL and status but cannot read or operate the page. The user can cite selected page text into the chat; each citation carries the exact excerpt they selected and the page URL.",
        refs: [
          {
            kind: "url" as const,
            value: runtime.url,
            note: "Current URL in the selected Browser tab.",
          },
        ],
        hints: [
          "Use inapp_browser_open to open another URL in a new visible Browser tab.",
          "Do not claim to see, click, type in, or inspect the web page.",
        ],
      }),
    }),
    [runtime],
  )
  useRegisterBenchContextProvider({ target: input.target, provider })
}
