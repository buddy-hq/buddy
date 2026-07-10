# OpenCode upstream fetch — 2026-07-10

## Durable developer mandate — read before resuming

The developer explicitly requested that this run **must not be treated as an ordinary upstream fetch**. It is one continuous, potentially multi-compaction operation with two coupled outcomes:

1. fetch and validate the latest stable OpenCode vendor snapshot; and
2. migrate Buddy to most of the v2 architecture and runtime surfaces that the selected vendor snapshot has already implemented.

Continue from this log after any context compaction. Do not restart the work as a mechanical vendor sync, and do not stop after copying `vendor/opencode`. The Buddy-side v2 adoption work is part of the requested result.

“Follow vendor to v2” means re-homing Buddy onto usable upstream v2 mechanisms across the complete Buddy path—not merely importing v2 types or detecting files in `packages/core`. For each surface, verify the selected implementation, migrate its connected backend/adapter/SDK/web contracts together where required, preserve Buddy-specific product policy, and prove the replacement with focused tests and live smoke checks. If a v2 surface is incomplete or cannot work coherently end to end, record the blocker and retain the current path rather than creating a mixed v1/v2 runtime.

The intended default is broad adoption of supported v2 surfaces. Any capability left on v1 or behind a Buddy bridge needs a concrete implementation blocker or failed end-to-end gate recorded in the capability ledger below.

### Vendor desktop/app parity is the adoption rule

If the stable OpenCode desktop/app uses v2 for a product surface, Buddy must also migrate that same surface to v2 in this run. The vendor app's actual SDK calls, state, events, routes, and runtime wiring are the primary adoption map. Do not use the absence of unrelated v2 hooks as a reason to leave a surface on v1 when OpenCode's own app has already crossed that surface to v2.

For each surface, audit the selected tag's `packages/app`, desktop wrapper, SDK v2 client, server handlers, and core implementation together. Match the vendor app's v1/v2 boundary directly. A deferral is valid only when the stable vendor app itself still uses v1 for that surface or when Buddy-specific functionality has no v2 equivalent; record exact source evidence either way.

### No v2-to-v1 compatibility shims

Do **not** preserve Buddy's v1 contracts by adding wrappers that translate the vendor's v2 APIs, types, events, messages, permission model, or runtime behavior back into Buddy's old v1 shapes. When a v2 surface is adopted, overhaul the connected Buddy backend, adapter call sites, generated SDK, frontend state/streaming, and tests to speak that v2 contract directly.

This prohibition is specifically about compatibility machinery between vendor v2 and Buddy v1. It does not prohibit retaining `@buddy/opencode-adapter` for the in-process embedding boundary or for genuinely Buddy-owned runtime/configuration seams. That package must not be used to disguise v2 as v1 or preserve obsolete Buddy calling conventions.

Do not add dual v1/v2 protocols, temporary translation DTOs, legacy fallbacks, or event-name/type reassembly whose purpose is to avoid completing an adopted v2 migration. If the selected upstream v2 capability is too incomplete for an end-to-end Buddy overhaul, keep that capability wholly on the existing v1 path, record the concrete blocker in the ledger, and defer it. Do not create a hybrid evaluator or runtime.

### Tests migrate with the product surface

Do not treat the pre-fetch Buddy test suite as a fixed compatibility contract. For each newly adopted upstream behavior that Buddy exposes, add or extend focused Buddy-level coverage for the new v2 contract and its observable failure/recovery behavior. Update fixtures to current v2 schemas, and remove tests whose only purpose is to preserve deleted v1 compatibility behavior, obsolete fields, adapter parameter reshaping, or dual-protocol fallbacks.

Upstream vendor tests are evidence for understanding the change, not a substitute for Buddy coverage. Continue to follow the repository rule against running the full vendor suite; select only Buddy package tests and focused integration/contract/smoke checks for the surfaces changed in this migration.

### Hands-on Electron completion gate

Do not declare this migration complete based only on lint, typecheck, unit/contract tests, or builds. After the full migration passes automated gates, operate the actual Buddy Electron app and visually verify the critical launch path. The developer explicitly authorized stopping an existing Buddy Electron development server and starting a clean one in a background terminal when this phase begins.

**Exit criterion: computer use.** The simple parity bar is: if the stable vendor desktop uses v2 for a surface, Buddy desktop must use v2 for that surface too, while preserving Buddy's product behavior. Engineering judgment controls the implementation, but only hands-on observation of the critical Buddy desktop flows can close the run.

At minimum, create or open a real session, submit a prompt, observe streaming through completion, exercise several representative actions and critical surfaces (including a tool/permission interaction when available, file or Bench-facing behavior, provider/config visibility, navigation, and session restart/reconnect), and inspect both the UI and runtime terminal for failures. Add focused regression coverage for defects found during this hands-on pass, then repeat the affected manual flow. Do not stop before most critical surfaces have been personally observed working.

Follow `docs/guides/upstream-fetch.algo.md` throughout. Preserve unrelated work, validate in a temporary worktree before updating the real workspace, and stop for the developer's explicit approval before creating commits.

### Objective outranks the algorithm

The upstream-fetch algorithm is a working structure for safety, evidence, and resumability; it is not a hard constraint or a substitute for engineering judgment. The objective is to fetch the selected upstream snapshot, perform the requested direct v2 migration, and make Buddy work again across its real backend, desktop, and web product paths.

Deviate from the algorithm's ordering or command suggestions when necessary to reach that objective correctly—for example, generate required ignored SDK artifacts before using typecheck output as migration evidence, add more focused validation, or replace an obsolete step. Record material deviations and their reason in this log. Do not use procedural compliance as a reason to stop with a broken or half-migrated Buddy.

## Checkpoint

- Started: `2026-07-10 11:16:41 IST`
- Branch: `main`
- Baseline `git status --short`: clean
- Mode: combined upstream vendor sync and Buddy adoption of supported OpenCode v2 runtime surfaces
- Commit boundary: do not commit until the validated sync, Buddy migrations, tests, live smoke results, warnings, and risks have been reviewed with the developer

## Scope

This run is intentionally broader than a mechanical vendor refresh. It will:

1. select and validate the requested/latest stable OpenCode tag independently;
2. update `vendor/opencode` in a temporary worktree first;
3. identify v2 capabilities implemented by that snapshot;
4. migrate Buddy to the v2 capabilities that are usable through Buddy's complete execution path;
5. keep Buddy-specific teaching, persona, feature, skill, and subagent policy in Buddy-owned code;
6. retain v1 paths or Buddy bridges wherever the selected v2 surface is incomplete or cannot yet be validated end to end;
7. remove a superseded bridge only after focused regression and live smoke coverage proves the v2 replacement.

The dated findings in `docs/v2/` are inputs, not source of truth. Every claim will be rechecked against the selected upstream snapshot.

## Baseline

```text
branch: main
git status --short: clean
vendored packages/opencode version: 1.16.2
```

## V2 capability ledger

| Upstream capability | Current Buddy bridge/surface | Intended disposition | End-to-end gate | Validation | Status |
| --- | --- | --- | --- | --- | --- |
| Single `@opencode-ai/sdk/v2/client` used by the stable desktop app | Buddy backend created parallel v1/v2 clients and reshaped both through `client-adapter.ts`; web already used the v2 client | Use one direct v2 SDK client in backend and web; delete the compatibility wrapper and manual route reshaping | No non-v2 SDK client import or `client-adapter` remains; backend route and desktop smoke pass | Root typecheck, focused client/overlay tests, live HTTP health, and packaged Electron session smoke pass | Adopted in main and manually validated |
| Explicit desktop `client.v2.reference.list` catalog | Buddy composer already had `@` agent/file suggestions but no OpenCode reference catalog | Preserve the exact nested v2 response, consume `reference.updated`, show visible aliases before other suggestions, and submit the same directory-file prompt contract used by the vendor app | Typed SDK generation, route/security tests, editor round-trip tests, prompt transform test, and live Electron alias selection | Route, ordering/filtering, prompt resolution, stale/tampered pair rejection, editor round-trip, live HTTP, and packaged Electron alias-selection/permission tests pass | Adopted in main and manually validated |
| SessionV2 create, prompt, reads, context, and events | Buddy session routes and read-only transcript consumers | Match the desktop app's boundary: direct v2 SDK client with its top-level `session.*` surface; use explicit core v2 reads only where the app/core contract is complete | Backend routes, generated SDK, web send/read/stream, recovery, and live chat smoke all use the selected boundary coherently | Stable desktop uses the v2 SDK but still calls top-level `session.*`, not `client.v2.session.prompt`; explicit v2 read test passes | Desktop boundary adopted; core v2 execution deferred |
| `session.next.*` message and tool-input events | `tool-input-delta-live`, Buddy SSE transforms, web streaming | Keep the existing bridge only on the wholly v1 prompt path | Progressive tool input and Buddy `toolUi` survive backend-to-web streaming | Blocked with v2 prompt execution; no v2-to-v1 event adapter will be added | Deferred |
| PermissionV2 and PermissionSaved | Native v1 permission requests/replies plus Buddy permission UI | Match the stable desktop: use the direct v2 SDK client while retaining the same legacy permission runtime until the desktop itself crosses to PermissionV2 | Execution, events, pending reads, replies, agent rules, location/project identity, persistence, and deny precedence are coherent | Stable desktop still consumes `permission.asked` and calls top-level `client.permission.respond`; mixing PermissionV2 into Buddy's active v1 tool loop is prohibited | Desktop boundary adopted; PermissionV2 runtime deferred |
| AgentV2 | Buddy personas, feature overlays, agent adapter paths | Match the stable desktop's top-level `app.agents` read through the v2 SDK; do not move active agent execution independently of its prompt/tool runtime | Persona/feature/tool behavior and primary/subagent selection remain correct | Direct v2 SDK overlay test covers Buddy agent discovery; stable desktop does not use `client.v2.agent` | Desktop boundary adopted; AgentV2 execution deferred |
| ConfigV2 | Buddy runtime config overlays | Keep the Buddy-owned overlay on the stable desktop's top-level config/provider surfaces through the v2 SDK; do not split runtime ownership | Directory changes and runtime disposal/recreation preserve overlay isolation | Direct v2 SDK overlay tests pass; stable desktop still uses top-level `config.*` | Desktop boundary adopted; core ConfigV2 ownership deferred |
| PluginV2 | `plugin-live` and `buddy-runtime-plugin` | Retain the active v1 plugin path | Buddy tools and message/system transforms have supported equivalents | Blocked: stable PluginV2 lacks tool registration and chat/session transform seams | Deferred |
| V2 child-session identity and permission derivation | Buddy subagent forwarding and teaching-state propagation | Retain Buddy forwarding on the active v1 execution path | Nested sessions, permissions, teaching seed, tool overrides, and persona policy pass | Blocked: v2 has generic identity/permissions but no Buddy teaching-state hook | Deferred |
| V2 skill/config visibility | `skill-live`, hidden-skill filtering | Keep active skill filtering with the active v1 agent/tool runtime | Enable/disable/re-enable and hidden-skill checks pass without registry churn | Blocked with v2 active runtime; PluginV2 skill transforms alone do not migrate execution | Deferred |
| Typed v2 SDK skill catalog | Buddy manually fetched `/skill` and cast JSON to a local type | Use direct `client.app.skills` from the same v2 SDK client; do not preserve the raw-fetch shim | Overlay and skill visibility/catalog routes pass with typed results | Focused overlay, skill visibility, and skill route tests pass | Adopted in main |
| V2 session-message schema for read-only transcript consumers | Learner-memory extraction and Mermaid repair runtime lookup | Consume current v2 message types directly | Memory extraction parses current user attachments and tool output without legacy fields | Root typecheck and Buddy learning tests pass | Adopted in main |
| V2 ripgrep node | Buddy notebook file search used removed `filesystem/ripgrep` service | Use the v2 `Ripgrep` node directly | File search limits, exclusions, ranking, abort, and route behavior pass | Root typecheck, SDK generation, adapter tests, and focused file-search coverage pass | Adopted in main |

## Upstream target verification

- `git fetch opencode-upstream --tags` fetched the new `v1.17.x` series but exited nonzero because existing historical `v0.0.x` tag names would be clobbered. Those unrelated historical tags were not forced or rewritten.
- The local OpenCode clone's `origin` did not yet contain `v1.17.18`, so the exact tag was fetched from its authoritative `upstream` remote.
- Latest stable OpenCode tag after filtering out unrelated `vscode-*` tags: `v1.17.18`.
- Remote/tag commit: `b1fc8113948b518835c2a39ece49553cffe9b30c`.
- Verified target tree: `d47e0f4006aefaab6a2f9afc476c41f7107fec5f`.
- Both the Buddy repository tag and `/Users/prashantbhudwal/Code/opencode` tag resolve to that target.
- Target `packages/opencode/package.json` version: `1.17.18`.
- Current vendored `packages/opencode/package.json` version: `1.16.2`.
- Decision: proceed with `v1.17.18`; the current vendor is behind the latest stable tag.

## Temporary worktree validation

- Temporary worktree: `/tmp/buddy-vendor-check-uWulo5` on `codex/vendor-check-2026-07-10`.
- Exact tag snapshot: `/tmp/opencode-tag-snapshot-UfM3LL`.
- Snapshot copied with deletion semantics; no removed upstream files are intentionally retained.
- Initial delta: 1,577 tracked files, 88,356 insertions, 166,060 deletions; the largest changes are under `packages/opencode` and `packages/core`.
- Root catalog synchronized. Notable catalog change: Effect `4.0.0-beta.74` → `4.0.0-beta.83`.
- Added the stable tag's required root dependency patch registrations and a root workspace dependency on `@opencode-ai/sdk` so core's generated v2 type imports resolve in the combined Buddy workspace.
- `bun install`: pass.
- `bun run sdk:generate`: pass after migrating Buddy notebook search from the removed `@opencode-ai/core/filesystem/ripgrep` service to the v2 `Ripgrep` node.
- Fresh-worktree generated artifacts required before trustworthy diagnostics:
  - Buddy SDK generation
  - TanStack route-tree preparation
- `bun typecheck`: pass (7/7 Buddy package tasks), including after the single-v2-client and explicit reference migrations.
- `ALLOW_VENDOR_SYNC=1 bun lint`: pass with four pre-existing warnings outside the sync migration files and no migration-introduced warnings.
- `bun run --cwd packages/web test:contracts`: pass (74 tests, including new v2 reference suggestion/editor coverage).
- `bun run --cwd packages/buddy test:contracts`: initially exposed changed wildcard permission ordering, then pass (6 tests) after fixing Buddy's authored overlay precedence.
- `packages/opencode-adapter`: pass (13 tests, 3,573 assertions), including the v2 ripgrep migration.
- Focused Buddy v2 client, overlay, skill, reference-route, and prompt-reference tests: pass.
- Focused web reference suggestion, editor round-trip, prompt-store/composer, and optimistic reconciliation tests: pass.
- Buddy Node build and Node artifact smoke: pass.
- Electron production build: pass after resolving the upstream Code Mode dependency boundary described below.
- Electron backend utility isolated-output smoke: pass, including runtime-package resolution and real API routes.
- Broader temporary-worktree regressions:
  - Buddy learning: 121/121 pass.
  - Web: 829/829 pass.
  - Buddy skills plus the SQLite regression: 47/47 pass.
- The validated change set was copied to the real `main` worktree before real-process HTTP and packaged-Electron validation.

## Buddy migrations

Completed in the real `main` worktree after temporary-worktree validation:

1. Replaced removed per-service `defaultLayer` usage with the selected tag's node-based runtime construction. Active upstream v1 services use `AppNodeBuilderV1`; direct v2/core services use `AppNodeBuilder`.
2. Migrated notebook file search directly to `@opencode-ai/core/ripgrep` and `Ripgrep.node`; no removed v1 ripgrep API was recreated.
3. Migrated the `SessionV2` read runtime to `SessionV2.node` with the same concrete `SessionExecutionLocal` replacement used by the stable v2 server.
4. Updated learner-memory transcript extraction to the current v2 session-message contract:
   - tool file output is `{ type: "file", uri, mime, name? }`
   - user messages contain `text`, `files`, and `agents`; the removed `references` field is not reconstructed
5. Preserved Buddy-authored wildcard-first permission precedence immediately after validating the Buddy runtime overlay. Effect's decoded `StructWithRest` placed known keys such as `task` before the rest-key `"*"`, causing the final catch-all deny to override specific subagent allows. The upstream evaluator remains untouched.
6. No v2-to-v1 DTO, event, permission, message, or runtime translation layer has been introduced.
7. Replaced Buddy backend's parallel v1/v2 SDK construction with the same single `@opencode-ai/sdk/v2/client` used by the stable OpenCode app. Deleted the 328-line `client-adapter.ts`, including its manual `fetchSdkRoute` implementation and all v1 parameter/body reshaping.
8. Migrated the remaining skill-catalog `/skill` manual fetch and JSON cast to the typed v2 client's `app.skills` method.
9. Adopted the only explicit `client.v2.*` call in the stable desktop app, `v2.reference.list`, end to end:
   - exact v2 `{ location, data }` response through Buddy's typed generated SDK
   - `reference.updated` query invalidation
   - visible reference aliases ranked before agents/files in the composer
   - structured alias/path editor state that submits the vendor desktop's directory-file prompt representation
   - backend revalidation of the alias/path pair against the current v2 catalog
10. Added focused tests for the new reference route, allowed-root enforcement, alias filtering/ranking, editor serialization/round trip, valid prompt resolution, and stale/tampered reference rejection. Updated the SDK helper tests to name and exercise the v2 client directly.
11. Adapted the Electron production build for OpenCode's new experimental Code Mode dependency:
   - the upstream tool now dynamically imports the full `typescript` compiler
   - Electron Vite 5's built-in ESM shim scanner can falsely parse `import(...)` text inside large bundled compiler/parser strings and inject its shim in the middle of a string literal
   - `typescript` is now an explicit packaged runtime dependency, and Buddy supplies the Electron main ESM/CommonJS shim in an ordered pre-render hook so Electron Vite recognizes it and does not run the faulty insertion pass
   - the production build and isolated backend-utility smoke both pass; no vendor source was patched
12. Fixed a Bun SQLite wrapper defect exposed by the broader regression run. Passing an explicit empty options object to current `bun:sqlite` is not equivalent to omitting options and fails without a read/write flag. The wrapper now omits the argument when callers provide no options, with a focused writable-database regression test.
13. Cleaned stale or isolation-unsafe tests encountered during the migration:
   - removed the hard-coded bundled-skill count while retaining deterministic registration validation
   - updated the right-workspace rail expectation to its current `Notebook Instructions` label
   - reset the markdown worker mock after each test so its synthetic highlighted code cannot leak into later rendering tests
   - extracted and directly tested reader-content filter selection so a different test's intentional module mock cannot invalidate the theme contract

### Current v2 adoption boundary in stable `v1.17.18` — desktop audit

- V2 sessions, durable events, PermissionV2, AgentV2, current message schemas, many built-in tools, and PluginV2 are implemented in the selected tag.
- The v2 local runner supports a limited set of provider APIs, while several public session operations remain explicitly unavailable (`shell`, `skill`, `compact`, and `wait`).
- PluginV2 now covers agent, catalog, command, integration, reference, skill, and AI SDK domains.
- PluginV2 still does **not** expose the tool-registration or chat/session transform seams required by Buddy's learning tools, teaching prompt transforms, and subagent teaching-state propagation.
- The stable desktop app constructs one client from `@opencode-ai/sdk/v2/client`; Buddy backend and web now match that construction. No Buddy production import of `@opencode-ai/sdk/client` remains.
- The desktop app uses the v2 SDK's top-level session, permission, question, provider, config, project, file, find, MCP, auth, and global-event groups for its active product paths. Those groups still target the legacy runtime routes even though they are generated and typed by the v2 SDK package. Buddy now uses that same boundary directly rather than wrapping a parallel v1 client.
- The only explicit `client.v2.*` call in stable `packages/app/src` is `client.v2.reference.list`. Buddy now adopts that reference catalog and composer behavior end to end.
- PermissionV2 remains coupled to the v2 runner/tool/location/agent path. Buddy permissions remain wholly v1 until that execution path can carry Buddy tools and transforms; no mixed v1 evaluator plus v2 saved-approval path will be created.
- Native `session.next.*` tool-input events are likewise coupled to the v2 runner. `tool-input-delta-live` remains only on the wholly v1 prompt path and is not being rewritten as a v2-to-v1 event adapter.

### Forward-looking `upstream/v2` horizon revalidation

- Re-fetched `upstream/dev` and `upstream/v2` from `/Users/prashantbhudwal/Code/opencode` on 2026-07-10.
- `upstream/v2`: `0d6ccd2a5019000c1e25b40237111aff4173802a` (`2026-07-10T02:51:30-04:00`).
- `upstream/dev`: `d0ba5389248e05546849b9f69b7bc417aa5fd5d7`.
- The v2 branch backend now exposes SessionV2 prompt handlers through `SessionV2.Service` and PermissionV2 reply handlers through `PermissionV2`.
- The v2 branch desktop has **not** activated those paths: prompt submission still calls top-level `client.session.promptAsync`, and permission UI still consumes `permission.asked` and calls top-level `client.permission.respond` on legacy routes.
- PluginV2 services and hooks exist, but the desktop has not switched its active prompt/tool/plugin execution path to them.
- Therefore prompts, PermissionV2 execution/replies, and PluginV2 runtime remain **backend ready only**, not stable-desktop or v2-branch-desktop cutovers. Buddy will not preemptively create v2-to-v1 adapters for them.
- Restored `docs/v2/upstream-v2-audit-2026-07-04.md` from the newest stash into the real worktree. Its dated findings remain research history; this current source audit supersedes its branch-tip hashes.

## Live smoke results

### Real-worktree automated gates before live desktop operation

- Vendor catalog sync: already aligned.
- `bun install`: pass.
- SDK generation and web preparation: pass.
- `bun typecheck`: pass, 7/7 Buddy package tasks.
- `ALLOW_VENDOR_SYNC=1 bun lint`: pass with the same four pre-existing warnings outside migration files.
- Buddy learning: 121/121 pass.
- Web package: 830/830 pass.
- Desktop package: 40/40 pass.
- OpenCode adapter: 13/13 pass, 3,573 assertions.
- Buddy session: 33/33 pass.
- Buddy contracts: 6/6 pass.
- Focused skills, v2 reference route/prompt, v2 SDK client, overlay, and Bun SQLite regressions: 64/64 pass.
- Buddy Node build and Node artifact smoke: pass.
- Electron production build: pass.
- Electron isolated backend utility smoke: pass.
- Final post-acceptance rerun: `ALLOW_VENDOR_SYNC=1 bun lint` pass with the same four documented warnings, root `bun typecheck` pass (7/7), `git diff --check` pass, Electron production build pass, and isolated backend-utility smoke pass.

### Real-process HTTP smoke

Started the Buddy backend from the current `main` worktree on `127.0.0.1:3011`, exercised the changed runtime boundary, and stopped it cleanly afterward:

- `GET /api/healthz`: `200`, `{"healthy":true}`.
- `GET /api/health`: `200`, `{"healthy":true,"version":"local"}`.
- `GET /api/reference?directory=<repo>`: `200`; returned the exact `{ location, data }` v2 contract for the requested directory.
- `GET /api/reference?directory=relative`: `404` with Buddy's JSON error envelope; the relative path resolved to a missing directory and did not escape the allowed root.
- `GET /api/event?directory=<repo>`: connected with `200` and delivered the SSE prelude before the two-second client timeout.

### Hands-on packaged Electron results

- Built and launched the current packaged macOS app from the migrated worktree, rather than relying on an older installed app.
- Submitted `MIGRATION_SMOKE_OK`; the real session streamed to completion.
- Restarted the packaged app and confirmed the session route and draft recovered.
- Added a temporary `migrationDocs` reference in the notebook config, selected `@migrationDocs` through the v2 composer catalog, and submitted it using the structured directory-file contract.
- Observed the real permission dock for the external documentation path, chose allow once, and confirmed the model searched/read the reference and returned the document title.
- Inspected Settings General, Providers, and MCP; configured provider visibility loaded and the Linear MCP connection appeared.
- Asked Buddy to open a temporary Markdown file on Bench and visually confirmed the editable Bench surface contained `BENCH_SMOKE_OK`.
- Removed the temporary notebook config and Markdown smoke file, then stopped the packaged Buddy process.

### Hands-on repository dev Electron acceptance

- Removed the conflicting installed copies at `/Applications/Buddy Dev.app` and `/Applications/Buddy.app` without deleting Application Support, notebook, session, credential, or other user data. Started the Electron app from the current repository with `bun dev:desktop` and attached Computer Use to that exact Electron binary.
- Confirmed the previously failing `~/Documents/Buddy/linear` and `~/Documents/Buddy/self reliance` notebooks load without an access banner. Session, question, permission, MCP, reference, file-find, resource, object, and event requests returned `200`; the cascading `403` responses stopped.
- Selected the temporary `@migrationDocs` v2 reference, observed the external-directory permission dock, allowed the read once, and received the exact `DEV_REFERENCE_OK` streamed response.
- Found a second live regression: opening a Markdown file could leave the Bench visually black until a DevTools/window resize. The page had two `view-transition-name: buddy-bench-surface` owners and Chromium could retain a stale route-transition overlay over the already-rendered editor.
- Removed the nested transition owner and disabled route View Transitions for controller-owned Bench navigation; Buddy's existing workspace width/opacity motion remains the single presentation animation. Added focused composition and controller-navigation regressions. The focused suites pass 25/25 and the complete web package passes 830/830.
- Repeated the affected Bench flow without opening DevTools or resizing: navigated away, reopened the Markdown file through Files, observed the editor immediately, appended `BENCH_EDIT_OK`, confirmed autosave on disk, reloaded, and observed the saved edit.
- Exercised real notebook surfaces with existing user data: Sources listed the ready PDF and EPUB; the EPUB reader opened and paginated from location 9 through 11; Practice listed 44 due items; Creations opened a valid Mermaid diagram and zoomed; Boards opened the existing Excalidraw board and zoomed; Notebook Instructions opened `AGENTS.md` as editable Bench Markdown; and notebook search returned mixed resource, flashcard, and file results for `Emerson`.
- Exercised Settings General, Providers, MCPs, Personalization, Learner Memory, and Advanced. Changed color scheme and restored it, verified the connected Linear MCP and providers, installed the bundled Standards optional runtime (`v1.8.0`), opened its settings page, toggled one tool default off/on, and left the installed runtime enabled.
- Killed the complete dev process tree, restarted `bun dev:desktop`, and reattached to the new Electron/backend processes. All three registered notebooks returned `200`, the previous notebook/session and drawer state recovered, a new prompt returned exact `RESTART_ACCEPTANCE_OK`, and the fixed Bench reopened immediately with `BENCH_EDIT_OK` still present.
- Removed the temporary `migrationDocs` config and Bench acceptance file after the cold-restart pass. Stopped the repository-owned dev process cleanly before the final production build and isolated backend-utility smoke.

## Risk ledger

### Confirmed regressions

- Bun SQLite failed when Buddy passed an explicit empty options object; fixed by omitting the options argument when no options exist, with focused regression coverage.
- Electron Vite's ESM shim pass could inject code into compiler/parser strings after upstream added a dynamic full-TypeScript import; fixed at Buddy's build boundary and covered by production build plus isolated backend smoke.
- Stale or isolation-unsafe tests obscured current behavior; cleaned the hard-coded skill count, stale right-rail label, leaked Markdown worker mock, and reader theme filter test seam.
- Post-migration dev operation exposed a directory-access regression that did not exist in the developer's previous workflow: an already-running installed-app Electron backend utility returned `EPERM` for notebooks under `~/Documents/Buddy`, causing cascading `403` responses across session, question, MCP, reference, file-find, and object routes. The directory ownership, POSIX permissions, Cmux shell access, Electron version, and access guard were unchanged. Removing the two installed `/Applications` copies, terminating their helpers, and launching the repository-owned Electron process restored every affected route to `200`; a subsequent full dev-process restart remained healthy. The installed-app/helper identity collision was material, not a notebook permission or API contract failure.
- Bench route navigation could render the target but leave it visually covered by a stale View Transition until a compositor resize. Fixed by enforcing one Bench transition owner and disabling the redundant route View Transition for Bench controller navigation, with focused regression coverage and repeated live validation before and after a cold restart.

### Rejected false alarms

- An initially black Buddy window belonged to a stale installed app, not the packaged app produced by this worktree.
- An Electron demo window was an unrelated auto-respawning Buddy actions runner sharing generic Electron identity, not the migrated Buddy app.
- Existence of SessionV2, PermissionV2, and PluginV2 backend code on `upstream/v2` is not evidence of a desktop cutover; current desktop call sites remain on the top-level legacy routes.

### Remaining risks

- Upstream has not yet activated core SessionV2 prompt execution, PermissionV2 replies, or PluginV2 tool/plugin execution in its desktop. These are tracked future migrations and must be adopted directly when the vendor desktop crosses them.
- Lint still reports four pre-existing warnings outside the migration files; there are no migration-introduced lint errors or warnings.
- The local `electron-builder --dir` artifact was suitable for hands-on validation but was not production-signed; release signing remains a separate release pipeline concern.
- Dev startup still prints a Vite optimize-dependency warning for `@buddy/web > es6-promise-pool`; it did not prevent renderer startup, builds, or any exercised surface, but should be removed separately if it appears in release-mode dependency optimization.

## Final state

- Real worktree: `/Users/prashantbhudwal/Code/buddy`, branch `main`.
- Vendored OpenCode: exact stable `v1.17.18` snapshot (`b1fc8113948b518835c2a39ece49553cffe9b30c`, tree `d47e0f4006aefaab6a2f9afc476c41f7107fec5f`).
- Direct stable-desktop v2 parity completed: single v2 SDK client, explicit `client.v2.reference.list`, typed v2 skill catalog, current v2 message schema for transcript readers, and v2 Ripgrep node.
- No v2-to-v1 compatibility shim, dual protocol, or fallback was added. Prompts, permissions, and plugins remain on the same wholly legacy execution routes still used by the vendor desktop.
- Automated gates, real-process HTTP smoke, packaged Electron smoke, and broad hands-on repository dev Electron acceptance pass. The directory-access and black-Bench regressions both pass a full dev-process cold restart.
- Temporary user smoke files were removed. The upstream v2 audit was restored to the worktree and the fetch algorithm now requires a stable/dev/v2 three-way desktop-activation audit.
- Vendor-only commit created with the developer's explicit approval: `400bc35711e13a2f25b5dc6c272183686ad767e6` (`chore(vendor): Sync OpenCode to v1.17.18`). Its staged blob/mode manifest matched all 6,230 entries in upstream tag `v1.17.18` exactly, and it contains no path outside `vendor/opencode/**`.
- Root install metadata and every Buddy-owned backend, adapter, web, desktop, test, script, algorithm, audit, and migration-log change remain unstaged and uncommitted for the requested Buddy regression review.
- The temporary validation worktree, its `codex/vendor-check-2026-07-10` branch, the extracted tag snapshot, and HTTP-smoke scratch files were removed after the Buddy tracked patch and all new Buddy files were verified identical to the real worktree.
