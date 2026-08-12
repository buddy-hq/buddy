# Foliate integration gotchas

This document records the findings from the August 2026 reader incident in which an EPUB opened
blank, sometimes rendered unstyled OCR text, and appeared to fail on alternating Bench tab
activations. The same investigation exposed a second malformed-spine failure that persisted EPUB
highlights while silently painting them into no live overlay.

The goal is to make the next Foliate investigation evidence-driven. Read this together with
[`docs/commands/build-reader.md`](../../commands/build-reader.md). Buddy owns the product reader
surface; `foliate-js` is the EPUB engine behind `FoliateReader`.

## Executive summary

The blank-reader incident was not caused by a stale backend. Five independent behaviors interacted,
and the same investigation found a separate stale resource-preparation bug:

1. The affected Internet Archive EPUB incorrectly placed an empty `EPUB/nav.xhtml` in its linear
   spine. Foliate's default `goToTextStart()` fallback therefore treated a navigation document as
   readable content and displayed a blank page.
2. The persisted location was a malformed range CFI rooted in that navigation section. Foliate
   could derive a section index from it, but applying the range anchor later failed inside
   `epubcfi.js`. Falling back to `showTextStart` returned to the same empty navigation document.
3. Bench keeps inactive surfaces mounted. Foliate's own `ResizeObserver` callbacks measured a
   parked WebKit iframe, cached a zero-width text range, and rewrote the paginator to `0px`. The
   engine now exposes an explicit suspend/resume lifecycle; a parked book remains open while its
   measurement observers are disconnected.
4. The same EPUB referenced a missing manifest item from its package spine. `foliate-js` generated
   CFIs from that unfiltered spine but exposed a filtered `book.sections` array. The same CFI
   therefore identified section `3` in Buddy and resolved to native spine index `4` in Foliate.
   `View.addAnnotation()` looked for overlay `4`, found no matching live overlay, and returned
   without painting even though Buddy persisted the annotation successfully.
5. Resource preparation was fire-and-forget. A backend exit could persist `preparing` after its
   in-memory task disappeared. The next process never resumed it, so the UI polled forever. This
   did not blank the EPUB renderer, but it explained the apparently stale backend and repeated
   resource requests observed during the incident.

Clearing WebKit's native selection before annotation paint is still required to avoid selection and
SVG overlay compositing artifacts, but it was not the root cause of the EPUB marks that never
appeared. The root cause was the filtered-spine index split.

## Know which layer is failing

Do not label every empty reader an “EPUB issue” or a “backend issue.” Use the visible and runtime
evidence to identify the failing layer.

| Symptom | Most likely layer | First evidence to collect |
| --- | --- | --- |
| Reader chrome and location footer are present, but the paper is blank | Publication spine, saved location, or Foliate renderer | Current rendered section ID/text and saved CFI |
| OCR text renders but looks completely unstyled or full-width | Foliate iframe/style lifecycle | Rendered blob URL, iframe document styles, activation history |
| Highlight exists in Notes/storage but no mark is visible | CFI-to-section index drift or overlay hydration | Native and canonical section indices, live overlayer child count |
| `chrome-error://chromewebdata/` is the content URL | Browser/media-presentation navigation; the document reader did not mount | Route kind and Electron navigation policy |
| Reader error UI and failed raw-byte request | Backend/source acquisition | HTTP status and backend log for the raw object request |
| Contents panel says the publication exposes no table of contents | Publication metadata | `book.toc`/navigation metadata; this alone does not explain blank content |

The backend can be healthy while the reader is blank. During this incident:

- `/api/healthz` and `/api/health` returned `200` from a clean full desktop server.
- Resource discovery and object endpoints returned `200` repeatedly.
- The failure reproduced immediately after a cold application start.
- Foliate had already opened the book and rendered `EPUB/nav.xhtml`; it had simply rendered the
  wrong section.

Resource-status polling is also easy to misread. Repeated `/api/find/file` and
`/api/objects/resource` requests do not prove that the EPUB bytes are being refetched or that a
backend restart is replacing the reader source. They came from the resource catalog query, not the
Foliate source lifecycle.

## The malformed-spine and CFI failure

### What the affected book looked like

The relevant spine began approximately as follows:

```text
index 0  EPUB/nav.xhtml     cfi epubcfi(/6/4)
index 1  EPUB/notice.html   cfi epubcfi(/6/6)
index 2  EPUB/page_1.html   cfi epubcfi(/6/8)
```

The navigation document contained a `<nav role="doc-toc">` but no readable body text. The
publication nevertheless left it eligible as a linear spine item.

The bad persisted location was shaped like:

```text
epubcfi(/6/4!/4/2[id],,/4)
```

The package portion before `!` identifies `epubcfi(/6/4)`, which is `EPUB/nav.xhtml`. The range
portion after `!` does not describe a valid range in the loaded document.

### Why Foliate's normal fallback failed

The pinned `foliate-js/view.js` implementation does this:

```js
goToTextStart() {
    return this.goTo(this.book.landmarks
        ?.find(m => m.type.includes('bodymatter') || m.type.includes('text'))
        ?.href ?? this.book.sections.findIndex(s => s.linear !== 'no'))
}
```

If the EPUB has no useful body-matter landmark, the first section whose `linear` value is not
`"no"` wins. That policy assumes the publisher described the spine correctly. This book did not,
so `showTextStart: true` deterministically selected the empty nav document.

`View.init()` also checks `lastLocation` by truthiness. Numeric section index `0` is therefore not
treated as an explicit last location; it follows the non-location branch. Keep this upstream detail
in mind when testing numeric fallbacks.

The malformed CFI created a second trap. `resolveNavigation()` could infer a section index while
the deferred anchor still failed when the renderer applied it. The observed error originated in
`epubcfi.js` around `partsToNode()` and attempted to traverse nonexistent CFI parts. Foliate then
logged `Could not go to ...`. A successful-looking `resolveNavigation()` result is not proof that
the anchor can be applied.

### The recovery rule in Buddy

Recovery lives in:

```text
packages/web/src/components/readers/utils/foliate-helpers.ts
  resolveRestorableNavigationTarget()
```

The important rules are:

1. Extract the canonical package-section CFI from a string CFI by taking the portion before `!`
   and closing `epubcfi(...)`.
2. Match that package CFI against `book.sections[].cfi`. The canonical package section is more
   authoritative than a section index inferred from a malformed range anchor.
3. Reject a section when `linear === "no"`.
4. Reject EPUB navigation documents matching `nav.html`, `nav.htm`, or `nav.xhtml` after removing
   a query or fragment.
5. Move forward to the first restorable section and pass its numeric index to Foliate.
6. Apply the same safe first-section resolver when there is no saved location. Do not reserve it
   only for the error branch, or a first-ever open can still land on an empty nav document.
7. If restoring a persisted location throws during `view.init()`, retry with the safe readable
   section. Do not retry with only `showTextStart: true`.

When the package CFI maps to a filtered-section index that differs from Foliate's native resolved
index, pass the canonical **numeric section index** back to `View.init()`. Passing the original CFI
would send it through the unfiltered package spine again and reopen the adjacent section. This
intentionally sacrifices the within-section offset only for the malformed-spine recovery case; a
correctly round-tripping CFI remains unchanged.

Preserve valid CFIs unchanged. CFI persistence is still the correct EPUB location contract; the
resolver is a malformed-publication boundary, not a replacement navigation scheme.

### Navigation testing traps

- Do not use incomplete package CFIs such as `epubcfi(/6/40)` as proof that navigation works. They
  may move to a section and then fail while applying an anchor, and relocation can persist another
  invalid value.
- Prefer `view.goTo(sectionIndex)` when isolating whether a section can render.
- `view.goTo()` catches and logs many failures rather than rejecting them. After awaiting it, inspect
  `renderer.getContents()` and the visible document instead of assuming no thrown exception means
  success.
- A section index reported by `resolveNavigation()` is not enough. The anchor function may fail
  only after the section document loads.
- Avoid eagerly creating/loading every section document during diagnosis. Large or malformed
  archive-generated books can make that probe hang. Inspect spine metadata and the currently
  rendered document first.

## Filtered spine indices and silently missing annotations

### The exact mismatch

The affected EPUB referenced a missing manifest item named `cover`. The pinned `foliate-js` EPUB
loader derives section CFIs from the package's original spine and then exposes sections using a
filtered mapping equivalent to:

```js
resources.spine.map(item => createSection(item)).filter(section => section)
```

The absent manifest item contributes a position to the package CFI arithmetic but contributes no
entry to `book.sections`. In the failing document the runtime evidence was:

```text
persisted annotation  epubcfi(/6/10!/4/2,/1:0,/1:37)
canonical section     book.sections[3] = EPUB/page_3.html, cfi epubcfi(/6/10)
native resolution     view.resolveNavigation(annotationCfi).index = 4
```

Both numbers can appear in `renderer.getContents()` depending on how the page was reached. Numeric
navigation to canonical section `3` mounts the intended document as content `3`. Sending the raw
CFI back through Foliate can mount the adjacent/wrong document as content `4`. Treat a renderer
content index as an engine coordinate, not durable publication identity.

### Why persistence looked successful

Foliate's built-in annotation path resolves the CFI and asks for the overlayer at that resolved
index. In this case it asked for overlay `4` while the intended document and overlay were at
canonical section `3`. The path can return annotation metadata without throwing and without adding
an SVG node. Buddy then updates React state and local persistence normally.

This produces a particularly misleading state:

- the native selection disappears;
- **Highlights & notes** contains the record;
- local storage contains the CFI, text, color, and timestamps; and
- the visible overlayer contains no mark.

Notes-list presence proves persistence, not paint. A successful promise from `addAnnotation()` is
also not paint verification.

### Buddy's annotation boundary

The defensive annotation adapter lives in:

```text
packages/web/src/components/readers/utils/foliate-annotations.ts
packages/web/src/components/readers/utils/foliate-drawing.ts
```

Its rules are:

1. Extract the package CFI before `!` and match it to `book.sections[].cfi` to obtain the canonical
   filtered-section index.
2. Retain Foliate's native resolved index as an engine fallback; do not pretend it is the canonical
   publication index.
3. Accept overlay creation events for either index. CFI navigation may label the intended loaded
   document with the native index even though numeric navigation labels it canonically.
4. Apply Foliate's resolved range anchor to candidate live documents. When falling back to the
   native index, require its normalized range text to match the persisted annotation text so an
   adjacent document with a similar DOM shape cannot receive the mark.
5. Draw into the matched live `Overlayer` directly, using the original persisted CFI as the overlay
   key. Do not manufacture and persist an index-adjusted CFI.
6. Remove the original CFI key from both canonical and native candidate overlays.
7. Reveal annotations by navigating to `{ index: canonicalIndex, anchor }`, not by passing the raw
   CFI back through the broken package-spine resolution.

This boundary is used for hydration, creation, recoloring, deletion, reveal-from-Notes, and theme
repaint. A local fix in only the color-button handler would leave reload and reactivation broken.

## Bench parking and Foliate lifecycle

Bench surfaces are kept alive. Inactive does not mean unmounted. Activity is provided through:

```text
packages/web/src/components/bench/bench-surface-activity.tsx
```

Foliate owns custom elements, a renderer, iframe/blob documents, injected styles, history, search
state, annotation overlays, and source resources. During this incident, a parked reader could
return blank or unstyled even though its React component had never unmounted.

The following lighter recovery attempts did not solve the repeated failure reliably:

- reapplying reader preferences/theme attributes;
- forcing responsive-margin synchronization;
- observing the host with `ResizeObserver`;
- changing host positioning, `inert`, visibility, or opacity behavior; and
- treating the source Blob identity as the primary cause.

Those were useful hypotheses, but the runtime evidence continued to show a bad current section or
a stale Foliate iframe state. Do not reintroduce generic Bench layout mutations to hide an engine
lifecycle failure.

### What actually collapsed

The reflowable renderer contains two independent observation loops in `paginator.js`:

- `Paginator` observes its private container and calls `render()`.
- its private `View` observes the iframe body and calls `expand()`.

`View.expand()` measures a cached `Range` covering the iframe body, calculates the number of pages,
then writes the iframe and sentinel geometry. After a Bench switch, live inspection showed:

```text
renderer.size                         736px
iframe.getBoundingClientRect().width    0px
iframe.style.width                      0px
parent width                         1472px
documentElement.scrollWidth           736px
new Range(body).width                 non-zero
private cached Range width               0px
```

The parent width was exactly two pages because Foliate retained only its two sentinel pages after
calculating zero content pages. The document, text, styles, source Blob, and React component were
still alive. Accessibility could still see text while the painted iframe was blank.

Calling public `renderer.render()` is not a recovery API. It reuses the poisoned private range and
can collapse the frame again; during the incident it also produced `Location NaN` and, in one
state, an internal `setStylesImportant` null failure. Manually writing iframe dimensions only lasts
until the next observer callback.

### Engine suspend/resume contract

The pinned dependency is patched through:

```text
patches/foliate-js@github%3Ajohnfactotum%2Ffoliate-js%23399248a.patch
package.json -> patchedDependencies
```

The patch adds `suspend()` and `resume()` to both the reflowable paginator and fixed-layout
renderer. The paginator contract is deliberately stronger than a public `render()` call:

1. `suspend()` marks both paginator layers suspended and unobserves the paginator container and
   iframe body. Queued observer callbacks also check the suspended flag before measuring.
2. A private view created while suspended inherits that state and does not measure hidden content.
3. `resume()` reconnects the observers, creates a **new Range from the live iframe document**,
   selects the body again, recomputes the visible layout, restores the anchor, and redraws the
   overlayer.
4. `destroy()` unobserves the same private container that the constructor observed. The upstream
   implementation observed `#container` but attempted to unobserve `this`.

Fixed-layout EPUBs do not use the cached content range, but their renderer has its own
`ResizeObserver`. It implements the same lifecycle so the adapter contract is format-layout
independent.

`FoliateReader` consumes Bench activity with `useLayoutEffect`. When inactive it suspends the
existing renderer; when active it resumes it and schedules annotation hydration against the live
layout. If async `view.open()` finishes after the surface has already been parked, the current
activity ref suspends the newly created renderer before navigation initializes it.

Do not move this logic back into generic Bench CSS. The host should continue to use its normal
`inert`, `aria-hidden`, and invisible parking semantics; the document engine owns its continuously
running measurement work.

### Memory and performance implications

Suspend/resume retains one Foliate view and one parsed book for each kept-alive reader tab. It does
not create a second view, reopen the source, reparse the archive, recreate iframe documents, or
accumulate observers. Parked views still consume the memory required by Bench keep-alive, but their
layout observers do no work until reactivation.

This is why returning to an EPUB must not show the `Opening…` state or issue another raw EPUB byte
request. A source change or actual instance eviction still performs full cleanup and open. A mere
activity change must leave the open/close counts unchanged and call exactly one suspend or resume.

The lifecycle regression test asserts that stable source metadata does not reopen the book and that
a park/return pair suspends and resumes the same renderer instance.

### Failed approaches worth remembering

These approaches were tested in a cold desktop process and rejected:

- rebuilding the Foliate view on every activation fixed blank pages but flashed `Opening…`,
  reparsed the EPUB, and refetched/recreated reader resources on every switch;
- calling `renderer.render()` on activation reused the collapsed private Range;
- repairing iframe width and sentinel geometry from Buddy was overwritten by Foliate's observer;
- changing the parked wrapper from `invisible` to opacity, retaining absolute geometry, painting it
  behind the active surface, or removing `inert`/`aria-hidden` did not prevent the collapse; and
- reapplying theme/preferences, responsive margins, or a host `ResizeObserver` did not reset the
  engine's cached measurement state.

If this recurs after a Foliate upgrade, inspect the observer and Range ownership before changing the
Bench host again.

### Maintaining the dependency patch

Always compare the patch against the commit pinned in `packages/web/package.json`. Run a dry patch
application against an unmodified checkout before relying on an already-mutated `node_modules`.
During this incident, `bun patch --commit node_modules/foliate-js` segfaulted in both Bun 1.3.13 and
1.3.14 for the Git dependency. The patch was therefore generated as a normal unified diff and
registered explicitly in `patchedDependencies`; `bun install --lockfile-only` accepted the key and
wrote it to `bun.lock`.

### Preference writes are not free

Foliate's renderer is a custom element whose attributes drive layout. Rewriting `flow`, `margin`,
`gap`, `max-inline-size`, or `max-block-size` with the same value can still cause engine work. The
theme adapter compares the current attribute before setting it and computes responsive margins
from the actual view width.

Apply preferences after `view.open()` has produced a book/renderer and before initial navigation.
Treat fixed-layout publications separately. Preference synchronization is useful for avoiding
unnecessary work, but it is not an activation-recovery mechanism; repeatedly writing attributes did
not repair the stale reader in this incident.

Responsive margin maintenance is a narrower, valid use of host size observation. Observe only the
active reader surface, synchronize only the `margin` attribute when the computed value changes,
ignore zero-width, fixed-layout, replaced, and parked views, and disconnect the observer before
calling `renderer.suspend()`. On activation, resume the engine first and then synchronize the
margin. Do not turn an ordinary responsive-margin update into a full preference/theme reapply or a
renderer recovery attempt.

## Annotation commit and repaint ordering

The color dots in the selection toolbar are commands: clicking a color creates a highlight in that
color. They are not a control for recoloring the browser's native selection.

Selection ordering is a secondary WebKit concern, independent of the filtered-spine bug above. The
incorrect ordering was effectively:

1. Keep WebKit's native selection active.
2. Call `view.addAnnotation()`.
3. Clear the native selection.

With that order, Foliate could create/persist the annotation while its SVG annotation overlayer
remained visually stale. The highlight then appeared only after a resize, remount, or another state
change. This looked like failed persistence even though the annotation record existed.

The reliable order is:

1. Capture the selected text and CFI.
2. Clear/deselect the native selection.
3. Resolve the annotation through Buddy's canonical-section adapter and paint it with the semantic
   color.
4. Store the returned section index and label on the annotation when available.
5. Update Buddy's annotation state/persistence.
6. Refresh that annotation after two animation frames, guarded by the current view identity.

The two-frame scheduling lets WebKit finish removing the native selection and complete layout before
Foliate redraws the committed overlay. Always cancel a pending refresh during teardown and verify
`viewRef.current === view` before mutating the replacement renderer.

Annotation hydration must also tolerate records whose section index is not known yet. Let Foliate
resolve the CFI and write back its returned index/label rather than filtering every unknown-index
annotation out before resolution.

When testing, distinguish these states:

- Native selection is visible and the selection toolbar is open.
- The color action has run and the native selection is gone.
- The committed mark remains visible after clicking elsewhere.
- The annotation appears in **Highlights & notes**.
- The mark remains after switching away and returning.

Only the last four demonstrate a committed, repainted, restorable highlight.

## Selection toolbar geometry

Foliate selection events originate in a document owned by the renderer, while Buddy's action pill
is rendered in the product shell. Coordinate spaces must be made explicit:

- derive the selection point from the live rendered range;
- convert it to coordinates local to the reader surface;
- portal the overlay into the reader's stacking context; and
- clamp the overlay to the reader boundary rather than the application viewport.

The toolbar should be positioned above its anchor with an intentional gap. Keeping it compact is
not merely cosmetic: a tall/wide pill covers more selected text and makes the apparent anchor error
more noticeable. Shared overlay changes affect PDF and EPUB, so verify both formats and also test a
wide menu near the reader's horizontal edges.

Do not infer persisted annotation geometry from the toolbar position. The pill is transient UI;
the EPUB annotation is anchored by CFI and rendered by Foliate.

## Resource preparation and polling

Resource discovery and resource preparation are different data lifecycles:

- discovery searches the workspace for `.pdf` and `.epub` paths;
- preparation status reads `/api/objects/resource` and may temporarily be `preparing`; and
- opening a reader fetches its specific raw Blob through a separate long-lived query.

Previously, `resourcesQueryOptions()` bundled all three catalog calls into one query and polled that
whole query every 1.5 seconds whenever any record was `preparing`. One stuck record therefore
repeated both `/api/find/file` searches as well as the object-list request indefinitely.

Discovery now has its own infinite-stale query cache. Preparation polling can refresh the object
list without rerunning file searches. Explicit resource mutations invalidate discovery first and
then invalidate the composite/status queries, so adding or removing files still updates the catalog.
Background polling is not enabled.

The backend must also recover durable `preparing` state. `listResolvedResourceObjects()` now starts
preparation for every preparing manifest that has no matching in-process task. The in-flight map
makes list polling idempotent. This means the first list after a backend restart resumes interrupted
work, reaches a terminal state, and naturally stops the frontend interval instead of polling a
manifest that can never change.

When diagnosing request logs:

- duplicate-looking lines can be Electron forwarding the same backend log twice;
- repeated object-list requests while a task is genuinely preparing are expected;
- repeated `.pdf` and `.epub` searches at the same interval indicate discovery was accidentally
  coupled back into status polling; and
- repeated raw EPUB requests during tab switches indicate the reader is reopening, which is a
  separate lifecycle regression.

## Runtime inspection playbook

Use a full desktop development process when lifecycle behavior is involved:

```sh
bun dev:desktop
```

Stop any older Buddy development process first. Do not rely on a `fast` process for this check;
`fast` does not provide the full HMR/rebuild behavior needed to establish whether the running
backend and renderer contain the patch. After the patch is ready, restart the full process once
more and reproduce from the already-bad persisted state. Clearing persistence first removes the
most important regression case.

In Electron DevTools, start with the live Foliate element:

```js
const view = document.querySelector('foliate-view')
```

Inspect the publication spine without loading every section:

```js
view.book.sections.map((section, index) => ({
  index,
  id: section.id,
  cfi: section.cfi,
  linear: section.linear,
}))
```

Inspect what the renderer actually mounted:

```js
view.renderer.getContents().map(content => ({
  index: content.index,
  title: content.doc?.title,
  text: content.doc?.body?.textContent?.slice(0, 300),
  overlayerChildren: content.overlayer?.element?.children?.length,
}))
```

Do not derive a section ID with `book.sections[content.index]` until the raw/filtered index mapping
has been checked. That lookup was precisely what the malformed spine invalidated.

Compare the saved/current CFI with both navigation resolution and the canonical section CFI:

```js
const cfi = view.lastLocation?.cfi
const resolved = cfi ? await view.resolveNavigation(cfi) : undefined
const packageCfi = cfi?.includes('!') ? `${cfi.slice(0, cfi.indexOf('!'))})` : cfi
const canonicalIndex = view.book.sections.findIndex(section => section.cfi === packageCfi)
({ cfi, nativeIndex: resolved?.index, canonicalIndex })
```

Remember that a malformed range may make `resolved.index` misleading. Extract and compare the
package CFI before `!` as described above.

Other useful evidence:

- the rendered content's blob URL before and after reactivation;
- iframe document text and injected style elements;
- `content.overlayer.element.children.length` and its SVG markup; the overlayer is owned by the
  paginator and is not necessarily returned by `content.doc.querySelector('svg')`;
- `view.lastLocation`, current section index, and location footer;
- console errors containing `partsToNode`, `Could not resolve target`, or `Could not go to`; and
- whether the same failure survives a cold full-server restart.

DevTools probes can emit relocation events and overwrite the saved location. Record the original CFI
before manual navigation and leave the user's book on a valid readable location when diagnosis is
finished.

## Reproduction and verification matrix

For this failure class, a single successful open is insufficient.

### Malformed EPUB recovery

1. Keep the known-bad persisted CFI.
2. Stop the prior development server.
3. Start a fresh full `bun dev:desktop` process.
4. Open the affected EPUB and confirm readable, styled content—not merely reader chrome.
5. Confirm the rendered section is not `nav.xhtml` and contains body text.
6. Confirm the location footer and current CFI update to a valid location.

### Activation stability

1. Open a real PDF through `DocumentReader` and the affected EPUB in separate Bench tabs.
2. Switch PDF → EPUB at least four times.
3. Wait for each activation to settle; verify visible styled text each time.
4. Watch for a changing blob URL to confirm a controlled replacement view was created.
5. Confirm the old view was closed rather than retained alongside the new one.

A browser-level media-presentation PDF route that resolves to `chrome-error://chromewebdata/` is not
a valid PDF-reader counterpart for this test; the document reader never mounted. Use a known
resource such as the reader stress-test PDF.

### Highlight behavior

Run this for both EPUB and PDF even when the code change appears format-specific:

1. Select text and confirm the compact action pill is clear of the text.
2. Click a color and verify it commits a highlight rather than merely recoloring the selection.
3. Click elsewhere and verify the mark remains immediately.
4. Open **Highlights & notes** and verify the record exists.
5. Switch away and back and verify the mark rehydrates.
6. Delete only the temporary marks created for the test.

### Automated coverage

The primary regression tests are:

```text
packages/web/test/reader-behavior.test.ts
  - first readable spine fallback
  - malformed nav-section CFI recovery
  - filtered-spine CFI restoration through the canonical numeric index
  - preservation of a valid readable CFI

packages/web/test/foliate-annotations.test.ts
  - canonical overlay paint when native CFI resolution is one index ahead
  - paint when the loaded intended document temporarily carries the native index
  - removal by the original persisted CFI key
  - reveal through the canonical section while retaining the range anchor

packages/web/test/foliate-reader-lifecycle.test.tsx
  - stable source does not reopen unnecessarily
  - parked reader rebuilds once on reactivation
  - preference changes do not reopen the source

packages/web/test/reader-floating-overlays.test.tsx
  - compact selection toolbar
  - color dot invokes the highlight action
```

Run the focused reader tests from `packages/web` with the Happy DOM preload. A raw root-level
`bun test <file>` omits that preload and produces misleading `document is not defined`,
`HTMLElement is not defined`, and `import.meta.glob is not a function` failures.

```sh
cd packages/web
bun test --preload ./happydom.ts \
  test/foliate-annotations.test.ts \
  test/reader-behavior.test.ts \
  test/foliate-reader-lifecycle.test.tsx \
  test/reader-floating-overlays.test.tsx
```

For a code change, finish with repository `bun lint` and one root `bun typecheck` as required by
`AGENTS.md`.

## Misleading hypotheses from this incident

These ideas were investigated and ruled out as the primary cause. They may be valid in a different
incident, but require evidence before changing code:

- **Stale backend:** ruled out by clean restart, successful health/raw-object requests, and the same
  persisted failure on cold open.
- **Backend restarts replacing the source:** polling logs did not correspond to repeated EPUB-byte
  acquisition.
- **Missing table of contents:** the publication did lack a useful TOC, but that did not prevent its
  readable spine sections from rendering.
- **Host `position`, `inert`, visibility, or opacity:** generic Bench host changes did not repair the
  engine state and risk regressions across unrelated surfaces.
- **Resize alone:** reapplying preferences, margins, and observer-driven layout synchronization did
  not consistently recover the Foliate iframe.
- **Source Blob identity:** object/source churn was not the root cause of the deterministic
  nav-section restoration failure.
- **The EPUB is simply corrupt:** the EPUB is malformed and OCR-generated, but readable sections
  exist. The reader still needs a defensive recovery policy.

## Implementation map

```text
packages/web/src/components/readers/document-reader.tsx
  Product-level engine selection. Do not bypass it.

packages/web/src/components/readers/foliate-reader.tsx
  Foliate view lifecycle, suspend/resume, selection actions, annotation hydration,
  persistence orchestration, and reader callbacks.

packages/web/src/components/readers/utils/foliate-helpers.ts
  Input conversion, navigation-target validation, cleanup, cover URLs, and Foliate helpers.

packages/web/src/components/readers/utils/foliate-annotations.ts
packages/web/src/components/readers/utils/foliate-drawing.ts
  Canonical/native section reconciliation and direct live-overlayer annotation drawing.

packages/web/src/components/readers/utils/foliate-themes.ts
  Theme injection and renderer preference attributes. Attribute synchronization is not a
  substitute for view recovery.

packages/web/src/components/readers/ui/reader-floating-overlay.tsx
packages/web/src/components/readers/ui/reader-selection-toolbar.tsx
  Shared reader-local overlay positioning and compact selection actions. Changes require PDF and
  EPUB verification.

packages/web/src/components/bench/bench-surface-activity.tsx
  Kept-alive Bench activity boundary.

packages/reader-contract/src/index.ts
  Shared EPUB CFI anchors and neutral reader contracts.
```

Upstream/reference sources:

```text
~/code/foliate-js
  Engine API and implementation reference.

~/code/foliate
  Foliate GUI behavior reference only. Do not copy GPL application source into Buddy.

packages/web/node_modules/foliate-js/view.js
packages/web/node_modules/foliate-js/epubcfi.js
  Exact pinned runtime behavior currently shipped by Buddy.
```

Inspect the pinned dependency when runtime behavior conflicts with memory or upstream HEAD. Buddy
integrates the installed commit, not whichever version happens to be current online.

## Invariants for future changes

- Keep CFI as the EPUB persistence anchor; validate it at the engine boundary.
- Never assume `showTextStart` means readable body content for malformed publications.
- Treat the package section CFI as authoritative when a malformed range and inferred index disagree.
- Treat resolved indices and `renderer.getContents()[].index` as engine coordinates until they are
  reconciled with the package CFI and filtered `book.sections`.
- Do not use Notes/storage presence or a fulfilled `addAnnotation()` promise as proof that an SVG
  annotation was painted.
- Preserve the original CFI as the annotation and overlay key; navigate malformed CFIs through the
  canonical numeric index rather than rewriting the CFI.
- Do not persist incomplete hand-written CFIs from diagnostics.
- Do not let async work from an old view mutate a replacement view.
- Close/remove/destroy the old view and release object URLs before replacement.
- Do not rebuild Foliate for ordinary renders or preference changes.
- Do not describe a persisted-but-unpainted annotation as a persistence failure until the notes
  list and storage state have been checked.
- Clear native selection before painting a committed annotation.
- Verify cold open, repeated activation, and highlight rehydration with real EPUB and PDF resources.
- Preserve unrelated dirty-worktree changes while investigating reader behavior.

## Possible follow-up improvements

- Add structured development diagnostics for recovery reason, section index/ID, and package CFI.
  Never log publication text by default.
- Expand section classification only with real fixtures. Blindly skipping every file with a
  navigation-like name could hide legitimate publisher content.
- Build a minimal malformed EPUB fixture containing a linear `nav.xhtml`, an invalid range CFI, and
  a spine reference to a missing manifest item so both index-drift failures can be exercised
  end-to-end without depending on a personal book.
- Measure activation latency and memory across many parked reader tabs before attempting source or
  parsed-book caching. Caching without clear ownership can retain Blob documents and undo cleanup.
- Re-evaluate the activation rebuild when upgrading `foliate-js`; keep it unless the full regression
  matrix proves a lighter resume path is reliable.
- Consider reporting the minimal malformed-CFI reproduction upstream once it is isolated from Buddy
  persistence and Bench lifecycle behavior.
