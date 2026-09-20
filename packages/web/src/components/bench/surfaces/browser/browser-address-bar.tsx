import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { Button, Input, cn } from "@buddy/ui"
import { IN_APP_BROWSER_BLANK_URL, inAppBrowserDisplayUrl } from "@buddy/browser-contract"
import { ExternalLinkIcon } from "@/icons/app-icons"

const OPEN_EXTERNAL_LABEL = "Open in system browser"

function addressFor(pageUrl: string): string {
  return pageUrl === IN_APP_BROWSER_BLANK_URL ? "" : inAppBrowserDisplayUrl(pageUrl)
}

export function BrowserAddressBar(props: {
  pageUrl: string
  focusRequest: number
  searchEngineLabel: string
  onSubmitInput: (address: string) => boolean
  onOpenExternal?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<string | null>(null)

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(null)
  }, [props.pageUrl])

  useEffect(() => {
    if (props.focusRequest === 0) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [props.focusRequest])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const address = draft ?? addressFor(props.pageUrl)
    if (address.trim() === "" || !props.onSubmitInput(address)) return
    setDraft(null)
    inputRef.current?.blur()
  }

  function revertOnEscape(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape" || draft === null) return
    event.preventDefault()
    event.stopPropagation()
    setDraft(null)
    requestAnimationFrame(() => inputRef.current?.select())
  }

  return (
    <form className="group/address relative flex min-w-0 flex-1 items-center" onSubmit={submit}>
      <Input
        ref={inputRef}
        aria-label={`Search with ${props.searchEngineLabel} or enter an address`}
        placeholder={`Search with ${props.searchEngineLabel} or enter URL`}
        value={draft ?? addressFor(props.pageUrl)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn(
          "h-7 min-w-0 flex-1 rounded-md bg-surface-base px-3 text-sm shadow-none",
          props.onOpenExternal && "pr-8",
        )}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={revertOnEscape}
      />
      {props.onOpenExternal ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={OPEN_EXTERNAL_LABEL}
          title={OPEN_EXTERNAL_LABEL}
          className="absolute right-1 opacity-0 focus-visible:opacity-100 group-hover/address:opacity-100"
          onClick={props.onOpenExternal}
        >
          <ExternalLinkIcon className="size-3.5" />
        </Button>
      ) : null}
    </form>
  )
}
