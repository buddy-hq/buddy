# LAUNCH-10 — Active content, resource ingestion, Bench, whiteboard, and Obsidian surfaces

Audit date: 2026-07-13
Pass status: Discovery complete; verification pending
Baseline: Current workspace, evaluated as a clean release-candidate tree. Unrelated dirty-worktree changes were ignored.

This file records first-pass candidates across renderers, managed HTML widgets, resource ingestion and readers, Bench, whiteboard, and Obsidian integration. A candidate is not a final launch verdict until the verification pass either retains it under **Verified bugs** or moves it to **Rejected after verification**.

## Candidate bugs

### L10-C01 — P1 — Sandboxed HTML widgets can read the authenticated Buddy API

- **Locations:** `packages/buddy/src/learning/features/html-widgets/service/types.ts:5-20`, `packages/buddy/src/routes/object-html-widget.ts:46-59`, `packages/buddy/src/routes/object-html-widget.ts:105-152`, `packages/web/src/components/media/renderers/html-widget-frame.tsx:120-144`, `packages/web/src/components/media/renderers/html-widget-frame.tsx:209-224`, `packages/web/src/components/media/renderers/html-widget-frame.tsx:257-266`, `packages/desktop-electron/src/main/backend-auth.ts:20-42`, `packages/buddy/src/app.ts:79-94`, `packages/buddy/src/app.ts:117-118`
- **Trigger:** Present a model-authored widget whose script fetches a Buddy API URL from its runtime frame.
- **Expected:** Widget code has no ambient credential or API authority; its network policy should be an explicit deny or a narrowly scoped, capability-based bridge.
- **Observed in discovery:** The iframe omits `allow-same-origin`, but its document is served from the backend and its CSP includes `connect-src 'self'`. CSP's protected-resource origin therefore permits backend URLs even though the sandboxed script's effective origin is opaque. Electron's `onBeforeSendHeaders` hook then adds Basic authorization to every request whose target matches the backend origin without checking the requesting frame, resource type, or initiator. Global wildcard CORS makes a simple authenticated response readable by the opaque-origin frame.
- **Impact:** Arbitrary JavaScript generated for a teaching widget can read notebook, session, object, and other authenticated API data. Depending on preflight and route behavior, it may also perform mutations; the widget sandbox no longer represents an API authority boundary.
- **Verification pending:** Load a hostile widget in inline and Bench modes, attempt simple GET plus preflighted and non-preflighted mutations, and capture the iframe origin, CSP decision, injected authorization, CORS response, readable response body, and resulting state in Electron and a remote browser client.
- **First-pass confidence:** High for authenticated readable GET authority; mutation breadth remains to be measured.

### L10-C02 — P1 — `prepare_resource` bypasses the external-directory permission boundary

- **Locations:** `packages/buddy/src/learning/features/reading/tools/prepare-resource.ts:27-53`, `packages/buddy/src/learning/features/reading/tools/prepare-resource.ts:234-257`, `packages/buddy/src/learning/agent-execution/permissions/session-permissions.ts:63-77`, `vendor/opencode/packages/opencode/src/permission/index.ts:67-84`, `packages/buddy/src/resources/resource-registry-service.ts:211-239`, `packages/buddy/src/resources/resource-registry-service.ts:820-906`, `packages/buddy/src/resources/resource-registry-service.ts:1506-1510`, `packages/buddy/src/objects/store.ts:154-162`
- **Trigger:** The agent calls `prepare_resource` with an absolute path outside the notebook, or with a notebook-local symlink whose target is an external regular file.
- **Expected:** Canonicalize the source, apply the normal `external_directory` permission to an out-of-workspace target, and copy it only after an explicit applicable grant.
- **Observed in discovery:** The tool asks permission under its own `prepare_resource` ID and the raw source-path pattern. Runtime compilation already grants an available static tool `prepare_resource:*`, so permission evaluation returns `allow` without presenting a path-specific prompt. The resource service accepts absolute paths, uses `stat` and `copyFile` (which follow symlinks), and performs no canonical allowed-root or `external_directory` check before copying and extracting the file into notebook-managed storage.
- **Impact:** The model can copy and extract arbitrary readable same-user host files into the notebook, then expose their content through resource/full-text tooling, bypassing the permission that ordinarily protects files outside the active workspace.
- **Verification pending:** Run the tool with an external sentinel file and with workspace symlinks/junctions to external sentinels under default, ask, allow-once, deny, and allow-always policies on macOS and Windows; record whether any permission event appears and whether bytes reach managed source/full text.
- **First-pass confidence:** High.

### L10-C03 — P1 — EPUB scripts execute in same-origin scripted Foliate frames

- **Locations:** `packages/web/package.json:53`, `packages/web/src/components/readers/foliate-reader.tsx:932-1045`, `packages/web/src/components/readers/hooks/use-foliate-book.ts:215-270`, `packages/web/node_modules/foliate-js/view.js:30-42`, `packages/web/node_modules/foliate-js/view.js:231-265`, `packages/web/node_modules/foliate-js/epub.js:762-784`, `packages/web/node_modules/foliate-js/epub.js:813-863`, `packages/web/node_modules/foliate-js/paginator.js:242-245`, `packages/web/node_modules/foliate-js/paginator.js:646-664`, `packages/web/node_modules/foliate-js/fixed-layout.js:71-104`
- **Trigger:** Open a structurally valid EPUB containing an inline script or a manifest JavaScript resource.
- **Expected:** EPUB markup is passive: scripts are removed or denied before publication content is loaded into a frame that can access the application origin.
- **Observed in discovery:** Foliate creates content iframes with `sandbox="allow-same-origin allow-scripts"`. Its resource loader defaults JavaScript resources to `allow: true`, and its HTML rewrite explicitly leaves inline scripts untouched. The book exposes a transform/load event that can deny scripts, but Buddy's reader setup does not register such a listener before `open`/`init`; the only current transform listener rewrites CSS data. EPUB content is loaded through creator-origin blob URLs, so the two sandbox flags allow publication script to execute with same-origin parent access.
- **Impact:** A malicious ebook can reach the Buddy renderer DOM, `window.parent`, preload-exposed APIs, and authenticated backend requests. It can tamper with the UI or cross from an imported document into host/API authority simply by being opened.
- **Verification pending:** Build hostile reflowable and fixed-layout EPUB fixtures with inline and external scripts; test parent DOM/preload/API access, sandbox removal/reload, external network requests, navigation/popups, and cleanup on macOS and Windows.
- **First-pass confidence:** High on the executable path; exact Electron authority reached by a fixture remains to be measured.

### L10-C04 — P1/P2 — Resource preparation has no aggregate input, expansion, work, or cancellation budget

- **Locations:** `packages/buddy/src/resources/reader-source-validator.ts:149-189`, `packages/buddy/src/resources/reader-source-validator.ts:192-230`, `packages/buddy/src/resource-packs/service.ts:23-72`, `packages/buddy/src/resource-packs/service.ts:75-121`, `packages/buddy/src/resource-packs/extractors.ts:330-384`, `packages/buddy/src/resource-packs/extractors.ts:465-489`, `packages/buddy/src/resource-packs/extractors.ts:635-723`, `packages/buddy/src/resource-packs/extractors.ts:731-850`, `packages/buddy/src/resource-packs/pdf/liteparse-parser.ts:25-66`, `packages/buddy/src/resource-packs/pdf/selective-ocr-parser.ts:40-64`, `packages/buddy/src/resources/resource-registry-service.ts:983-1052`
- **Trigger:** Add one hostile compression-bomb/very large resource, a pathological PDF/DOCX/EPUB, or many expensive resources concurrently; then cancel the turn, remove the resource, or close the notebook while preparation is active.
- **Expected:** Enforce compressed and uncompressed byte, entry/page/count, output, memory, wall-clock, and concurrent-work budgets; propagate cancellation through parsers and bounded subprocess termination.
- **Observed in discovery:** EPUB validation reads the whole archive and enumerates entries without source/entry/expanded-size limits. Extraction again reads whole files, inflates referenced ZIP entries, accumulates chapters/pages/full text, invokes Mammoth/PDF parsers, and writes all derived output without aggregate ceilings. LiteParse operations and `pdftotext`/`pdftoppm`/`mutool` calls receive no abort signal or timeout; command output buffers are bounded, but runtime is not. The process-local in-flight maps only deduplicate a matching key and impose no cross-resource concurrency limit, while tool cancellation stops polling rather than parser work.
- **Impact:** A local or downloaded resource can exhaust backend memory, CPU, subprocess slots, and disk, hang deletion/shutdown, or make all notebooks unresponsive. Multiple ordinary large imports can produce the same failure without malicious input.
- **Verification pending:** Exercise declared-size/expanded-size ZIP bombs, huge entry tables, deeply structured documents, oversized text output, parser hangs, many concurrent imports, cancellation, deletion, and shutdown while recording peak RSS/CPU/disk, child PIDs, recovery, and Windows/macOS behavior.
- **First-pass confidence:** High on missing budgets and cancellation; the smallest launch-blocking fixture remains to be determined.
- **Reassessment status:** Partially fixed and still open.
- **Retained work:** Source, declared archive expansion, per-entry, aggregate text/page, parser-growth, and chunk ceilings now fail early. The focused resource suite passes.
- **Why still open:** The ownerless process-global build queue was discarded because one hung parser blocked every resource and notebook. There is still no wall-clock deadline, cooperative parser/subprocess cancellation, trustworthy accounting of actual inflated bytes, justified bounded-concurrency owner, or empirical validation of the 64 MiB source ceiling.
- **Later work:** Measure real large textbooks and hostile fixtures, then add deadlines and cancellation at the Buddy resource/parser owners. Any concurrency limit must have an explicit resource/notebook owner and bounded waiting; do not restore a module-global promise tail.

### L10-C05 — P2 — Mermaid's global render queue is unbounded and stale work cannot be cancelled

- **Locations:** `packages/web/src/components/media/renderers/mermaid/lib/scheduler.ts:10-86`, `packages/web/src/components/media/renderers/mermaid/lib/render.ts:315-368`, `packages/web/src/components/media/renderers/mermaid/lib/render.ts:371-417`, `packages/web/src/components/media/renderers/mermaid/use-mermaid-render.ts:87-145`, `packages/web/src/components/markdown/markdown-mermaid-segment.tsx:230-290`
- **Trigger:** Render a transcript or rapidly changing source containing many distinct expensive Mermaid diagrams/revisions, then navigate away or supersede those revisions before they render.
- **Expected:** Bound queued work and source complexity, coalesce superseded renders, and cancel queued/unmounted tasks so current visible diagrams receive service promptly.
- **Observed in discovery:** The module-global scheduler has concurrency one but no queue length, byte, age, or per-owner limit. It deduplicates only identical cache keys; every distinct source/revision is retained. React request tokens suppress stale state updates but do not remove or abort queued/running tasks, and the streaming component's local cancellation likewise only ignores results.
- **Impact:** Old invisible work can retain source/closures, monopolize the sole renderer, grow memory, and delay every current Mermaid surface. Pathological diagrams can freeze the renderer one-by-one while an arbitrarily long queue waits behind them.
- **Verification pending:** Generate many unique large/slow diagrams during streaming, unmount/switch sessions, and measure queue depth, retained memory, main-thread stalls, time-to-current-render, and recovery; include a deterministic slow runtime to prove stale tasks still execute.
- **First-pass confidence:** High on the unbounded non-cancellable queue; practical severity depends on Mermaid's own per-render guards.

### L10-C06 — P1/P2 — Whiteboard state and session identity are protected only by process-local locks

- **Locations:** `packages/buddy/src/learning/features/whiteboard/service/store.ts:52-105`, `packages/buddy/src/learning/features/whiteboard/service/store.ts:130-155`, `packages/buddy/src/learning/features/whiteboard/service/store.ts:173-214`, `packages/buddy/src/learning/features/whiteboard/service/store.ts:230-285`, `packages/buddy/src/learning/features/whiteboard/service/store.ts:288-350`, `packages/buddy/src/learning/features/whiteboard/service/store.ts:511-558`, `packages/buddy/src/learning/features/whiteboard/service/store.ts:597-615`
- **Trigger:** Two backend/CLI processes mutate the same session's board concurrently, or two sessions create their first whiteboard concurrently while sharing one notebook.
- **Expected:** Cross-process locks or revisioned compare-and-swap serialize state mutation and shared-index updates; one session maps to exactly one object under every interleaving.
- **Observed in discovery:** Mutation tails are a module-local map. Board mutation is a read-modify-atomic-write sequence with no cross-process revision check. Initial creation writes an object, then separately reads, mutates, and replaces the directory-wide `sessions.json`; different session locks do not serialize that shared index. Two processes can also both observe one session as missing and create separate objects. Rebuild heals a merely lost index entry, but deliberately throws `WhiteboardSessionConflictError` when it discovers duplicate objects for one session.
- **Impact:** Concurrent learner/agent writes can silently overwrite a newer board, different sessions can lose index mappings, and duplicate same-session objects can strand all later reads/edits behind a persistent conflict requiring manual repair.
- **Verification pending:** Barrier concurrent first-create and read/mutate/write phases across same-process different sessions and two independent processes for one session; compare object trees, index, manifests, current/previous boards, returned success, and restart recovery.
- **First-pass confidence:** High on the races; frequency and exact supported multi-process entry points remain to be characterized.

### L10-C07 — P2 — Closing the app can silently discard the last debounced whiteboard edit

- **Locations:** `packages/web/src/components/whiteboard/whiteboard-canvas.tsx:36-38`, `packages/web/src/components/whiteboard/whiteboard-canvas.tsx:183-185`, `packages/web/src/components/whiteboard/whiteboard-canvas.tsx:383-389`, `packages/web/src/components/whiteboard/whiteboard-canvas.tsx:416-443`, `packages/web/src/components/whiteboard/whiteboard-learner-save.ts:25-102`, `packages/web/src/components/whiteboard/whiteboard-pane.tsx:296-326`, compared with `packages/web/src/components/bench/source-file-bench-view.tsx:204-244`
- **Trigger:** Make a learner edit and close/reload Buddy, close the window, or leave the whiteboard during the two-second debounce or an active/retrying save.
- **Expected:** Dirty whiteboard state participates in the Bench/window leave guard, awaits a successful flush before destructive navigation/shutdown, and visibly blocks or preserves a retryable local draft on failure.
- **Observed in discovery:** Edits remain only in the scheduler until its two-second timer fires. Switching to read-only and component cleanup call `flush()` with `void`; unmount cannot await the request, and there is no whiteboard `beforeunload` handler or registered Bench leave guard. The exposed save settler is awaited for sharing, not for general navigation or shutdown. Failed saves are retained only inside the component-local scheduler that is being destroyed.
- **Impact:** The user's most recent drawing changes can disappear without warning even though they were visible on the canvas. A transient backend/network error at close has no durable retry path.
- **Verification pending:** Edit then immediately close Bench, switch session/notebook, reload, close the window, quit the app, and inject slow/failing saves at each boundary; restart and compare the visible draft with persisted board state.
- **First-pass confidence:** High for app/window termination during debounce; ordinary in-app navigation may leave enough time for the fire-and-forget request and must be measured.

### L10-C08 — P2 — Obsidian's case-folded path index can resolve or invalidate the wrong note

- **Locations:** `packages/buddy/src/learning/features/obsidian-vault/service.ts:103-109`, `packages/buddy/src/learning/features/obsidian-vault/service.ts:268-303`, `packages/buddy/src/learning/features/obsidian-vault/service.ts:305-342`, `packages/buddy/src/learning/features/obsidian-vault/service.ts:381-420`, `packages/buddy/src/learning/features/obsidian-vault/service.ts:543-585`, `packages/buddy/src/learning/features/obsidian-vault/service.ts:595-635`
- **Trigger:** On a case-sensitive vault, create distinct files such as `Topic.md` and `topic.md`, then resolve exact-path wikilinks and modify, rename, or delete either file while the index is warm.
- **Expected:** Exact filesystem path/case wins; case-insensitive fallback reports ambiguity instead of collapsing distinct identities, and watcher removal affects only the event's file.
- **Observed in discovery:** Every path key is unconditionally locale-lowercased. `byPath` stores one entry per folded key, so later enumeration/update replaces its case-distinct sibling. Alias metadata is keyed the same way. Removal deletes the folded `byPath` identity, and the final existence check only proves the selected file exists, not that it matches the requested case.
- **Impact:** A wikilink or embedded note can open/display the wrong file, and watcher activity on one sibling can remove or replace the other's resolution. The user can then edit a different note from the one named in source.
- **Verification pending:** Use case-sensitive APFS and supported Windows case-sensitive/WSL-backed fixtures with case-only files, aliases, directory segments, renames, and deletes; assert exact-link results before and after watcher updates and cache rebuilds.
- **First-pass confidence:** High on identity collapse; platform prevalence is lower on default macOS/Windows volumes.

## Verified bugs

Pending second-pass verification.

## Rejected after verification

None yet.

## Discovery coverage with no retained candidate

- Live transcript Markdown output passes through one DOMPurify configuration before insertion, including SVG/MathML handling, executable-element/content removal, event-handler removal, and external-link rel hardening. Markdown Bench's MDX intrinsic renderer independently allowlists elements, attributes, styles, image sources, and fragment-only SVG references. No live/persisted/error sanitizer-parity candidate was retained beyond the separately listed Mermaid queue.
- Markdown PDF export clones the already-rendered Bench DOM into a sandboxed, non-Node hidden window. Local-file and external-resource behavior was traced, but no concrete active source that survives the Bench renderer into a stronger export-only authority was established in discovery, so this remains a verification seam rather than a candidate.
- Mermaid initializes with strict security and sanitizes stored/fresh SVG before inline insertion. Freeform figures remove executable containers, event handlers, and external references and render through `<img>`; generated figure responses add `nosniff`. No separate SVG script-execution candidate was retained.
- HTML-widget adoption canonicalizes the workspace and source, rejects sources outside it, validates relative entry/asset paths, rechecks runtime files against the real source root, bounds source-tree versioning, and uses staging/restore for moves. The retained widget candidate concerns runtime API authority, not source-tree escape.
- Reader source probes reject extension/signature mismatches for PDF/EPUB, raw-file streams close handles on completion/error/abort, and resource preparation stages generations then checks the current generation before promotion. Removal waits for active preparation. The retained resource candidates concern permission containment, active EPUB scripting, and missing workload budgets rather than stale-generation publication.
- Bench targets are strict schemas and URL-owned; the directory workspace lifecycle serializes publication, binds context/action completion to instance/generation/lease epoch, uses monotonic publication sequences and idempotency keys, checks committed target/context agreement, closes outgoing-session context, and applies source-editor leave guards. No stale/wrong-target candidate survived the static pass.
- Whiteboard programs and persisted elements are schema-validated, payloads are capped at 5 MiB, same-process same-session mutations are serialized, and learner writes reject stale board IDs. The retained findings are cross-process/shared-index serialization and client-side unsaved-edit lifecycle.
- Obsidian indexing skips symlink entries and internal/config directories, caps initial entries, serializes watcher updates, invalidates the cache on watcher/update errors, and bounds alias reads. Markdown embeds are capped previews rendered through sanitized non-recursive transcript Markdown, so no symlink escape, watcher-overflow persistence, or recursive-embed candidate was retained.
- Raw notebook HTML/SVG navigation and range serving are already owned by `L04-C07`/`L04-C08`; transport-wide Basic-auth and CORS policy remains seam-owned by `LAUNCH-03`. `L10-C01` is retained here because managed active content is the concrete consumer that crosses that authority boundary.
