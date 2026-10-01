import { useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@buddy/ui"
import type { SessionInfo } from "@/state/chat-types"
import { rightWorkspaceOpenSettled } from "@/components/directory-chat/right-workspace-open"
import {
  BenchSearchField,
  BenchSearchRecents,
  BenchSearchResults,
  benchSearchHasRecents,
  useBenchSearch,
  type BenchSearchActions,
} from "./bench-search"

type BenchQuickOpenProps = BenchSearchActions & {
  directory: string
  sessions: readonly SessionInfo[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Mod+P: the New tab page's search in a dialog over whatever the Bench shows. A pick opens in a
 * new tab, or runs its command, and closes the dialog.
 */
export function BenchQuickOpen(props: BenchQuickOpenProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        data-component="bench-quick-open"
        className="top-1/4 max-w-lg translate-y-0 gap-0 overflow-hidden p-2"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Quick open</DialogTitle>
          <DialogDescription>Search this notebook or run a command</DialogDescription>
        </DialogHeader>
        <BenchQuickOpenSearch {...props} />
      </DialogContent>
    </Dialog>
  )
}

/** Mounted only while the dialog is open, so each open starts from an empty field. */
function BenchQuickOpenSearch(props: BenchQuickOpenProps) {
  // Closing the dialog cancels a pick still resolving (a PDF waiting on the catalog, say), so it
  // neither opens late nor closes a dialog reopened since.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  function close() {
    if (mounted.current) props.onOpenChange(false)
  }
  const search = useBenchSearch({
    directory: props.directory,
    sessions: props.sessions,
    onOpen: async (request) => {
      if (!mounted.current) return "blocked"
      const outcome = await props.onOpen(request)
      if (rightWorkspaceOpenSettled(outcome)) close()
      return outcome
    },
    onOpenThread: (sessionID) => {
      close()
      return props.onOpenThread(sessionID)
    },
    onNewBoard: () => {
      close()
      props.onNewBoard()
    },
    onNewNote: () => {
      close()
      props.onNewNote()
    },
    onOpenDrawer: (drawer) => {
      close()
      props.onOpenDrawer(drawer)
    },
  })
  return (
    <>
      <BenchSearchField search={search} autoFocus />
      <div className="max-h-[min(60vh,420px)] overflow-y-auto">
        {search.hasQuery ? (
          <BenchSearchResults search={search} />
        ) : benchSearchHasRecents(search) ? (
          <BenchSearchRecents search={search} className="mt-3" />
        ) : (
          <p className="px-2 py-4 text-center text-xs text-text-weaker">
            Type to search chats, files, notes, and more
          </p>
        )}
      </div>
    </>
  )
}
