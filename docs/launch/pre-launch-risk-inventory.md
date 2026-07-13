# Pre-launch top-10 risk inventory

## Purpose

This is the source inventory for a one-time, pre-launch bug-finding campaign against the current Buddy product. It is not based on recent Git changes, and it does not reuse the old Bugeera weekly inventory as its source of truth.

The former 30-unit inventory was compacted into 10 end-to-end risk domains on 2026-07-13. Compaction changes review ownership, not scope: every former unit maps to exactly one domain below.

The audit starts from a clean worktree at a named release-candidate commit. Paths are review seeds, not limits. Each investigation must trace callers, callees, persistence, IPC or HTTP boundaries, renderer behavior, platform differences, and recovery paths end to end.

This document inventories risk. It does not claim that any listed surface currently contains a bug.

## Risk tiers

- **Critical:** a defect could enable unintended host authority, expose credentials, execute untrusted content, corrupt or overwrite durable user data, apply an action to the wrong notebook or session, undermine update trust, or prevent installation/startup/recovery for a meaningful share of users.
- **High:** a defect could break a primary advertised workflow, persist materially incorrect state, create bounded data loss, strand the user in an unrecoverable UI/runtime state, or fail under normal concurrency and restart conditions.

No medium- or low-risk domains are included. Visual polish, copy quality, and prompt pedagogy belong in separate launch reviews unless they directly participate in a boundary below.

## Required review lenses

Every domain must be investigated through all applicable lenses:

1. **Authority:** What untrusted input can reach the filesystem, processes, credentials, network, native OS, renderer, or agent tools?
2. **Integrity:** What can be lost, duplicated, partially written, attributed to the wrong identity, or left inconsistent?
3. **Lifecycle:** What happens on abort, timeout, disconnect, crash, restart, update, cancellation, and partial completion?
4. **Contract:** Do the web, SDK, HTTP, Electron, Buddy runtime, and vendored runtime layers agree about identity, validation, errors, and success?
5. **Platform:** Do macOS and Windows paths, process behavior, file locking, packaging, and installers behave equivalently?
6. **Load:** Are queues, caches, watchers, streams, parsers, and background jobs bounded and predictable?

## Compaction map

“Former units” refers to the pre-compaction 30-unit inventory.

| Current domain | Former units absorbed |
|---|---|
| `LAUNCH-01` | `01` |
| `LAUNCH-02` | `02` |
| `LAUNCH-03` | `03`, `06`, `29` |
| `LAUNCH-04` | `04`, `07`, `08`, `30` |
| `LAUNCH-05` | `05` |
| `LAUNCH-06` | `09`, `10`, `12` |
| `LAUNCH-07` | `11`, `13`, `14`, `15`, `25` |
| `LAUNCH-08` | `16`, `17` |
| `LAUNCH-09` | `18`, `19`, `26`, `27` |
| `LAUNCH-10` | `20`, `21`, `22`, `23`, `24`, `28` |

Every former unit appears once; no former unit was dropped.

## Inventory summary

| ID | Audit domain | Tier | Primary consequence |
|---|---|---|---|
| `LAUNCH-01` | Release packaging, installation, and first startup | Critical | Users cannot install or launch the shipped application |
| `LAUNCH-02` | Electron windows, preload, and native IPC authority | Critical | Renderer-controlled input reaches unrestricted native capabilities |
| `LAUNCH-03` | Backend exposure, credentials, OAuth, onboarding, and first response | Critical | API or credential authority leaks, or a new user cannot complete first use |
| `LAUNCH-04` | Durable storage, workspace/file identity, migrations, and API scope | Critical | State is lost or an operation crosses its authorized notebook/file boundary |
| `LAUNCH-05` | Desktop update, signature, install, and recovery lifecycle | Critical | A broken/untrusted update is accepted or recovery strands the app |
| `LAUNCH-06` | Session execution, events, transcript reconciliation, and runtime isolation | Critical | Work executes or reconciles against the wrong session, directory, or runtime |
| `LAUNCH-07` | Capability/config compilation, permissions, MCP, and skills | Critical | Agents or extensions gain missing, excessive, or mis-scoped authority |
| `LAUNCH-08` | Advanced-math and standards execution/data runtimes | Critical | Downloaded runtimes or model-authored execution escape trust and resource bounds |
| `LAUNCH-09` | Learning workspace, managed objects, memory, curriculum, and assessment state | Critical | Learner files, artifacts, memories, or records are corrupted or misattributed |
| `LAUNCH-10` | Active content, resource ingestion, Bench, whiteboard, and Obsidian surfaces | Critical | Hostile content executes/exhausts parsers or UI acts on stale/wrong targets |

## Detailed audit domains

### `LAUNCH-01` — Release packaging, installation, and first startup

**Boundary:** Build artifacts, packaged resources, platform installers, application bootstrap, SQLite availability, and the transition from no process to a usable product.

**Primary code seeds:**

- `package.json`, `bun.lock`, `turbo.json`
- `.github/workflows/publish-shared.yml`
- `packages/desktop-electron/electron-builder.config.ts`
- `packages/desktop-electron/src/main/index.ts`
- `packages/desktop-electron/src/main/backend-utility.ts`
- `packages/desktop-electron/src/main/cli.ts`
- `packages/desktop-electron/src/main/storage-paths.ts`
- `packages/desktop-electron/test/release-smoke-target.test.ts`
- `packages/desktop-electron/test/electron-builder-config.test.ts`
- `packages/script/src/channel.ts`
- `script/install-release.sh`, `script/install-latest-release.sh`

**Audit focus:** Packaged asset addressing; target architecture; signing/notarization and SmartScreen/Gatekeeper; first-run directories; `node:sqlite`; backend readiness; loading-window and port races; cleanup after failed startup; executable/install paths; clean install versus install-over-existing; actionable startup failure.

### `LAUNCH-02` — Electron windows, preload, and native IPC authority

**Boundary:** BrowserWindow navigation and lifecycle plus everything exposed through `window.api`: stores, pickers, links, path/app opening, clipboard, notifications, PDF export, updater controls, WSL conversion, zoom/titlebar, and relaunch.

**Primary code seeds:**

- `packages/desktop-electron/src/preload/index.ts`
- `packages/desktop-electron/src/preload/types.ts`
- `packages/desktop-electron/src/main/ipc.ts`
- `packages/desktop-electron/src/main/windows.ts`
- `packages/desktop-electron/src/main/menu.ts`
- `packages/desktop-electron/src/main/store.ts`
- `packages/desktop-electron/src/main/apps.ts`
- `packages/desktop-electron/src/main/markdown-pdf.ts`
- `packages/desktop-electron/src/main/markdown-pdf-path.ts`
- `packages/desktop-electron/src/renderer/index.tsx`
- `packages/web/src/context/platform.tsx`
- `packages/web/src/components/markdown/`

**Audit focus:** Every IPC argument and sender; renderer-compromise blast radius; sandbox assumptions; navigation/popups; raw Markdown-to-native transitions; store namespaces; URL/path/app opening; window ownership and close/reopen behavior; dropped-file identity; handler cleanup; PDF containment; Windows quoting and WSL paths.

### `LAUNCH-03` — Backend exposure, credentials, OAuth, onboarding, and first response

**Former units absorbed:** Backend transport (`03`), provider credentials/OAuth (`06`), onboarding/first chat (`29`).

**Boundary:** Hono binding/auth/CORS, Electron header injection, browser/desktop/remote clients, provider credentials and OAuth callbacks, deep links, account/model state, onboarding persistence, starter chats, and the first real response.

**Primary code seeds:**

- `packages/buddy/src/app.ts`, `packages/buddy/src/node.ts`, `packages/buddy/src/node-server.ts`
- `packages/buddy/src/routes/auth.ts`, `packages/buddy/src/routes/provider.ts`
- `packages/buddy/src/opencode-runtime/plugins/openai-codex-*.ts`
- `packages/opencode-adapter/src/auth.ts`, `packages/opencode-adapter/src/provider-auth.ts`
- `packages/desktop-electron/src/main/backend-auth.ts`, `packages/desktop-electron/src/main/server.ts`
- `packages/desktop-electron/src/main/index.ts`, `packages/desktop-electron/src/renderer/server.ts`
- `packages/web/src/context/server.tsx`, `packages/web/src/lib/server-client.ts`
- `packages/web/src/lib/provider-*.ts`, `packages/web/src/components/connect-provider-dialog.tsx`
- `packages/web/src/routes/onboarding.tsx`, `packages/web/src/state/onboarding-store.ts`
- `packages/web/src/lib/onboarding-*.ts`, `packages/web/src/lib/get-started-chats.ts`
- `packages/web/src/routes/chat.tsx`

**Audit focus:** Authentication-off and non-loopback behavior; wildcard CORS/TLS/origin assumptions; credential attachment/leakage; backend death/reconnect; secrets in URLs/logs/state; OAuth state correlation, replay, overlap, cancel and deep-link validation; logout completeness; stale provider/model caches; restart at every onboarding step; duplicate starter sessions; first prompt exactly once in the intended notebook; offline/expired/rate-limit recovery.

### `LAUNCH-04` — Durable storage, workspace/file identity, migrations, and API scope

**Former units absorbed:** Runtime storage (`04`), notebook identity (`07`), project files (`08`), typed SDK/cache identity (`30`).

**Boundary:** XDG and Buddy/OpenCode roots, SQLite/auth persistence, canonical notebook identity and allowed roots, registry lifecycle, file read/write/raw serving/native open, generated SDK composition, and directory-scoped query/client caches.

**Primary code seeds:**

- `packages/script/src/storage-env.ts`, `packages/script/src/channel.ts`
- `packages/desktop-electron/src/main/storage-paths.ts`, `packages/desktop-electron/src/main/cli.ts`
- `packages/buddy/src/storage/`, `packages/buddy/src/sqlite/`, `packages/buddy/migration/`
- `packages/buddy/src/opencode-runtime/env.ts`, `packages/buddy/src/opencode-runtime/legacy-migration-repair.ts`
- `packages/buddy/src/http/directory.ts`, `packages/buddy/src/project/`
- `packages/buddy/src/project/project-file-editor-service.ts`
- `packages/buddy/src/project/raw-file-response-service.ts`
- `packages/workspace-file-policy/src/index.ts`
- `packages/buddy/src/routes/project.ts`, `packages/buddy/src/routes/open-projects.ts`
- `packages/sdk/`, `packages/web/src/lib/buddy-client.ts`, `packages/web/src/state/*query.ts`
- `packages/web/src/components/project-explorer/`, `packages/web/src/lib/workspace-file-*.ts`

**Audit focus:** Clean/upgrade path selection; legacy migration; atomic and cross-process writes; channel collision; canonical/nonexistent/symlink/case/encoded/Windows paths; allowed-root and registry recovery; traversal and optimistic-write races; raw MIME/range/active-content behavior; external edits/watchers; header/query directory agreement; query-key/client reuse; retries of non-idempotent operations. Base URL/auth composition is seam-tested in `LAUNCH-03`; streaming/error parity is seam-tested in `LAUNCH-06`.

### `LAUNCH-05` — Desktop update, signature, install, and recovery lifecycle

**Boundary:** Update rings, signed manifests, asset selection, download/install state, macOS custom installer, Windows feed/NSIS handoff, blocked versions, startup recovery, and UI progress.

**Primary code seeds:**

- `packages/desktop-electron/src/main/update-common.ts`
- `packages/desktop-electron/src/main/custom-mac-updater.ts`
- `packages/desktop-electron/resources/mac-install-update.sh`
- `packages/desktop-electron/src/main/windows-update-feed.ts`
- `packages/desktop-electron/src/main/recovery-policy.ts`
- `packages/desktop-electron/src/main/recovery-policy-core.ts`
- `packages/desktop-electron/src/main/update-ring.ts`
- `packages/desktop-electron/src/main/index.ts`
- `packages/desktop-electron/src/shared/update-state.ts`
- `packages/desktop-electron/src/renderer/updater.ts`
- `packages/web/src/lib/desktop-updates.ts`
- `packages/web/src/components/settings/settings-updates.tsx`
- `packages/script/src/minisign.ts`

**Audit focus:** Signature/key failures; substitution, rollback, replay and ring switching; concurrent checks; bounded/streaming downloads; truthful install handoff; backend shutdown; crash between installer stages; atomic replacement; blocked-version persistence; recovery-policy operations; headless startup recovery; macOS/Windows parity; offline and partial downloads.

### `LAUNCH-06` — Session execution, events, transcript reconciliation, and runtime isolation

**Former units absorbed:** Session mutations (`09`), event/transcript streaming (`10`), vendored runtime isolation (`12`).

**Boundary:** Session create/list/get, prompt/command/async execution, abort/summarize/fork/revert, teaching state, backend SSE and file events, frontend reconnect/coalescing/optimism/pagination, in-process vendored server patches, overlays, instance scoping, plugins, and shutdown.

**Primary code seeds:**

- `packages/buddy/src/routes/session.ts`, `packages/buddy/src/session/`, `packages/buddy/src/http/session.ts`
- `packages/buddy/src/learning/adapters/http/session/`
- `packages/buddy/src/http/opencode-event-stream.ts`
- `packages/buddy/src/opencode-runtime/`
- `packages/opencode-adapter/src/session*.ts`, `packages/opencode-adapter/src/app-runtime.ts`
- `packages/opencode-adapter/src/config-overlay.ts`, `packages/opencode-adapter/src/instance.ts`
- `packages/opencode-adapter/src/plugin-live.ts`, `packages/opencode-adapter/src/registry.ts`
- `packages/web/src/state/chat-actions.ts`, `packages/web/src/state/session-status.ts`
- `packages/web/src/state/chat-sync.ts`, `packages/web/src/state/chat-stream-event-buffer.ts`
- `packages/web/src/state/transcript-repository.ts`, `packages/web/src/state/chat-reducer.ts`

**Audit focus:** Session/directory ownership; duplicate submission and async truth; abort with tools/subagents; fork/revert file effects; compaction while streaming; restart after partial execution; SSE framing/order/dedup/reconnect gaps; orphan parts and optimistic promotion; cache eviction and high-rate bounds; one-time patching; global mutable state; overlay cleanup; concurrent directories; plugin failure; cross-notebook session/tool/credential leakage.

### `LAUNCH-07` — Capability/config compilation, permissions, MCP, and skills

**Former units absorbed:** Capability compilation (`11`), permissions (`13`), MCP (`14`), skills (`15`), config/settings/`AGENTS.md` (`25`).

**Boundary:** Persona/feature/tool/skill/subagent composition, dynamic discovery/grants, JSONC/global/project config and settings autosave, `AGENTS.md`, runtime permission compilation and durable overrides, pending approval UX, external-directory authority, MCP local/remote/OAuth lifecycle, and skill discovery/catalog/signature/install/update/remove.

**Primary code seeds:**

- `packages/buddy/src/learning/features/index.ts`, `packages/buddy/src/learning/personas/`
- `packages/buddy/src/learning/runtime/`, `packages/buddy/src/learning/access/`
- `packages/buddy/src/learning/agent-execution/`
- `packages/buddy/src/opencode-runtime/subagent-*.ts`
- `packages/buddy/src/config/`, `packages/buddy/src/agents-md/`
- `packages/buddy/src/routes/config.ts`, `packages/buddy/src/routes/global.ts`, `packages/buddy/src/routes/agents-md.ts`
- `packages/web/src/state/general-settings*.ts`, `packages/web/src/state/settings-autosave.ts`
- `packages/web/src/state/personalization-settings*.ts`, `packages/web/src/state/agents-md-*.ts`
- `packages/buddy/src/routes/permission.ts`, `packages/buddy/src/config/store/permission-overrides.ts`
- `packages/buddy/src/routes/mcp.ts`, `packages/opencode-adapter/src/mcp*.ts`
- `packages/web/src/components/mcp-dialog/`, `packages/web/src/state/mcp-*.ts`
- `packages/buddy/src/learning/skill-management/`, `packages/buddy/src/routes/skills.ts`
- `packages/buddy/src/opencode-runtime/skill-filtering.ts`
- `packages/opencode-adapter/src/skill*.ts`
- `packages/web/src/components/skills/`, `packages/web/src/state/skills-*.ts`

**Audit focus:** Default deny and persona override; disabled/experimental leakage; discovery versus execution authority; subagent inheritance; recomputation during sessions; config precedence/scope/patch semantics/comment preservation; concurrent autosaves and stale drafts; atomic config writes/corruption recovery; credentials in config; `AGENTS.md` scope/traversal; approval identity/scope/staleness and `once`/`always`; symlink/canonical changes; MCP command/env/network authority, OAuth state and process cleanup; malicious metadata/schema; signature/revision/rollback/pinned commit; archive/tree/symlink limits; atomic skill replacement and live-session refresh.

### `LAUNCH-08` — Advanced-math and standards execution/data runtimes

**Former units absorbed:** Advanced math (`16`), standards dataset/SQL (`17`).

**Boundary:** Signed/checksummed runtime and dataset download, archive extraction, install/repair/remove state, executable self-check, Python execution, sanitized environment, process abort/timeouts/artifacts, SQLite activation/locking, and read-only standards SQL.

**Primary code seeds:**

- `packages/buddy/src/local-runtimes/advanced-math/`
- `packages/buddy/src/learning/features/calculator/`
- `packages/buddy/src/local-runtimes/standards/`
- `packages/buddy/src/learning/features/standards/`
- `packages/buddy/src/routes/local-runtimes.ts`
- `packages/buddy/script/build-advanced-math-runtime.ts`
- `packages/buddy/script/build-knowledge-graph.ts`
- `packages/web/src/state/advanced-math-runtime.ts`
- `packages/web/src/state/standards-runtime.ts`
- `packages/web/src/components/settings/use-advanced-math-runtime.ts`

**Audit focus:** Supply-chain trust; traversal/bombs/partial installs/stale locks; concurrent use and removal; process-tree termination; filesystem/network/import authority; secret stripping; artifact validation/limits; stdout/stderr and timeout bounds; SQLite handles during replacement; SQL parser bypass, PRAGMA/attach/extensions/recursive load and output bounds; corrupted dataset recovery; Windows file locks.

### `LAUNCH-09` — Learning workspace, managed objects, memory, curriculum, and assessment state

**Former units absorbed:** Lesson workspace (`18`), managed objects (`19`), learner memory (`26`), flashcards/question sets/curriculum/assessment (`27`).

**Boundary:** Lesson files/checkpoints/restores, `.buddy/objects/v1` manifests/indexes/revisions/deletion, memory consent/ingestion/events/indexes/consolidation/retrieval, and durable learning goals, decks, reviews, question attempts, scoring, schedules, and assessment ingestion.

**Primary code seeds:**

- `packages/buddy/src/learning/features/lesson-workspace/`
- `packages/buddy/src/learning/adapters/http/lesson-workspace/`
- `packages/buddy/src/objects/`, `packages/buddy/src/routes/objects.ts`, `packages/buddy/src/routes/object-*.ts`
- `packages/buddy/src/learning/features/memory/`, `packages/buddy/src/routes/learner.ts`
- `packages/buddy/src/learning/features/flashcards/`
- `packages/buddy/src/learning/features/question-sets/`
- `packages/buddy/src/learning/features/curriculum*/`
- `packages/buddy/src/learning/features/practice/`, `packages/buddy/src/learning/features/assessment/`
- `packages/web/src/state/teaching-*.ts`, `packages/web/src/components/teaching/`
- `packages/web/src/state/workspace-objects-query.ts`
- `packages/web/src/lib/learner-memory.ts`, `packages/web/src/state/learner-memory-settings.ts`
- `packages/web/src/components/flashcard/`

**Audit focus:** Path/workspace/session identity; multi-file atomicity; restore over newer work; concurrent user/agent edits; staging/rename/backup/index recovery; object ID/kind/revision consistency; deletion during reads; memory opt-in and disabled leakage; duplicate/misattributed ingestion; JSONL/index corruption; consolidation loss/redaction/deletion; duplicate review/attempt submission; time-zone scheduling; exact scoring; partial persistence and UI truth.

### `LAUNCH-10` — Active content, resource ingestion, Bench, whiteboard, and Obsidian surfaces

**Former units absorbed:** Renderers (`20`), HTML widgets (`21`), resources/readers (`22`), Bench (`23`), whiteboard (`24`), Obsidian (`28`).

**Boundary:** Markdown/Mermaid/SVG rendering, managed active HTML widgets and CSP/iframe runtime, document/media import and extraction/OCR/readers, Bench route/store/context/client-action leases, whiteboard programs/progressive persistence/sharing, and Obsidian indexing/watchers/wikilinks/embeds.

**Primary code seeds:**

- `packages/web/src/components/markdown/`, `packages/web/src/components/media/renderers/mermaid/`
- `packages/web/src/lib/svg-media.ts`
- `packages/buddy/src/learning/features/diagrams/`, `packages/buddy/src/learning/features/figure-rendering/`
- `packages/buddy/src/learning/features/html-widgets/`, `packages/buddy/src/routes/object-html-widget.ts`
- `packages/buddy/src/resources/`, `packages/buddy/src/resource-packs/`
- `packages/buddy/src/learning/features/reading/`, `packages/buddy/src/learning/features/media-presentations/`
- `packages/web/src/components/readers/`, `packages/web/src/components/resources/`
- `packages/buddy/src/learning/features/bench/`, `packages/buddy/src/routes/bench.ts`
- `packages/web/src/components/bench/`, `packages/web/src/lib/bench-*.ts`
- `packages/buddy/src/learning/features/whiteboard/`, `packages/web/src/components/whiteboard/`
- `packages/buddy/src/learning/features/obsidian-vault/`, `packages/buddy/src/routes/obsidian.ts`
- `packages/opencode-adapter/src/file-watcher-native.ts`

**Audit focus:** Sanitizer parity across live/persisted/export/error paths; SVG/HTML active features, CSP, sandbox, origin, popup/download/form/network authority; source-root/symlink/encoded-path containment; document type spoofing, archive/XML/parser/OCR limits and subprocess cleanup; preparation generations and deletion; reader scripting/MIME/range serving; Bench route/store/context/lease ordering and unsaved transitions; whiteboard validation/order/conflicts/load; Obsidian symlink/alias/case/watch overflow/recursive embeds and Windows paths.

## Cross-domain scenarios required before launch

These scenarios span domains and must not be assumed covered by isolated reviews:

1. **Clean install to first response:** install with no Buddy state, launch, create/open the initial notebook, connect a provider, send one prompt, stream one tool-using response, restart, and reopen the same transcript.
2. **Upgrade with existing state:** upgrade a populated installation containing notebooks, sessions, credentials, config, skills, resources, and managed objects; verify no path/channel migration loss.
3. **Crash during mutation:** terminate backend/app during object replacement, config save, resource preparation, flashcard review, learner-memory update, lesson restore, and updater replacement; relaunch and inspect recovery.
4. **Abort during authority:** abort while Python, MCP, subagent, file-write, and rendering tools run; verify processes, permissions, artifacts, and session status settle consistently.
5. **Notebook switch under activity:** stream a response while switching notebooks and opening Bench content; verify events, caches, permissions, and targets remain scoped.
6. **External file change:** edit, rename, delete, and symlink-swap open files outside Buddy while Explorer, Markdown Bench, Obsidian, resources, and agent context are active.
7. **Hostile content chain:** import a hostile document, expose text to the model, generate Markdown/Mermaid/SVG/HTML-widget output, persist it, restart, and reopen every view/export path.
8. **Credential lifecycle:** connect, cancel, reconnect, expire, refresh, and remove each provider/MCP credential while sessions and settings are open.
9. **Update during failure:** check/download/install while backend is unhealthy and an artifact write is active; verify truthful recovery on both platforms.
10. **Resource pressure:** exercise large transcripts, rapid deltas, large vaults/documents/boards/widgets, runtime output, and reconnects while observing memory, CPU, handles, and responsiveness.
11. **Windows matrix:** repeat authority and persistence with drive roots, UNC paths where supported, spaces, non-ASCII/long paths, locks, antivirus interference, and WSL conversion.
12. **macOS matrix:** repeat startup, notebook, resource, and update flows with protected folders, denied access, quarantine, app translocation where relevant, and revoked permissions.

## Audit completion standard

A domain is reviewed only when:

- its end-to-end boundary has been traced, not merely its seed files;
- realistic failure and adversarial cases have been executed where possible;
- every candidate is written before verification begins;
- verification begins only after all 10 domains complete first-pass discovery;
- every retained finding has a concrete trigger, code path, consequence, and reproduction or failing test;
- serious findings are independently challenged against guards, callers, and platform behavior;
- rejected suspicions are recorded rather than silently promoted;
- confirmed fixes receive a boundary re-audit and focused regression coverage;
- package-specific tests and `bun lint` pass, with root `bun typecheck` required for code changes but skipped for documentation-only audit edits under repository instructions; and
- platform-specific release claims are run on macOS and Windows rather than inferred from compilation alone.
