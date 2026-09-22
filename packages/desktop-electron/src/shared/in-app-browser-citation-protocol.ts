import type { CitationTextSelector } from "@buddy/citation-contract"

export const IN_APP_BROWSER_CITATION_SELECTION_CHANNEL = "inapp-browser-citation-selection" as const
export const IN_APP_BROWSER_CITATION_COMMAND_CHANNEL = "inapp-browser-citation-command" as const
export const IN_APP_BROWSER_CITATION_REPLY_CHANNEL = "inapp-browser-citation-reply" as const
export const IN_APP_BROWSER_CITATION_MARK_CHANNEL = "inapp-browser-citation-mark" as const

export const IN_APP_BROWSER_CITATION_REVEAL_HIGHLIGHT = "buddy-citation-target" as const
export const IN_APP_BROWSER_CITATION_MARK_HIGHLIGHT = "buddy-citation-comment" as const
export const IN_APP_BROWSER_CITATION_REVEAL_WAIT_MS = 5_000

export const IN_APP_BROWSER_CITATION_HIGHLIGHT_CSS = `::highlight(${IN_APP_BROWSER_CITATION_REVEAL_HIGHLIGHT}), ::highlight(${IN_APP_BROWSER_CITATION_MARK_HIGHLIGHT}) { background-color: rgb(59 130 246 / 0.35); }`

export type InAppBrowserGuestCitationCommand =
  | { readonly type: "capture" }
  | {
      readonly type: "mark"
      readonly markID: string
      readonly excerpt: string
      readonly selector: CitationTextSelector
    }
  | { readonly type: "unmark"; readonly markID: string }
  | {
      readonly type: "reveal"
      readonly excerpt: string
      readonly selector: CitationTextSelector
    }

export type InAppBrowserGuestCitationRequest = {
  readonly requestID: number
  readonly command: InAppBrowserGuestCitationCommand
}
