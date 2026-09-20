import { useState, type ReactNode } from "react"
import { Button } from "@buddy/ui"
import { Globe } from "@/icons/app-icons"
import {
  describeInAppBrowserLoadError,
  inAppBrowserLoadErrorLabel,
} from "@/lib/in-app-browser-load-errors"
import type { InAppBrowserPageError } from "@/state/in-app-browser-tabs-store"

const UNREACHABLE_TIPS = [
  "Checking your connection",
  "Confirming the dev server is running",
  "Checking the proxy and the firewall",
]

function hostOf(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

function BrowserErrorLayout(props: {
  title: string
  children: ReactNode
  footer?: ReactNode
  onReload: () => void
}) {
  return (
    <div className="absolute inset-0 flex overflow-y-auto bg-background-base">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-8 py-12">
        <Globe className="mb-6 size-10 text-icon-base" />
        <h1 className="mb-3 text-xl font-semibold text-text-strong">{props.title}</h1>
        {props.children}
        <div className="mt-auto flex items-center gap-2 pt-8">
          {props.footer}
          <div className="flex-1" />
          <Button type="button" size="sm" onClick={props.onReload}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  )
}

function BrowserUnreachablePage(props: {
  url: string
  code: number
  description: string
  onReload: () => void
}) {
  const [showDetails, setShowDetails] = useState(false)
  return (
    <BrowserErrorLayout
      title="This site can’t be reached"
      onReload={props.onReload}
      footer={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowDetails((shown) => !shown)}
        >
          {showDetails ? "Hide details" : "Details"}
        </Button>
      }
    >
      <p className="text-sm text-text-weak">
        <span className="font-medium text-text-strong">{hostOf(props.url)}</span>:{" "}
        {describeInAppBrowserLoadError(props.description)}.
      </p>
      {showDetails ? (
        <div className="mt-6 rounded-lg border border-border-weaker-base bg-surface-base p-4 text-sm">
          <p className="mb-2 font-medium text-text-strong">Try:</p>
          <ul className="list-disc space-y-1 pl-5 text-text-weak">
            {UNREACHABLE_TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-8 text-xs uppercase tracking-wide text-text-weaker">
        {inAppBrowserLoadErrorLabel(props)}
      </p>
    </BrowserErrorLayout>
  )
}

function BrowserCrashedPage(props: { onReload: () => void }) {
  return (
    <BrowserErrorLayout title="This page keeps crashing" onReload={props.onReload}>
      <p className="text-sm text-text-weak">
        Buddy restarted it a few times, but it crashed again. Reload to try once more.
      </p>
    </BrowserErrorLayout>
  )
}

export function BrowserPageError(props: {
  error: InAppBrowserPageError | null
  onReload: () => void
}) {
  if (props.error?.["_tag"] === "load-failed") {
    return (
      <BrowserUnreachablePage
        url={props.error.url}
        code={props.error.code}
        description={props.error.description}
        onReload={props.onReload}
      />
    )
  }
  if (props.error?.["_tag"] === "crashed") return <BrowserCrashedPage onReload={props.onReload} />
  return null
}
