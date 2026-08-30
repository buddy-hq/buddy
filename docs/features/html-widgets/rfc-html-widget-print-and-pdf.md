# RFC: Print and PDF Export for HTML Widgets

Status: Proposed
Scope: Print-to-PDF and file export for sandboxed HTML widgets.

## Problem

Widgets containing print or download buttons fail because the hosting iframe uses `sandbox="allow-scripts"` and `Content-Security-Policy: sandbox allow-scripts; ...`:
1. `window.print()` is blocked because `allow-modals` is absent.
2. Cross-origin DOM inspection is blocked because `allow-same-origin` is omitted (opaque origin `"null"`).
3. The widget cannot access the host's Electron PDF bridge (`window.api.exportMarkdownPdf`).
4. Naive serialization (`outerHTML`) drops user-entered form state (worksheet answers).

## Three Iframe Sites

The widget runtime mounts across three distinct sites:
1. `HtmlWidgetInlineFrame` in chat transcript.
2. `HtmlWidgetBenchFrame` (inline mode container).
3. Bare `<iframe sandbox="allow-scripts">` in the Bench route (`$directory._bench.objects.$kind.$objectID.tsx`).

Any message listener or sandbox modification must cover all three sites or use a shared hook.

## Chosen Approach

### 1. PDF Export: Host-Pull (Option C, Recommended)
- **Trigger**: Host-owned "Export PDF" button in the Bench toolbar (user gesture on host).
- **Protocol**:
  1. Host sends `buddy/export-pull-request` (`requestId`, `kind: "pdf"`) via `iframe.contentWindow.postMessage(msg, "null")`.
  2. Injected widget prelude bakes form state into DOM attributes (`value`, `checked`, `selected`).
  3. Prelude serializes `document.documentElement.outerHTML` and returns `buddy/export-pull-response` with `html`.
  4. Host validates HTML, inlines relative assets, and calls `window.api.exportMarkdownPdf`.

### 2. File Download: Widget-Initiated (Option B)
- Widget calls `window.Buddy.exportWidget({ kind: "download", filename, payload })`.
- Prelude sends typed `postMessage` to host with target origin read from `location.hash` (`#hostOrigin=...`).
- Host validates payload schema, checks iframe identity, and invokes native `showSaveDialog` (Electron) or browser download (web).

## Goals and Non-Goals

Goals:

- preserve the widget's live DOM state, including typed worksheet answers, in a user-approved PDF;
- keep the visible widget's `sandbox="allow-scripts"`, opaque origin, and current CSP boundary;
- make Electron use a native save dialog and let web use browser print/download behavior;
- keep all writes user-mediated and make the same protocol safe when a widget is open in chat and Bench.

Non-goals:

- silent writes or arbitrary filesystem paths;
- access to third-party services, user files, or a host-side privilege bridge from the widget;
- replacing chat Markdown's existing `exportMarkdownPdf` flow;
- weakening CSP to enable remote scripts, styles, or downloads.

## Implementation Constraints

- The runtime document is served by `/api/objects/html-widget/runtime/:directoryToken/:objectID/:versionToken/:assetPath{.+}`. Prelude injection must be gated on the document response (`runtime.isDocument`); binary assets must stream unchanged.
- The source cap is 1 MB. A document may be buffered for injection, but a separate versioned prelude script is preferable so a bridge security fix does not require re-versioning every widget.
- The widget origin is opaque (`"null"`). Widget → host messages use a concrete `targetOrigin` supplied in `#hostOrigin`; host → widget uses `postMessage(..., "null")`.
- `outerHTML` omits input/textarea IDL state. Before serialization, copy `input.value`, checkbox/radio `checked`, `textarea.value` text, and each option's `selected` state into attributes/text nodes.
- Relative `<img>`, `<link>`, and `<script>` references resolve against the object runtime, not a temporary `file://` PDF directory. The host must inline them as data URIs or rewrite them to reachable local-server URLs before `printToPDF`.
- Reuse the print-ready wait for `document.fonts.ready`, all images, and two animation frames before capture.

## Proposed Wire Contract

The host issues a UUID `requestId`; the widget echoes it. Use separate strict schemas rather
than a loose optional payload:

```ts
type DownloadRequest = {
  type: "buddy/export-request"
  requestId: string // UUID
  kind: "download"
  filename: string // basename only, no controls or path separators
  payload: {
    mimeType: "application/pdf" | "text/plain" | "text/csv" | "application/json" | "image/png" | "image/jpeg"
    dataBase64: string // at most ~6.7M chars, ≈5 MB decoded
  }
}

type PdfPullRequest = {
  type: "buddy/export-pull-request"
  requestId: string // UUID
  kind: "pdf"
}

type PdfPullResponse = {
  type: "buddy/export-pull-response"
  requestId: string
  html: string // at most 2 MB
}

type ExportAck = {
  type: "buddy/export-ack"
  requestId: string
  status: "ok" | "cancelled" | "error"
  message?: string
}
```

`image/svg+xml`, executable types, path separators, and control characters are intentionally
excluded. The host validates before decoding or rendering; `window.Buddy` is convenience API,
not a security boundary.

## Security Mitigations

- **Confused-Deputy Prevention**: Host verifies `event.source === iframeRef.current?.contentWindow` and rejects null or untracked sources.
- **Opaque Origin Validation**: Host enforces `event.origin === "null"` as secondary check.
- **Target Origin**: Host appends `#hostOrigin=<encoded>` to `iframe.src`; prelude uses it as `targetOrigin` instead of wildcard `*`.
- **Path Traversal & Silent Writes**: Filenames sanitized to basename; save operations always require user save dialog or browser download UI.
- **Payload Limits**: Base64 downloads capped at 5 MB (~6.7M chars); HTML payload capped at 2 MB.
- **Host-Side Authority**: `window.Buddy` is a convenience wrapper; all security checks reside on the host.
- **Instance Binding**: Track in-flight requests by the concrete iframe instance, not only
  `objectID`; the same object may be open in chat and Bench at once. Reject replayed IDs and
  cancel pending PDF work when that iframe is reloaded or destroyed.
- **Existing Network Boundary**: `connect-src 'self'` permits uncredentialed same-origin fetches
  from the opaque widget. This RFC does not widen that pre-existing surface; download MIME
  allowlists and host validation still apply.

## Trade-Offs and Open Questions

- Option A (`allow-modals`) is rejected for the visible iframe because it broadens every widget's
  sandbox and still does not provide an app-branded save flow. A hidden host-side iframe may need
  it for web print fallback.
- Re-fetching the runtime URL or server-side rendering loses live form state; host-pull is chosen
  because the widget serializes its own DOM.
- PDF host-pull is Bench-only in the first cut; chat-inline export would need the higher-risk
  widget-initiated path. Asset inlining versus URL rewriting remains an implementation choice.
- Open questions: clipboard export, reduced-motion print delay, chat-inline PDF toolbar, and
  whether repeated/reloaded exports retain browser user activation.

## Proposed Rollout and Verification

1. Ship host-pull PDF on the Electron Bench surface behind `BUDDY_HTML_WIDGET_EXPORT`.
2. Ship widget-initiated download on Electron and web.
3. Add the web PDF fallback using a hidden host-side print frame, never the visible sandbox.

Tests must cover strict schema rejection (foreign source/origin, replay, path traversal, bad MIME,
and oversize payloads), form-state baking, relative asset capture, Electron save-dialog/IPC,
host-pull PDF, web fallback, simultaneous chat/Bench instances, reload cancellation, and an E2E
worksheet whose saved PDF contains typed answers. These are proposed gates, not claims that export
is already shipped.
