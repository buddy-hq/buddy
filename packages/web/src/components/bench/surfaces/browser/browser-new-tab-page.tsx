import { useMemo } from "react"
import { inAppBrowserDisplayUrl } from "@buddy/browser-contract"
import { BrowserFaviconImage } from "@/components/bench/surfaces/browser/browser-favicon-image"
import { Globe, XIcon } from "@/icons/app-icons"
import { inAppBrowserFaviconImageSources } from "@/lib/in-app-browser-favicon"
import type { InAppBrowserHistoryEntry } from "@/lib/in-app-browser-history"
import { useInAppBrowserHistoryStore } from "@/state/in-app-browser-history-store"

const RECENT_PAGES_SHOWN = 8
const NO_RECENT_PAGES: readonly InAppBrowserHistoryEntry[] = []

function BrowserRecentPage(props: {
  entry: InAppBrowserHistoryEntry
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <li className="group flex items-center rounded-md hover:bg-surface-base-hover">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
        onClick={props.onOpen}
      >
        <BrowserFaviconImage
          sources={inAppBrowserFaviconImageSources({
            capturedDataUrl: null,
            pageUrl: props.entry.url,
          })}
          fallback={<Globe className="size-3.5 shrink-0 text-icon-base" />}
          className="size-3.5 shrink-0 rounded-sm object-contain"
        />
        <span className="min-w-0 truncate text-sm text-text-strong">{props.entry.title}</span>
        <span className="min-w-0 truncate text-xs text-text-weaker">
          {inAppBrowserDisplayUrl(props.entry.url)}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Remove ${props.entry.title}`}
        className="mr-1 flex size-5 shrink-0 items-center justify-center rounded-sm text-icon-base opacity-0 hover:text-text-strong focus-visible:opacity-100 group-hover:opacity-100"
        onClick={props.onRemove}
      >
        <XIcon className="size-3" />
      </button>
    </li>
  )
}

export function BrowserNewTabPage(props: { directory: string; onOpen: (url: string) => void }) {
  const { directory } = props
  const history = useInAppBrowserHistoryStore(
    (state) => state.byDirectory[directory] ?? NO_RECENT_PAGES,
  )
  const recentPages = useMemo(() => history.slice(0, RECENT_PAGES_SHOWN), [history])

  return (
    <div className="absolute inset-0 overflow-y-auto bg-background-base">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-1 px-8 py-12">
        {recentPages.length === 0 ? (
          <p className="pt-16 text-center text-sm text-text-weak">
            Enter an address to start browsing.
          </p>
        ) : (
          <>
            <h2 className="px-2 text-[11px] font-medium uppercase tracking-wider text-text-weaker">
              Recently visited
            </h2>
            <ul className="flex flex-col">
              {recentPages.map((entry) => (
                <BrowserRecentPage
                  key={entry.url}
                  entry={entry}
                  onOpen={() => props.onOpen(entry.url)}
                  onRemove={() =>
                    useInAppBrowserHistoryStore
                      .getState()
                      .removeVisit({ directory, url: entry.url })
                  }
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
