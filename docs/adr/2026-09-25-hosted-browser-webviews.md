# Hosted Browser webviews across notebook navigation

## Context

`BenchSurfaceHost` keeps Browser tabs mounted while the user switches tabs or chats within one notebook. Leaving that notebook unmounts the route layout and its webviews. The durable workspace record intentionally omits Browser tabs, so returning from Settings could recreate only the tab named by the return URL, and that page reloaded.

## Decision

The app root owns Browser webviews in `HostedBrowserHost`, alongside the router. The routed Bench renders a measured `BrowserSurfaceSlot` and its toolbar and overlays. A lease identifies the current slot for each tab, so an old slot cannot move a webview after a new slot claims it. A page with no visible slot stays mounted offscreen; on macOS it remains paintable without `visibility: hidden`.

An app-level workbench store keeps the current notebook slot map while routes unmount. The notebook provider restores that in-memory map when it returns. It remains a mirror of the mounted provider's state, needed only to cross route unmounts; the provider continues to own tab transitions. The existing disk record still omits Browser tabs, so quitting Buddy ends these live pages. Existing file and reader targets also return from the in-memory map during the same app run.

Browser runtime, audio state, page controls, and visit recording follow the hosted page. The Bench toolbar and citation actions remain with the routed UI, where their notebook and chat context is available. The host keeps each tab's DOM key and render order stable; moving an Electron `<webview>` would reload its page. The Bench drawer clips the hosted page where it overlays the Bench, and the floating chat remains above the hosted page. Closing a notebook releases its hosted pages. Notes-directory invalidation updates both disk state and the in-memory mirror.

## Alternatives considered

- Saving Browser tab URLs to disk would restore tab labels and reload pages, but would lose the live guest session and page state.
- Keeping the full notebook route mounted would keep unrelated chat and Bench UI alive under every other screen and couple route transitions to hidden layout state.

## Limits

Live pages are retained until their tabs or notebook are closed, or the app exits. A cross-notebook page budget and restart restoration remain separate product decisions. No Electron IPC or profile partition behavior changes in this decision.
