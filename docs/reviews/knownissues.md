# Review Known Issues

## Status & Scope

Single cross-cutting tracker for reverified open issues. Historical launch discovery from 2026-07-13 lives in [`docs/ops/launch/bug-audit/2026-07-13/combined.md`](../ops/launch/bug-audit/2026-07-13/combined.md) as a frozen snapshot, not as a second tracker.

Code checks below are 2026-08-30 working-tree reads. Then-resolved launch items (`L03-C06`, `L07-C01`, and the L09 launch blockers in the snapshot) stay in that snapshot.

| ID | Title | Area | Priority | Status |
|---|---|---|---|---|
| **ONB-002** | Directory display drops absolute and UNC root markers | Onboarding | P2 | Open |
| **ONB-003** | ChatGPT choice arrow uses unbounded hover transition | Onboarding | P3 | Open |
| **CHAT-002** | Usage-limit fallback copy promises resets for non-resetting errors | Chat | P2 | Open |
| **CHAT-003** | Terminal Stop actions leave error card unchanged | Chat | P2 | Open |
| **OBS-001** | Obsidian connection updates are not atomic | Obsidian | P2 | Open |
| **OBS-002** | Obsidian feature access and profile disagree on connection state | Obsidian | P2 | Open |
| **OBS-003** | Opening vault from Settings bypasses connection prompt | Obsidian | P2 | Open |
| **IMG-001** | Generated-image reuse TOCTOU can consume unverified bytes | Image Gen | P2 | Open |
| **REN-001** | Rename API can produce a file the editor cannot reopen | Project Files | P2 | Open |
| **WIN-001** | Windows-reserved note names accepted by title validation | Bench / Editor | P2 | Open |
| **GPU-001** | Duplicate live HTML widgets saturate GPU process | HTML Widgets | P1 | Open |
| **DEV-001** | Electron retains obsolete Vite optimized-dependency graph (504) | Desktop Dev | P1 | Open |
| **BENCH-001** | External source files presented on Bench do not open in editor | Bench | P2 | Open |
| **SKILL-001** | Skill activity summary drops loaded skill name | Skills / Chat | P2 | Open |
| **L02-C01** | Raw HTML anchors can navigate the privileged Electron window | Desktop IPC | P0 | Open |
| **L02-C02** | Renderer-controlled electron-store names can escape userData | Desktop IPC | P1 | Open |
| **L02-C03** | Window ownership is a single stale `mainWindow` pointer | Desktop | P2 | Open |
| **L03-C01** | Standalone server fails open without Basic-auth credentials | Auth | P1 | Open |
| **L03-C02** | Embedded backend death after startup is only logged | Desktop | P1 | Open |
| **L03-C03** | Remote Basic-auth secrets are embedded in asset URLs | Auth / Bench | P1 | Open |
| **L03-C04** | OAuth cancel is still best-effort against a completing callback | Auth | P2 | Open |
| **L03-C05** | OAuth callback port 1455 collision poisons later retries | Auth | P1 | Open |
| **L03-C07** | Starter-chat create and first prompt are not one idempotent op | Chat | P2 | Open |
| **L07-C02** | Config and `AGENTS.md` writes are non-atomic replacements | Config | P1 | Open |
| **L07-C03** | Notebook `AGENTS.md` follows a symlink outside the notebook | Permissions | P1 | Open |
| **L07-C04** | Dynamic-tool grant/recompute race whole-ruleset writes | Permissions | P1 | Open |
| **L07-C05** | Parallel skill mutations can drop lock or permission entries | Skills | P1 | Open |
| **L07-C06** | Occupied MCP OAuth port treated as Buddy's callback server | MCP | P2 | Open |
| **L07-C07** | MCP disconnect/Windows shutdown leave descendant processes | MCP | P1 | Open |
| **L08-C06** | Standards SQL row cap runs only after full SQLite materialization | Standards | P1 | Open |
| **L10-C01** | Sandboxed HTML widgets can inherit backend Basic-auth | HTML Widgets | P1 | Open |
| **L10-C02** | `prepare_resource` bypasses external-directory permission | Resources | P1 | Open |
| **L10-C03** | EPUB Foliate frames allow same-origin scripts | Reader | P1 | Open |
| **L10-C04** | Resource prep still lacks deadline/cancel/inflated-byte budgets | Resources | P1 | Open |
| **L10-C05** | Mermaid global render queue is unbounded and uncancellable | Mermaid | P2 | Open |
| **L10-C06** | Whiteboard mutation locks are process-local | Whiteboard | P2 | Open |
| **L10-C07** | App quit can drop the last debounced whiteboard edit | Whiteboard | P2 | Open |

---

## ONB-002: Directory Display Drops Absolute And UNC Roots

- **Behavior:** `pathSegments()` removes leading separators, and the non-home fallback in `describeDirectory()` does not restore them (e.g. `/opt/buddy` -> `opt/buddy`, `//server/share/Buddy` -> `server/share/Buddy`). The current outside-home test codifies the rootless `/opt/buddy` result.
- **Fix:** Parse and retain the path root separately from its segments, carry the POSIX, drive, or UNC prefix through elision, and update the outside-home expectation. Add explicit UNC coverage.
- **Affected:** `packages/web/src/lib/directory-display.ts`, `packages/web/test/directory-display.test.ts`

## ONB-003: ChatGPT Choice Arrow Uses Unbounded Hover Transition

- **Behavior:** `transition-all` and ungated `group-hover` in `EngineScreen` latch on touch-enabled Windows devices.
- **Fix:** Restrict transitions to `transform`, `opacity`, and `color`; gate behind `@media (hover: hover) and (pointer: fine)`.
- **Affected:** `packages/web/src/components/onboarding/cinematic/screens.tsx`

## CHAT-002: Usage-Limit Fallback Copy Promises Resets For Non-Resetting Failures

- **Behavior:** `usageLimitDetail()` instructs users to wait for a reset even on non-resetting payment, balance, or quota errors.
- **Fix:** Instruct waiting only when valid reset timestamp is present; otherwise direct to billing or model selection.
- **Affected:** `packages/web/src/components/chat/assistant-error-card.tsx`, `packages/web/src/state/chat-error-model.ts`

## CHAT-003: Terminal Stop Actions Leave Error Card Unchanged

- **Behavior:** Several terminal assistant-error cards expose **Stop**. The handler aborts the active session run, but a terminal error is already settled. Aborting the idle session does not dismiss or replace the persisted assistant error, so the same card remains after the action.
- **2026-08 check:** `assistant-error-card.tsx` still assigns `id: "stop"` on auth, rate-limit, temporarily-unavailable, and model-unavailable terminal specs. `directory-chat-main-pane.tsx` `handleTerminalAction("stop")` still calls `stopTurn()` / `onStopTurn` / `abortPromptComposer()` with no card dismiss.
- **Fix:** Keep Stop only on live retry notices. Terminal cards should dismiss, open the model selector, or start an explicit recovery flow.
- **Affected:** `packages/web/src/components/chat/assistant-error-card.tsx`, `packages/web/src/components/directory-chat/directory-chat-main-pane.tsx`

## OBS-001: Obsidian Connection Updates Are Not Atomic

- **Behavior:** Config mutation `obsidian_vault.connected` and effective profile query run as separate operations. A failure during profile fetch leaves config enabled while the UI shows an error.
- **Fix:** Expose a single atomic backend operation combining validation, config update, and profile resolution.
- **Affected:** `packages/web/src/state/obsidian-vault-query.ts`, `packages/buddy/src/routes/obsidian.ts`

## OBS-002: Obsidian Feature Access And Profile Disagree On Connection State

- **Behavior:** Profile checks detection + config flag; feature access checks only config. Removing `.obsidian` leaves the agent with the Obsidian skill while UI shows disconnected.
- **Fix:** Enforce a single authoritative connection predicate across profile responses, API authorization, and feature gates.
- **Affected:** `packages/buddy/src/learning/features/obsidian-vault/feature.ts`, `packages/buddy/src/routes/obsidian.ts`

## OBS-003: Opening Vault From Settings Bypasses Connection Prompt

- **Behavior:** Settings opens folders via `openProject`/`activateChatDirectory` directly, bypassing `useOpenExistingNotebook` detection and consent dialogs.
- **Fix:** Unify folder opening under a shared workflow that enforces vault detection and consent.
- **Affected:** `packages/web/src/routes/settings.tsx`, `packages/web/src/lib/use-open-existing-notebook.ts`

## IMG-001: Generated-Image Reuse TOCTOU Can Consume Unverified Bytes

- **Behavior:** Provenance hashes file contents, then later reopen of the same path can send different bytes (and extra I/O near size limits).
- **Fix:** Return and consume the verified bytes or an open file handle so authorization and request construction use the same contents.
- **Affected:** `packages/buddy/src/learning/features/image-generation/service/generated-image-authorization.ts`, `packages/buddy/src/learning/features/image-generation/service/image-inputs.ts`, `packages/buddy/src/learning/features/image-generation/tools/imagegen.ts`

## REN-001: Rename API Can Produce Files Editor Cannot Reopen

- **Behavior:** Rename validates source format but not destination format (`note.md` → `note.png` can succeed, then editable-file read returns 415). Title UI usually preserves `.md`/`.mdx`; SDK and future surfaces still hit the trap.
- **Fix:** Validate destination remains a supported editable format before changing the directory entry.
- **Affected:** `packages/buddy/src/project/project-file-editor-service.ts`

## WIN-001: Windows-Reserved Note Names Accepted By Title Validation

- **Behavior:** Title validator rejects invalid path characters but accepts Windows device names (`CON`, `NUL`, `COM1`, `LPT1`). The rename then fails on Windows filesystems.
- **Fix:** Reject Windows-reserved basenames in shared title validation; add focused cross-platform cases.
- **Affected:** `packages/web/src/components/bench/markdown-bench-note-title.ts`

## GPU-001: Duplicate Live HTML Widgets Saturate GPU Process

- **Behavior:** Transcript tool result and Bench both mount live iframes for the same widget revision. Inline mode still lays out the intrinsic viewport and applies `transform: scale(...)`, so a small card can paint a full Retina canvas. Parked/obscured widgets are not detached. Agent widgets that call `requestAnimationFrame` forever keep the compositor busy. Skills drawer virtualization and catalog payload size make the stall feel like skill loading.
- **Dated evidence (packaged Buddy Dev 0.0.56, macOS ARM64, 2026-07-31):** GPU helper ~95–109% CPU and ~813 MB; main renderer ~3–6% CPU and ~97.6% idle in an eight-second sample; GPU fell to ~1.4–2.5% after leaving the widget task. `GET /api/skills` was 53 ms; the 13.3 s clock in the reproduction was the game widget's fictional timer, not catalog load.
- **2026-08 check:** `HtmlWidgetFrame` still has independent `inline` and `bench` iframe paths; inline still uses `transform: scale(${scale})`; both use `sandbox="allow-scripts"` only. No workspace-level single-live-runtime owner.
- **Fix:** One live iframe per object/revision; dormant inline preview when Bench owns the widget; host-level iframe suspend for parked surfaces; `postMessage` active/inactive/teardown with host fallback; do not rely on CSS scale to cut paint cost; virtualize Skills rows; give the catalog a freshness window and list-sized metadata.
- **Skills drawer rule:** Virtualize the flattened list with stable domain keys, use the real inner list element as its single scroll parent rather than the shell's outer container, and preserve scroll restoration.
- **Interim workaround:** Until the host lifecycle is fixed, close or navigate away from continuously animated HTML widgets before opening large drawers, and avoid keeping the same live widget visible in both Bench and the transcript. This is only a workaround; users should not need to manage compositor load manually.
- **Rejected alternative:** Disabling hardware acceleration is not the recommended solution.
- **Acceptance:** At most one live iframe per object/revision; parked widgets stop producing frames without widget cooperation; GPU helper near idle when the widget is inactive; hostile non-pausing test widget is covered.
- **Affected:** `packages/web/src/components/media/renderers/html-widget-frame.tsx`, `packages/web/src/components/media/renderers/html-media.tsx`, `packages/web/src/components/chat/tools/render/html-widget/index.tsx`, `packages/web/src/components/bench/surfaces/object-bench-surface.tsx`, `packages/web/src/lib/bench-surface-keep-alive.ts`, `packages/web/src/components/directory-chat/right-workspace-skills-drawer.tsx`, `packages/web/src/state/skills-catalog-query.ts`, `packages/buddy/src/learning/skill-management/service/catalog.ts`

## DEV-001: Electron Retains Obsolete Vite Optimized-Dependency Graph (504)

- **Behavior:** While `bun dev:desktop` runs, Vite may regenerate optimized deps. Electron's persistent HTTP cache can keep an older parent such as `@mdxeditor_editor.js?v=<hash>` that still imports a dead chunk. Reload then fails with `504 Outdated Optimize Dep` while `app.tsx` is reported as a failed dynamic import and the backend may still be healthy. Restarting Vite or the Buddy backend does not clear the renderer disk cache. Production packaged builds do not use this optimizer.
- **Confirmed chain:** Electron caches an immutable optimized parent → parent references `chunk-….js` → Vite regenerates a new chunk name → same parent URL is reused from cache → child 504.
- **Immediate recovery:** DevTools → Network → Disable cache → reload renderer.
- **2026-08 check:** No development-mode `session.clearCache` / HTTP-cache disable found under `packages/desktop-electron/src`.
- **Fix:** Disable the renderer HTTP cache in development, or clear it before loading the Vite URL, plus a one-shot Outdated-Optimize-Dep recovery with a loop guard. Distinguish backend-init failures from frontend module-load failures in the bootstrap error boundary.
- **Affected:** `packages/desktop-electron/src/`

## BENCH-001: External Source Files Presented On Bench Do Not Open In Editor

- **Behavior:** `bench_present` of an approved external `.tsx`/`.md`/`.json` (or similar) shows an unopenable generic file card (icon, filename, absolute path). Workspace files use the source editor; images/PDF/SVG have previews; raw HTML is rejected into the widget flow.
- **2026-08 check:** `object-bench-surface.tsx` still maps `media-presentation` to the media surface and documents the external file as read-only (“use its default app to edit it”). Product contract (view-only vs save-back) is still undecided.
- **Fix:** Decide view-only vs editable external sources, then route readable text/code to the editor (or an explicit read-only source view) instead of the generic media card. Keep the external-directory permission boundary.
- **Affected:** `packages/web/src/components/bench/surfaces/object-bench-surface.tsx`, `packages/web/src/components/bench/source-file-bench-view.tsx`

## SKILL-001: Skill Activity Summary Drops Loaded Skill Name

- **Behavior:** The shared skill title helpers still return generic `Using Skill`
  and `Skill Used` copy. The skill renderer can derive a subject, but settled
  activity-row aggregation uses the generic `load-skills` category label and can
  omit which skill was loaded, especially when multiple skills are grouped.
- **2026-08 check:** `skill-reference.ts` keeps the generic title and row-action
  helpers; `tool-info.ts` may add the loaded name as a subtitle, while
  `activity-row/entries.ts` aggregates settled activity by category summary.
- **Fix:** Preserve the resolved loaded skill name in the activity summary/row
  when available; retain the generic fallback only when no name is available.
- **Affected:** `packages/web/src/components/chat/tools/skill-reference.ts`,
  `packages/web/src/components/chat/tools/activity-row/entries.ts`,
  `packages/web/src/components/chat/tools/render/skill.tsx`

---

## L02-C01: Raw HTML Can Navigate The Privileged App Window

- **Behavior:** Assistant HTML that is not classed `external-link` is skipped by renderer click handling. Main `BrowserWindow` still has no `will-navigate` / `setWindowOpenHandler` (those exist only on the in-app browser guest). Preload still exposes `window.api`.
- **2026-08 check:** `packages/desktop-electron/src/renderer/index.tsx` still keys off `a.external-link`; `windows.ts` has no navigation guard.
- **Fix:** Block in-window navigation and popups on the privileged window; open allowed external URLs via OS browser; never leave preload APIs on a remote origin.
- **Affected:** `packages/web/src/components/markdown/markdown-html-segment.tsx`, `packages/desktop-electron/src/renderer/index.tsx`, `packages/desktop-electron/src/main/windows.ts`, `packages/desktop-electron/src/preload/index.ts`

## L02-C02: Store IPC Names Escape userData

- **Behavior:** `store-get` / `set` / `delete` / `clear` / `keys` / `length` pass renderer `name` into `new Store({ name })` with no allowlist. `conf` treats the name as a filesystem path.
- **2026-08 check:** `packages/desktop-electron/src/main/store.ts` and `ipc.ts` unchanged.
- **Fix:** Allow only Buddy-owned store namespaces under `userData`.
- **Affected:** `packages/desktop-electron/src/main/store.ts`, `packages/desktop-electron/src/main/ipc.ts`, `packages/desktop-electron/src/preload/index.ts`

## L02-C03: Stale Single-Window Pointer

- **Behavior:** `let mainWindow` is still the routing target for deep links, update progress, menu commands, and reload. Hardening's Buddy window registry was discarded; vendor desktop owns the real multi-window pattern.
- **2026-08 check:** `packages/desktop-electron/src/main/index.ts` still uses a single `mainWindow`.
- **Fix:** Adopt vendored OpenCode window-registry / last-focused routing. Do not reintroduce a parallel Buddy lifecycle monitor.
- **Affected:** `packages/desktop-electron/src/main/index.ts`, `packages/desktop-electron/src/main/menu.ts`

## L03-C01: Standalone Server Fails Open Without Credentials

- **Behavior:** API auth middleware calls `next()` when username or password env is missing. App CORS is `origin: "*"`.
- **2026-08 check:** `packages/buddy/src/app.ts` still bypasses auth when either env is absent and still uses wildcard CORS.
- **Fix:** Fail closed on incomplete credentials; require explicit config for non-loopback binds.
- **Affected:** `packages/buddy/src/app.ts`

## L03-C02: Embedded Backend Death Is Only Logged

- **Behavior:** After first health success, utility `terminated` is logged; the child is not cleared/restarted and the renderer is not notified. Hardening's Buddy supervisor was discarded because vendored desktop owns sidecar lifecycle.
- **Fix:** Product decision vs vendor desktop parity; if Buddy needs stronger recovery, implement it as an explicit desktop feature with packaged tests, not a duplicate supervisor.
- **Affected:** `packages/desktop-electron/src/main/index.ts`

## L03-C03: Basic-Auth Secrets In Asset URLs And Bench Context

- **Behavior:** For non-embedded authenticated servers, `applyAuthToUrl` writes username/password into URL userinfo. `resolveAssetUrl` uses that for DOM `src`. Bench context can retain `kind: "url"` refs.
- **2026-08 check:** `packages/web/src/lib/server-client.ts` `applyAuthToUrl`; `packages/web/src/lib/resource-url.ts`; Bench surfaces still `resolveAssetUrl`.
- **Fix:** Keep credentials in headers or a scoped asset token; never put them in user-visible URLs or persisted context.
- **Affected:** `packages/web/src/lib/server-client.ts`, `packages/web/src/lib/resource-url.ts`, `packages/web/src/components/bench/surfaces/`

## L03-C04: OAuth Cancel Remains Best-Effort

- **Lesson:** 2026-07-13 found UI cancel that never called the server cancel route. 2026-08: `onboarding-flow.ts` now races `completeProviderOAuth` against abort and calls `cancelProviderOAuth`, documented as best-effort if the callback already settled. `connect-provider-dialog.tsx` also cancels. Residual: a late callback can still win the race; headless device-code polling must still honor cancel.
- **Fix:** Cancel must abort listen/poll and guarantee no later credential write.
- **Affected:** `packages/web/src/lib/onboarding-flow.ts`, `packages/buddy/src/opencode-runtime/plugins/openai-codex-auth.ts`

## L03-C05: Fixed OAuth Port 1455 Collision

- **Behavior:** Callback server still binds `OAUTH_PORT = 1455`. If `oauthServer` is already set, later attempts reuse it and return a redirect URI even when listen failed.
- **2026-08 check:** `openai-codex-auth.ts` still uses the fixed port and `callback_server_reused` path.
- **Fix:** Bind an available loopback port or fail cleanly and reset the global so retry works without process restart.
- **Affected:** `packages/buddy/src/opencode-runtime/plugins/openai-codex-auth.ts`

## L03-C07: Starter Chat Create Then Prompt

- **Behavior:** `onStartGetStartedChat` still commits a new session, then `sendRuntimePrompt` separately. Failure leaves the session; retry creates another.
- **2026-08 check:** `use-directory-chat-page-controller.ts` still uses that two-step sequence.
- **Fix:** One idempotent create+prompt with retry identity.
- **Affected:** `packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts`

## L07-C02: Non-Atomic Config And AGENTS.md Writes

- **Behavior:** `write-config.ts` still `writeFile`s the authoritative path. `agents-md/service.ts` `saveAgentsMd` still `writeFile`s the target with no temp+rename.
- **Fix:** Sibling temp, flush, atomic rename; never promote a truncated document.
- **Affected:** `packages/buddy/src/config/store/write-config.ts`, `packages/buddy/src/agents-md/service.ts`

## L07-C03: AGENTS.md Symlink Escape

- **Behavior:** `resolveNotebookAgentsMdPath` is `path.join(directory, "AGENTS.md")` then ordinary `readFile`/`writeFile` with no `lstat`/`realpath` containment.
- **2026-08 check:** `packages/buddy/src/agents-md/service.ts` still has no symlink check.
- **Fix:** Reject links/junctions or require canonical target inside the notebook before read/write.
- **Affected:** `packages/buddy/src/agents-md/service.ts`, `packages/buddy/src/routes/agents-md.ts`

## L07-C04 / L07-C05: Permission And Skill Whole-Document Races

- **Behavior:** Dynamic-tool grant/clear/recompute still replace the whole session permission array without a shared revision CAS. Skill install/remove still rewrite lockfile and permission maps in separate unsynchronized steps.
- **Fix:** Serialize per session/skill identity; one transaction for tree + lock + permissions.
- **Affected:** `packages/buddy/src/learning/runtime/dynamic-tool-grants.ts`, `packages/buddy/src/learning/skill-management/service/`

## L07-C06 / L07-C07: MCP Callback Port And Process Trees

- **Behavior:** Vendored MCP OAuth `ensureRunning` treats any listener on the callback port as success. Disconnect/`client.close()` does not kill Windows descendant processes (collector empty on Windows).
- **Fix:** Prove ownership of the callback server or fail immediately. Terminate the MCP process tree on disconnect/shutdown with a bounded cross-platform policy. Do not add a Buddy-owned parallel process monitor on top of OpenCode if OpenCode owns MCP runtime — adopt the vendor pattern or leave the finding open.
- **Affected:** `vendor/opencode/packages/opencode/src/mcp/` (vendor-owned; Buddy tracks the product gap)

## L08-C06: Standards SQL Row Cap After Full Materialization

- **Behavior:** `KnowledgeGraphService.runSqlQuery` still `prepare(sql).all()` then `rawRows.slice(0, rowLimit)` in JavaScript. The cap does not bound SQLite work or peak memory.
- **2026-08 check:** `packages/buddy/src/learning/features/standards/service.ts` `runSqlQuery` still materializes `rawRows` before slicing. Full diagnosis: [`docs/features/standards/known-issues.md`](../features/standards/known-issues.md).
- **Fix:** Engine-level `LIMIT` or statement/memory budget before materializing rows.
- **Affected:** `packages/buddy/src/learning/features/standards/service.ts`, `packages/buddy/src/learning/features/standards/tools/query-standards-sql.ts`

## L10-C01: Widget Frames Inherit Backend Auth

- **Behavior:** Widget iframes use `sandbox="allow-scripts"` (no `allow-same-origin`). The document is still served from the Buddy origin; Electron `onBeforeSendHeaders` injects Basic auth for every matching origin with no frame/initiator check; API CORS is `*`.
- **2026-08 check:** `html-widget-frame.tsx` sandbox unchanged; `backend-auth.ts` still origin-only; `app.ts` wildcard CORS unchanged.
- **Fix:** Deny widget network to the Buddy API, or a capability bridge that never receives ambient Basic auth. Filter `onBeforeSendHeaders` by resource type / frame.
- **Affected:** `packages/web/src/components/media/renderers/html-widget-frame.tsx`, `packages/desktop-electron/src/main/backend-auth.ts`, `packages/buddy/src/app.ts`, `packages/buddy/src/routes/object-html-widget.ts`

## L10-C02: prepare_resource External Path Bypass

- **Behavior:** Tool permission is `prepare_resource:*`; copy/stat follow symlinks without `external_directory`.
- **Fix:** Canonicalize, then the same external-directory authorizer used by workspace tools.
- **Affected:** `packages/buddy/src/learning/features/reading/tools/prepare-resource.ts`, `packages/buddy/src/resources/resource-registry-service.ts`

## L10-C03: Foliate EPUB Script Isolation

- **Behavior:** Foliate content iframes historically use `sandbox="allow-same-origin allow-scripts"`; JS resources default allow; Buddy does not register a deny-scripts transform before `open`.
- **2026-08 check:** No Buddy-side sandbox or script-deny hook in `packages/web/src/components/readers`. Isolation still depends on `foliate-js`.
- **Fix:** Strip or deny EPUB scripts before load; do not grant same-origin + scripts to publication content.
- **Affected:** `packages/web/src/components/readers/foliate-reader.tsx`, Foliate view/epub loader

## L10-C04: Resource Budgets Incomplete

- **Lesson:** 2026-07-14 kept source/archive/page/chunk ceilings and removed a global queue that blocked every notebook. Still missing wall-clock deadline, cooperative parser/subprocess cancel, actual inflated-byte accounting, and a justified concurrency owner.
- **Fix:** Add those at the Buddy resource/parser owners. Do not restore a module-global promise tail.
- **Affected:** `packages/buddy/src/resources/`, `packages/buddy/src/resource-packs/`

## L10-C05: Unbounded Mermaid Render Queue

- **Behavior:** Global scheduler concurrency 1, unbounded distinct-key queue; unmount only ignores results.
- **Fix:** Bound queue length/age; drop superseded keys; abort unmounted work.
- **Affected:** `packages/web/src/components/media/renderers/mermaid/lib/scheduler.ts`

## L10-C06 / L10-C07: Whiteboard Locks And Quit Loss

- **Behavior:** Mutation tails are process-local. Learner edits debounce (~2s); unmount `flush()` is `void` and there is no `beforeunload`/Bench leave guard for dirty boards.
- **2026-08 check:** `whiteboard-canvas.tsx` still `void saveSchedulerRef.current.flush()` on cleanup.
- **Fix:** Cross-process revision CAS for board+index; await flush on quit/navigation; keep a retryable draft on failure.
- **Affected:** `packages/buddy/src/learning/features/whiteboard/service/store.ts`, `packages/web/src/components/whiteboard/whiteboard-canvas.tsx`, `packages/web/src/components/whiteboard/whiteboard-learner-save.ts`
