# RFC: Print and PDF export for HTML widgets

Status: Proposed (rev. 2 — incorporates review feedback)
Author: Prashant
Reviewers: TBD
Target release: TBD
Related code:

- `packages/buddy/src/learning/features/html-widgets/service/types.ts`
  (`HTML_WIDGET_RUNTIME_CSP`, which includes a `sandbox allow-scripts`
  CSP directive in addition to the iframe attribute)
- `packages/buddy/src/routes/object-html-widget.ts` (runtime route, CSP
  header gated on `runtime.isDocument`, immutable version tokens,
  `new Response(Bun.file(...))` streaming)
- `packages/web/src/components/chat/tools/render/html-widget/index.tsx`
  (`HtmlWidgetInlineFrame` at `:209` with `sandbox="allow-scripts"` at
  `:243`; `HtmlWidgetBenchFrame` at `:272` — note: not the iframe used
  on the Bench surface)
- `packages/web/src/routes/$directory._bench.objects.$kind.$objectID.tsx`
  (the **third** iframe site — a bare `<iframe sandbox="allow-scripts">`
  at `:726` used by the Bench surface, not `HtmlWidgetBenchFrame`)
- `packages/desktop-electron/src/main/markdown-pdf.ts` and
  `packages/desktop-electron/src/preload/index.ts` (`:131`) / `types.ts`
  (`:91`) (existing `printToPDF` IPC channel `export-markdown-pdf`,
  `MarkdownPdfExportInput = { html, defaultPath }`)
- `packages/desktop-electron/src/main/ipc.ts` (`:98` — IPC handler;
  `:174` — `save-file-picker` handler)
- `packages/web/src/components/chat/tools/render/mermaid/mermaid-action-bar.tsx`
  (`:132` — existing client-side download via `URL.createObjectURL` +
  `<a download>`, **no** save dialog)

> **Three iframe sites.** The widget runtime is mounted in three places:
> (1) `HtmlWidgetInlineFrame` in chat, (2) `HtmlWidgetBenchFrame` (defined
> but only reached via `HtmlWidgetFrame` with `mode="inline"`), and
> (3) the bare `<iframe>` in the Bench route file. Any change to sandbox
> tokens or message listeners must cover all three, or factor a shared
> hook.

## Problem

When a widget author writes a "Print / Save PDF" button inside an HTML
widget and the user clicks it, nothing happens. The widget's own DOM has a
`<button onclick="window.print()">` (or a download flow), but the iframe
that hosts the widget is loaded with `sandbox="allow-scripts"`. That
sandbox token set intentionally excludes:

- `allow-same-origin` — so the widget cannot reach the parent's APIs or
  storage, and so a navigation cannot escape the sandbox. **This also
  means the host cannot read the widget's DOM** (cross-origin DOM access
  is blocked), which has major implications for the PDF path (see
  " widgetHtml sourcing").
- `allow-modals` — so `window.print()` cannot block with a native dialog.
- `allow-popups` / `allow-popups-to-escape-sandbox` — so the widget cannot
  open a new window.

The same `sandbox="allow-scripts"` appears in the CSP header itself
(`HTML_WIDGET_RUNTIME_CSP` includes `"sandbox allow-scripts"` at
`types.ts:9`), so any sandbox token change must update **both** the
iframe attribute and the CSP directive or they conflict.

Combined with the runtime's `Content-Security-Policy` of
`default-src 'none'; … connect-src 'self'; …`, the widget:

1. cannot call `window.print()` (no `allow-modals`),
2. cannot reach a download endpoint,
3. cannot postMessage the host (the host has no `message` listener on the
   widget iframe), and
4. cannot invoke the existing `window.api.exportMarkdownPdf` Electron
   bridge (it lives on the host window, which the widget cannot see).

> **Note on `connect-src 'self'`.** The widget *does* have same-origin
> network access to the buddy server (`connect-src 'self'` at
> `types.ts:14`). It can `fetch('/api/...')` uncredentialed (the
> opaque-origin iframe has no cookie jar). This is a real exfil surface,
> not "no network access" — see Security §4.

The only existing precedent for "print this thing to PDF" is
`packages/desktop-electron/src/main/markdown-pdf.ts`, which renders the
HTML into a hidden `BrowserWindow` (sandboxed, no node integration,
context isolation) and calls `webContents.printToPDF`, saving through
`dialog.showSaveDialog`. That path is reachable from the host renderer,
not from inside the widget.

This blocks a class of legitimate teaching widgets (worksheets, study
guides, printable flashcards) where the expected interaction is "fill in
the blanks, then save a PDF."

## Goals

- A widget author can call a small, well-defined API from inside the
  widget to request "print this widget to PDF" or "download this widget
  as a file."
- The user always sees a native save dialog (Electron) or a browser
  download/print dialog (web) and picks the destination. No silent writes.
- The sandbox, CSP, and version-token model of the widget runtime stay
  intact. The widget continues to be unable to read the parent, navigate
  the top frame, or exfiltrate data beyond what `connect-src 'self'`
  already permits.
- The same flow works in the web build (where there is no Electron) by
  falling back to the browser's print/download mechanisms.
- **The widget's live DOM state — including user-typed form input —
  survives into the saved PDF.** This is the primary use case
  (worksheet answers) and must be verified by tests.

## Non-goals

- Letting widgets save to arbitrary paths without a user dialog.
- Letting widgets trigger downloads of *external* resources, contact
  third-party services, or read user files.
- Replacing the existing `exportMarkdownPdf` flow for chat-side markdown
  rendering.
- Letting widgets bypass CSP to load remote scripts or styles.
- Blocking the widget's existing `connect-src 'self'` fetch capability
  (out of scope; that is the current policy and this RFC does not
  change it).

## Proposal

Three options; recommend a hybrid of B (for `download`) and C (for `pdf`).

### Option A — Add a sandbox token

Change every widget `<iframe>` from
`sandbox="allow-scripts"` to
`sandbox="allow-scripts allow-modals"`, **and** update the `sandbox`
directive inside `HTML_WIDGET_RUNTIME_CSP` to match
(`"sandbox allow-scripts allow-modals"`). Both must change together or
the CSP and iframe attribute conflict.

- Pros: small change. `window.print()` works inside the iframe.
- Cons: any widget can now pop native dialogs at will. This conflicts
  with the sandbox policy that exists specifically to limit blast
  radius. It also does not give the user a "Save as PDF" path that
  picks a destination — it triggers the print dialog, which is fine for
  a printer but awkward for "save to disk." It does not solve the
  form-state or asset-URL problems either.

### Option B — Widget-initiated host bridge via typed postMessage *(for `download`)*

Keep `sandbox="allow-scripts"`. Add a typed message channel between the
widget iframe and the host renderer. The host owns the save dialog and
the `printToPDF` IPC. The widget initiates by sending a validated
request; the host mediates.

This option is recommended for the `download` kind (widget wants to save
a blob it generated). For `pdf`, see Option C, which is strictly safer.

Wire shape:

1. **Inside the widget, the author writes:**

   ```html
   <script>
     // Buddy widget bridge — injected by the host before user code runs.
     // The author can call it but cannot rely on it as a security
     // boundary: the widget can also call parent.postMessage directly.
     document.getElementById("save").onclick = () => {
       window.Buddy.exportWidget({
         kind: "download",
         filename: "my-answers.json",
         payload: { mimeType: "application/json", dataBase64: "..." },
       })
     }
   </script>
   ```

2. **The host injects a prelude into the runtime document** (gated on
   `runtime.isDocument`, see "Injection mechanism") that defines
   `window.Buddy` and forwards calls to the host via `postMessage` with
   a concrete `targetOrigin` (see "Origin and targetOrigin").

3. **The host renderer listens for `message` events**, validates origin
   and source (see Security §1–2), validates the payload against a Zod
   schema, and dispatches:
   - `kind: "download"` (Electron) → host calls `dialog.showSaveDialog`,
     then writes the decoded bytes to the chosen `filePath` via a new
     IPC (`save-widget-export`). Mirrors `exportMarkdownPdf`'s use of
     `dialog.showSaveDialog` at `markdown-pdf.ts:25`.
   - `kind: "download"` (web) → host calls `URL.createObjectURL` +
     `<a download>` (the same pattern as `mermaid-action-bar.tsx:137`).
     No save dialog; the browser handles it.

### Option C — Host-owned toolbar export button *(for `pdf`, recommended)*

Add an "Export PDF" button to the Bench toolbar
(`HtmlWidgetObjectBenchView` already builds an `actions` array at
`:664`). The host **initiates** the export on its own user gesture,
inverting trust: the host asks the widget for its serialized DOM, the
widget responds, the host renders via `printToPDF`.

- Pros: eliminates confused-deputy, replay, rate-limit, and
  `targetOrigin` concerns for the PDF path in one stroke. The host
  controls the trigger, the filename, and the render window. The widget
  only contributes its own DOM snapshot.
- Cons: only available on the Bench surface (not chat-inline), so the
  inline PDF case still needs Option B or a chat toolbar button.
- This is the natural UX for "save this worksheet as PDF" and matches
  the existing Reload/Copy-source toolbar actions.

Wire shape (host-pull):

1. User clicks "Export PDF" in the Bench toolbar.
2. Host sends `buddy/export-request` `{ kind: "pdf", requestId }` **into**
   the iframe via `iframe.contentWindow.postMessage(msg, "null")`
   (`"null"` because the widget's origin is opaque).
3. The prelude in the widget bakes form state (see "Form-state baking"),
   serializes `document.documentElement.outerHTML`, and replies with
   `buddy/export-response` `{ requestId, html }`.
4. Host validates `html`, inlines assets (see "Asset inlining"), and
   calls `window.api.exportMarkdownPdf({ html, defaultPath })`.

> **Why not host-pull for `download` too?** The `download` kind exists
> for widgets that generate a blob programmatically (e.g., export a
> JSON of quiz answers). A toolbar button cannot know what the widget
> wants to save. So `download` stays widget-initiated (Option B).

### Recommendation

- **`pdf`** → Option C (host-owned toolbar button, host-pull). Strictly
  safer. Falls back to Option B only if a chat-inline PDF export is
  needed later.
- **`download`** → Option B (widget-initiated, host-mediated).

### Injection mechanism

The runtime document is served from
`/api/objects/html-widget/runtime/:directoryToken/:objectID/:versionToken/:assetPath{.+}`
(`object-html-widget.ts:105`). The route streams source bytes via
`new Response(Bun.file(runtime.filePath), …)` (`:142`).

To inject the prelude:

- **Gate on `runtime.isDocument`** (`:145`), the same condition that
  gates the CSP header. Binary assets (images, fonts, JS) served by the
  same route must not be mutated.
- **Buffer the document into memory** (documents are small; the
  `MAX_HTML_WIDGET_SOURCE_BYTES` cap is 1 MB at `types.ts:5`), inject
  the prelude into `<head>`, and serve the mutated bytes. Streaming is
  lost for documents only; assets still stream.
- **Immutable-cache implication:** the prelude is baked into the
  versioned document, which is cached with
  `cache-control: immutable` (`:53`). A prelude security fix requires
  re-versioning every widget. Consider injecting the prelude via a
  separate versioned `<script src="/api/.../prelude.js">` instead, so
  the prelude can be updated without re-versioning widget content. This
  is an implementation decision; the RFC permits either.
- **The prelude inlines its own minimal validator.** It runs in the
  sandboxed iframe with no bundler access to `packages/buddy`. The host
  re-validates with the shared Zod schema. The prelude's validator is a
  first-line shape check, not a security boundary.

### Origin and targetOrigin

The widget iframe is sandboxed without `allow-same-origin`, so its
origin is **opaque** and serializes to the string `"null"`.

- **Widget → host:** the prelude calls
  `parent.postMessage(msg, targetOrigin)`. The prelude cannot read
  `parent.origin` cross-origin. The host must pass its origin into the
  widget via the runtime URL: append `#hostOrigin=<encodeURIComponent(hostOrigin)>`
  to the `iframe.src` before setting it. The prelude reads
  `location.hash` and uses it as `targetOrigin`. Without this, the
  prelude falls back to `postMessage(msg, "*")`, which leaks export
  requests to any framing ancestor in a clickjacking/embedding attack.
- **Host → widget** (Option C): the host calls
  `iframe.contentWindow.postMessage(msg, "null")` — `"null"` is the
  widget's opaque origin.

### Form-state baking

`document.documentElement.outerHTML` does **not** capture form-field
values: the `value` IDL property of `<input>`/`<textarea>` is not
reflected into the `value` content attribute. A naive serialization
drops user-typed answers — breaking the primary worksheet use case.

The prelude must "bake" form state before serializing:

```js
function bakeFormState() {
  for (const el of document.querySelectorAll("input, textarea, select")) {
    if (el instanceof HTMLInputElement) {
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) el.setAttribute("checked", "");
        else el.removeAttribute("checked");
      } else {
        el.setAttribute("value", el.value);
      }
    } else if (el instanceof HTMLTextAreaElement) {
      el.textContent = el.value;
    } else if (el instanceof HTMLSelectElement) {
      for (const opt of el.options) {
        if (opt.selected) opt.setAttribute("selected", "");
        else opt.removeAttribute("selected");
      }
    }
  }
}
```

This runs in the widget's prelude before `outerHTML` is captured. Tests
must verify a worksheet with typed answers produces a PDF containing
those answers.

### Asset inlining for printToPDF

`markdown-pdf.ts:32-48` writes `input.html` to a temp dir and
`loadFile`s it from `file://`. The widget's relative `<link href>`,
`<img src>`, `<script src>` resolve against
`/api/objects/html-widget/runtime/.../` and will 404 from the temp dir.

Before calling `exportMarkdownPdf`, the host must either:

- inline assets as `data:` URIs (fetch each relative URL via the buddy
  server, base64-encode, replace the `src`/`href`), or
- rewrite relative URLs to absolute `http://localhost:<port>/api/...`
  URLs (the hidden `BrowserWindow` can reach the local server).

Inlining is safer (no network dependency during render) but heavier.
Rewriting is lighter but requires the server to be running during PDF
render. Implementation choice; the RFC permits either.

### Pre-rendering for PDF

`printToPDF` needs the widget to be fully laid out. The existing
`MARKDOWN_PDF_RENDER_READY_SCRIPT` in `markdown-pdf.ts:6-19` already
does the right thing: wait for `document.fonts.ready`, every `<img>` to
load, and two `requestAnimationFrame` ticks. Reuse it by extracting it
to a shared constant in `packages/desktop-electron/src/main/print-ready.ts`
and importing it from both `markdown-pdf.ts` and the new
`html-widget-pdf.ts`.

### Wire schema (shared, lives in `packages/buddy`)

```ts
// packages/buddy/src/learning/features/html-widgets/service/export-schema.ts
import z from "zod"

const filenameRegex = /^[^\/\\\x00-\x1F]+$/

const baseFields = {
  type: z.literal("buddy/export-request"),
  requestId: z.string().uuid(),
  filename: z.string().min(1).max(120).regex(filenameRegex, "no path separators or control chars"),
}

// Widget → host (Option B, download only)
export const BuddyExportDownloadSchema = z.object({
  ...baseFields,
  kind: z.literal("download"),
  payload: z.object({
    mimeType: z.enum([
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/json",
      "image/png",
      "image/jpeg",
    ]),
    // ~33% base64 overhead; 5 MB decoded ≈ 6.7e6 chars
    dataBase64: z.string().min(1).max(6_700_000),
  }),
})

// Host → widget (Option C, PDF request)
export const BuddyExportPullRequestSchema = z.object({
  type: z.literal("buddy/export-pull-request"),
  requestId: z.string().uuid(),
  kind: z.literal("pdf"),
})

// Widget → host (Option C, PDF response with serialized DOM)
export const BuddyExportPullResponseSchema = z.object({
  type: z.literal("buddy/export-pull-response"),
  requestId: z.string().uuid(),
  html: z.string().min(1).max(2_000_000),
})

export const BuddyExportAckSchema = z.object({
  type: z.literal("buddy/export-ack"),
  requestId: z.string().uuid(),
  status: z.enum(["ok", "cancelled", "error"]),
  message: z.string().optional(),
})
```

Notes:
- `requestId` is **host-issued UUID** (generated when the host creates
  the request — whether toolbar click for Option C or when relaying a
  widget-initiated download for Option B). The widget echoes it back.
  This makes dedup meaningful.
- `mimeType` is a strict enum allowlist. `image/svg+xml` is excluded
  (SVG carries `<script>` and executes when opened in a browser).
- `filename` forbids path separators and control chars at the schema
  level (defense-in-depth, not only host-side sanitization).
- `dataBase64` has a `.max()` that implements Security §3's 5 MB cap.
- `html` (Option C response) is capped at 2 MB to bound render memory.
- No `payload` field on the `pdf` variant — the schema uses separate
  schemas per kind instead of a loose optional.

## Security considerations and required mitigations

> **This section is blocking.** The following risks must be addressed in
> the implementation before the feature is enabled for users. The bridge
> crosses a sandbox boundary, so it must be treated as a privileged IPC
> surface even though the widget itself remains unprivileged.

### 1. Confused-deputy / spoofed `postMessage` source (HIGH)

Any `window` can receive `message` events. The host must reject any
export request whose `event.source` is not the exact `contentWindow` of
the widget iframe it is managing.

**Required mitigation:** check
`event.source === iframeRef.current?.contentWindow` before dispatching.
Explicitly reject `event.source == null` (transferred/closed window).
Bind each listener to a single iframe instance. Key the export bridge by
**iframe instance (ref)**, not `objectID` — the same widget can be open
in chat and on Bench simultaneously.

### 2. `event.origin` validation (HIGH)

Because the iframe is sandboxed without `allow-same-origin`, its origin
is opaque and `event.origin` serializes to the string `"null"`.

**Required mitigation:** require `event.origin === "null"` as
defense-in-depth, **and document that the origin is `"null"`** so an
implementer doesn't write naïve `event.origin !== window.origin` logic
that would reject 100% of widget messages. `event.source` is the primary
discriminator; `event.origin === "null"` is the secondary check.

### 3. `targetOrigin` for widget → host postMessage (HIGH)

The prelude cannot read `parent.origin` cross-origin. Without a concrete
mechanism, the implementer falls back to `postMessage(msg, "*")`, which
leaks export requests to any framing ancestor.

**Required mitigation:** the host appends
`#hostOrigin=<encodeURIComponent(hostOrigin)>` to the runtime URL before
setting `iframe.src`. The prelude reads `location.hash` and uses it as
`targetOrigin`. For host → widget (Option C), the host uses
`postMessage(msg, "null")`.

### 4. Network access is not "none" (HIGH)

`connect-src 'self'` (`types.ts:14`) permits `fetch('/api/...')` to the
buddy server, uncredentialed. A compromised widget can probe the server.

**Required mitigation:** this RFC does not change the CSP. Document that
the widget has same-origin fetch. The host should consider whether export
requests from a widget that has issued fetches to sensitive endpoints
warrant extra gating. This is a pre-existing condition, not introduced
by this RFC.

### 5. Trust boundary is host-side validation, not the bridge object (HIGH)

The prelude defines `window.Buddy`, but the widget author controls the
widget HTML and can reassign `window.Buddy` after the prelude runs. More
fundamentally, `sandbox="allow-scripts"` does **not** block
`parent.postMessage(...)` — the widget can call it directly at any time.

**Required mitigation:** state explicitly in the implementation that
`window.Buddy` is a convenience, not a security control. All security
comes from host-side validation (§1–2). Do not rely on bridge integrity.

### 6. Path traversal and unattended writes (MEDIUM)

A widget could send a malicious filename.

**Required mitigation:** sanitize `filename` to its basename; the schema
already forbids path separators and control chars. The host treats
`filename` only as a suggestion for `dialog.showSaveDialog`. Write only
to the path returned by the dialog. No silent writes, ever.

### 7. Memory DoS from oversized payloads (MEDIUM)

**Required mitigation:** `dataBase64` is capped at ~6.7e6 chars
(~5 MB decoded) at the schema level. `html` is capped at 2 MB. Reject
oversized messages before `atob()` or render.

### 8. Clickjacking and deceptive export triggers (MEDIUM)

A widget could label its export button "Free download" while saving a
file with a misleading filename.

**Required mitigation:** the host must always show a save dialog
(Electron) or use the browser's download UI (web). The filename must be
visible and editable. No silent writes. For Option C, the trigger is a
host-owned toolbar button — the widget cannot initiate a PDF export at
all, eliminating this risk for the PDF path.

### 9. XSS inside the widget abusing the bridge (MEDIUM)

If a widget accepts user input and is vulnerable to XSS, an attacker
can call `parent.postMessage(...)` directly.

**Required mitigation:** widget authors must follow normal XSS hygiene.
The host can reduce blast radius by requiring a recent user gesture for
widget-initiated requests (Option B). This RFC should be accompanied by
documentation warning authors not to render untrusted HTML inside
exportable widgets.

### 10. Data exfiltration via download payload (MEDIUM)

A widget could ask to "download" a blob containing data it read from its
own DOM or fetched via `connect-src 'self'`.

**Required mitigation:** keep the CSP strict; the `mimeType` allowlist
excludes executable/HTML/SVG types. Warn users that a saved file is no
longer sandboxed.

### 11. User-activation transfer on the web path (MEDIUM)

The click fires in the iframe; the host receives the message
asynchronously and then calls `<a download>.click()` /
`iframe.contentWindow.print()` in the host document. Cross-document
user activation may not transfer, so browsers may block the programmatic
download.

**Required mitigation for `print()` on web:**
`iframe.contentWindow.print()` executes in the iframe's realm, where
`sandbox` without `allow-modals` likely blocks the print dialog. The
web fallback for PDF must use an alternative: load the widget's
serialized HTML into a **hidden host-side non-sandboxed iframe** (or
`allow-modals`-sandboxed) and call `print()` there. Keep the visible
widget iframe's sandbox intact.

**Required mitigation for `download` on web:** confirm empirically
whether `<a download>.click()` from the host (after a postMessage from
the iframe) preserves user activation. If not, the widget must call
`<a download>` directly inside the iframe (which works because
`allow-downloads` is implied by `allow-scripts` in modern browsers).

### 12. Replay / repeated requests (LOW)

**Required mitigation:** `requestId` is host-issued UUID. The host
tracks in-flight `requestId`s per iframe instance and ignores
duplicates. Clean up on iframe remount (`reloadKey` bump) and object
deletion. Cancel pending `printToPDF` if the iframe is destroyed mid-render.

### 13. Prelude baked into immutable cache (LOW)

Injecting the prelude into the document body means it's cached with the
immutable version token. A prelude security fix requires re-versioning
every widget.

**Required mitigation:** prefer injecting the prelude via a separate
versioned `<script src>` so the prelude can be updated independently.
If inlined, document the re-versioning requirement.

## Drawbacks

- Any new host↔widget channel is a new attack surface. The risks above
  are real and must be implemented before merge; they are not optional
  hardening.
- Option C (host-pull for PDF) is only available on the Bench surface,
  not chat-inline. A chat-inline PDF export would need Option B for
  `pdf` too, reintroducing the widget-initiated trust model.
- The web build's PDF path requires a hidden host-side iframe, which is
  more complex than the Electron path.
- Form-state baking and asset inlining add non-trivial prelude logic.
- Two code paths to maintain (Electron / web). The web path is heavier
  than originally estimated.

## Alternatives considered

1. **`allow-modals` on the iframe sandbox (Option A).** Rejected as
   primary — broadens the sandbox to every widget and any author can
   pop a native dialog at will. Also requires updating the `sandbox`
   directive in `HTML_WIDGET_RUNTIME_CSP`, not just the iframe attribute.
   May still be needed for the web `print()` fallback inside a hidden
   iframe (Security §11), but not on the visible widget iframe.
2. **Render the widget into a hidden `BrowserWindow` and `printToPDF`
   that (without widget cooperation).** Rejected for the PDF path
   because the host cannot read the cross-origin sandboxed iframe DOM.
   The widget must serialize and send its DOM (Option C) or the host
   must re-fetch the runtime URL (which loses live state and form
   input — the primary use case).
3. **Server-side rendering via `Bun.html`.** Rejected — the widget may
   have user-typed state (worksheet answers) that lives in the DOM and
   would be lost. Option C captures live DOM state *because the widget
   serializes it*, not because the host reads it for free.
4. **Let the widget call `window.print()` directly inside the iframe.**
   Already addressed — the sandbox token set blocks the dialog. Even if
   we added `allow-modals`, the user would land in the browser print
   dialog with no app-branded "Save as PDF" flow.
5. **Host-owned toolbar button for *all* exports (not just PDF).**
   Considered and rejected for `download` — a toolbar button cannot
   know what blob the widget wants to save. `download` stays
   widget-initiated (Option B).

## Open questions

- Should the bridge support `kind: "clipboard"` (copy the rendered
  widget to the clipboard as PNG)? Out of scope for this RFC, but
  worth a follow-up.
- Should the prelude support `prefers-reduced-motion: reduce` to skip
  the print-ready delay when there are no animations? Probably yes.
  Defer to implementation.
- Should the chat-inline surface also get an "Export PDF" toolbar
  button (Option C), or is Bench-only sufficient for v1? Defer to UX.
- Asset inlining vs. URL rewriting for `printToPDF` — implementation
  decision; benchmark both.

## Rollout

- Phase 1: ship Option C (host-pull PDF) on the Bench surface in
  Electron only. Gate behind a feature flag (`BUDDY_HTML_WIDGET_EXPORT`).
- Phase 2: ship Option B (widget-initiated download) in Electron + web.
- Phase 3: ship the web PDF fallback (hidden host-side iframe).
- Phase 4: document the bridge in the html-widgets README and add a
  worked example (the consistency worksheet) in the test suite.
- Phase 5: document the policy in `docs/architecture/decisions/`.

## Testing

- **Unit:** schema parsing for all four schemas. Reject messages with
  missing fields, oversized payloads, foreign `event.source`,
  `event.origin !== "null"`, path-traversal filenames, disallowed MIME
  types.
- **Form-state baking:** render a worksheet widget with typed answers,
  trigger PDF export, assert the saved PDF contains the answers.
- **Asset inlining:** render a widget with `<img>` and `<link>`, trigger
  PDF export, assert no 404s in the render window and the PDF contains
  the images.
- **Integration (Electron):** drive a widget that calls the bridge
  (Option B download), assert the host invokes `save-widget-export` IPC
  with the right arguments and the file exists.
- **Integration (Option C):** click the Bench toolbar "Export PDF"
  button, assert the host receives the serialized DOM and
  `exportMarkdownPdf` is called.
- **Web fallback:** assert the host loads the serialized HTML into a
  hidden iframe and calls `print()` there, not on the visible widget
  iframe.
- **Multi-instance:** open the same widget in chat and on Bench
  simultaneously; trigger export from one; assert the other is
  unaffected (routing by iframe instance, not `objectID`).
- **Reload mid-render:** bump `reloadKey` during a pending `printToPDF`;
  assert the pending render is cancelled and no orphan file is written.
- **E2E:** add the consistency worksheet widget to the dogfood suite;
  fill in answers; save a PDF; verify the file exists, is non-empty, and
  contains the answers.

## Compatibility

- Widget authors who do not call the bridge see no change. The
  injection is silent and adds ~1–2 KB to the runtime document (or a
  versioned `<script src>` if that approach is chosen).
- Existing widgets that called `window.print()` continue to be
  suppressed; the migration path is to use Option C (toolbar button)
  or Option B (bridge).
- `exportMarkdownPdf` IPC contract is unchanged; this RFC adds a new
  caller for it. A new `save-widget-export` IPC is added for the
  Electron `download` path.
- The `sandbox` attribute and CSP on the **visible** widget iframe are
  unchanged. Only a hidden host-side iframe (web PDF fallback) may use
  `allow-modals`.
