import { useMemo, useState, type FormEvent } from "react"
import { Button, Input } from "@buddy/ui"
import { inAppBrowserDisplayUrl } from "@buddy/browser-contract"
import { BrowserFaviconImage } from "@/components/bench/surfaces/browser/browser-favicon-image"
import { Globe, SearchIcon, XIcon } from "@/icons/app-icons"
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

export function BrowserNewTabPage(props: {
  directory: string
  searchEngineLabel: string
  onSubmitInput: (value: string) => boolean
  onOpenUrl: (url: string) => void
}) {
  const { directory } = props
  const [query, setQuery] = useState("")
  const history = useInAppBrowserHistoryStore(
    (state) => state.byDirectory[directory] ?? NO_RECENT_PAGES,
  )
  const recentPages = useMemo(() => history.slice(0, RECENT_PAGES_SHOWN), [history])

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!props.onSubmitInput(query)) return
    setQuery("")
  }

  return (
    <div className="absolute inset-0 overflow-y-auto bg-background-base">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-8 py-14">
        <section className="flex flex-col gap-2">
          <form className="relative" onSubmit={submitSearch}>
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-icon-base"
            />
            <Input
              aria-label={`Search with ${props.searchEngineLabel}`}
              placeholder={`Search with ${props.searchEngineLabel}`}
              autoFocus
              value={query}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="h-10 rounded-xl bg-surface-base pl-10 pr-10 text-sm shadow-sm"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon-sm"
              aria-label="Submit search"
              disabled={!query.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2"
            >
              <SearchIcon className="size-3.5" />
            </Button>
          </form>
        </section>
        {recentPages.length === 0 ? (
          <p className="pt-8 text-center text-sm text-text-weak">
            Recently visited pages will appear here.
          </p>
        ) : (
          <section>
            <h2 className="px-2 text-[11px] font-medium uppercase tracking-wider text-text-weaker">
              Recently visited
            </h2>
            <ul className="flex flex-col">
              {recentPages.map((entry) => (
                <BrowserRecentPage
                  key={entry.url}
                  entry={entry}
                  onOpen={() => props.onOpenUrl(entry.url)}
                  onRemove={() =>
                    useInAppBrowserHistoryStore
                      .getState()
                      .removeVisit({ directory, url: entry.url })
                  }
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
