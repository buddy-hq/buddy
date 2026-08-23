# Buddy Frontend E2E Specification

Status: final pre-implementation spec  
Date: 2026-03-30  
Owner: Web + Desktop

## Implementation Checklist Status (2026-03-30)

This is the final local implementation-pass status for the scenario inventory in this spec.

- Scenario IDs in spec: `40`
- Scenario IDs implemented in Playwright specs: `40`
- Playwright tests present: `41`
- Note: total tests exceed scenario IDs because `ENT-03` is covered by two concrete onboarding variants
- Harness/suite scaffolding implemented: `4/4` (`smoke-web`, `core-web`, `faults-web`, `desktop-shell`)

Latest verification state:

- `smoke-web`: `12 passed`
- `core-web`: `22 passed`
- `faults-web`: `4 passed`
- `desktop-shell`: `3 passed` with `BUDDY_E2E_DESKTOP_SHELL=1`

Required repo gates:

- `bun fmt`: passed
- `bun lint`: passed
- `bun typecheck`: passed

Checklist completion:

- Mandatory implementation checklist items for this spec: done
- Mandatory local verification for web/fault coverage: done
- Mandatory local verification for desktop-shell coverage: done

## Purpose

Define the frontend end-to-end program Buddy will actually implement.

This document replaces the previous draft. That draft was too broad, mixed Buddy-owned behavior with vendor-only parity ideas, and did not specify the harness strongly enough to guide implementation.

## Governing References

This spec is constrained by:

1. `docs/buddy-core.spec.md`
2. Current Buddy code in `packages/web` and `packages/desktop`
3. Vendored OpenCode E2E patterns in `vendor/opencode/packages/app/e2e/**`

Vendor is a reference for harness structure, fixtures, selectors, and test-driver style. It is not the product-scope checklist. Buddy must cover Buddy-owned behavior, not every upstream OpenCode feature.

## Final Decisions

1. The shared Playwright harness lives under `packages/web/e2e`, not split across web and desktop packages.
2. Chromium web is the primary CI gate. Real desktop automation is a smaller shell suite run separately.
3. Automated E2E uses the real Buddy backend plus deterministic local seed state. It does not use live third-party auth or live model providers.
4. When required state is not observable through stable UI, add a narrow Buddy-owned test probe or seed path. Do not use sleeps or brittle DOM heuristics.
5. The suite uses Buddy terminology precisely:
   - `notebook` = opened project directory
   - `teaching workspace` = interactive lesson/editor state inside a session
6. We do not chase full vendor parity. Buddy does not currently own or expose several upstream surfaces, so they are explicitly excluded below.

## Scope

### In Scope

1. Web entry at `/chat`
2. Desktop-only onboarding at `/onboarding`
3. Directory-scoped chat at `/$directory/chat`
4. Settings routing at `/settings` and `/skills`
5. Notebook registry, sidebar, and thread lifecycle
6. Prompt composer behavior: submit, history, attachments, file mentions, slash commands
7. Settings that materially affect user behavior: appearance, notebook defaults, providers, MCPs
8. Teaching sidebars and teaching workspace lifecycle
9. Resource panel and notebook Mermaid artifacts
10. Desktop bridge behavior that Buddy actually implements today: picker, title bar, updater wiring, desktop storage persistence
11. Recovery paths that matter to current product behavior: reconnect, backend restart, polluted local state, long transcripts

### Out of Scope For V1

1. Vendor command palette, terminal panel, terminal reconnect, server picker, status popover, worktree/workspace mode, title bar history, share slash flows
2. Real ChatGPT Plus or real OAuth login in automated CI
3. Deep-link, open-with, or single-instance desktop flows
4. Firefox and WebKit automation
5. Broad performance/load benchmarking or fixed message-count budgets
6. Future learner projection behavior that is not stable yet, including action bundles and alignment summaries that currently resolve to unavailable/placeholder data
7. Any test plan that requires patching `vendor/opencode`

## Test Principles

1. Test user-visible contracts and cross-layer integration, not implementation details already covered by unit or contract tests.
2. Prefer a real Buddy backend with deterministic local state over fetch mocking.
3. Use seeded files, seeded API state, and explicit test drivers. Never use `waitForTimeout(...)` to make a test pass.
4. Prioritize correctness under restart, reconnect, and partial state.
5. Treat notebook membership as backend-owned state. Renderer persistence must never be the source of truth for open notebooks.
6. Keep smoke small and stable. Put heavier reconnect and recovery cases in dedicated non-PR suites.

## Harness Architecture

### Location and Scripts

The E2E harness should follow the vendor layout and live in one place:

1. `packages/web/e2e/fixtures.ts`
2. `packages/web/e2e/actions.ts`
3. `packages/web/e2e/selectors.ts`
4. `packages/web/e2e/probes.ts`
5. `packages/web/e2e/[feature]/*.spec.ts`

`packages/web/package.json` should own:

1. `test:e2e`
2. `test:e2e:ui`
3. `test:e2e:report`
4. optional local helpers such as `test:e2e:local`

### Runtime Model

1. Start the real Buddy backend against a temporary per-worker state root.
2. Create temporary notebook directories per test or per worker, depending on isolation needs.
3. Seed sessions, messages, learner snapshot state, resources, and teaching workspace state through public Buddy APIs when possible.
4. If no public API exists for a required setup step, add a narrow Buddy-owned test-only seed path guarded behind an explicit E2E mode flag.

### Persisted State Reset

Each test run must own and reset the frontend persistence used by Buddy:

1. `buddy.chat.dat`
2. `buddy.prompt.dat`
3. `buddy.ui.dat`
4. `buddy.onboarding.dat`

Tests must also own the backend state root so notebook registry, config, and learner data cannot leak across runs.

### Test Drivers and Probes

Buddy should add a minimal `window.__BUDDY_E2E__` driver, modeled after vendor `__opencode_e2e`, for cases where the UI alone is not a stable oracle.

Allowed uses:

1. Injecting deterministic desktop platform results in browser-run tests
2. Observing prompt popover or model-picker state when semantic UI state is otherwise ambiguous
3. Forcing SSE disconnect/reconnect and backend-fault conditions
4. Counting desktop bridge calls such as drag/maximize/update checks

Not allowed:

1. Generic mutable test backdoors for arbitrary app state
2. Probes that subscribe to normal runtime updates unless E2E mode is enabled
3. Replacing stable UI assertions with internal probes when the UI already exposes the contract cleanly

### Selector Policy

Use the same selector discipline as vendor:

1. Semantic roles, labels, and button names first
2. Existing `aria-label`, `title`, and visible text where stable
3. Add small `data-component` or `data-action` hooks only when the existing UI is not stable enough

## Desktop Strategy

Desktop coverage is split into two layers.

### Browser-Run Desktop Boundary Tests

These run in the normal Chromium harness with an injected desktop platform implementation.

Use them for:

1. Onboarding routing decisions
2. Desktop picker success/cancel behavior at the React boundary
3. Updater toast wiring with fake updater results

### Real Desktop Shell Tests

These run against the actual Tauri shell on macOS and Windows.

Use them only for behavior that the browser harness cannot prove:

1. Title bar drag/maximize exclusions
2. Native picker integration
3. Desktop store persistence across relaunch

## Suite Layout

| Suite | Purpose | Cadence |
|---|---|---|
| `smoke-web` | Small PR gate for product-critical flows in Chromium | every PR |
| `core-web` | Broader deterministic coverage of Buddy-owned UI behavior | main branch and nightly |
| `faults-web` | Explicit reconnect, restart, and long-transcript cases | nightly and release candidate |
| `desktop-shell` | Real Tauri shell validation on macOS and Windows | nightly and release candidate |

### CI Matrix

1. PR: `smoke-web`
2. Main branch: `smoke-web` + `core-web`
3. Nightly: all four suites
4. Release candidate: all four suites plus manual non-automated checks for real provider auth/install flow

No Firefox or WebKit matrix is required for the first implementation.

## Required Scenario Inventory

### Entry and Bootstrap

| ID | Scenario | Suite |
|---|---|---|
| ENT-01 | Web `/chat` with no open notebooks shows the folder-entry screen instead of onboarding | `smoke-web` |
| ENT-02 | Desktop first launch with no prior chat state routes to `/onboarding` | `smoke-web` |
| ENT-03 | Desktop onboarding is skipped when the backend notebook registry already has a notebook or OpenAI is already connected | `smoke-web` |
| ENT-04 | Direct `/$directory/chat` bootstraps notebook membership, canonicalizes the directory, and loads the chat shell | `smoke-web` |
| ENT-05 | `/skills` redirects to `/settings?tab=skills` without losing notebook bootstrap | `core-web` |

### Notebook and Thread Lifecycle

| ID | Scenario | Suite |
|---|---|---|
| NB-01 | Opening a notebook through the entry screen stores the canonical directory returned by the backend and navigates to chat | `smoke-web` |
| NB-02 | Closing a notebook removes it from the sidebar and it stays removed after reload | `core-web` |
| NB-03 | Drag-reordering notebooks persists backend order and survives reload | `core-web` |
| NB-04 | Creating a new thread from the sidebar creates a draft in the selected notebook only | `core-web` |
| NB-05 | Selecting, renaming, and archiving a thread update the sidebar and reload correctly | `core-web` |
| NB-06 | Switching notebooks restores per-notebook last session, model override, and prompt-draft isolation | `core-web` |

### Composer and Prompt Submission

| ID | Scenario | Suite |
|---|---|---|
| PRM-01 | `Enter` submits and `Shift+Enter` inserts a newline | `smoke-web` |
| PRM-02 | Prompt history restores prior prompts and the unsent draft with arrow navigation | `core-web` |
| PRM-03 | Dropping a file attachment shows the preview, removing it clears the preview, and submit sends the attachment part | `smoke-web` |
| PRM-04 | `@` file search inserts a workspace file reference part using real file lookup results | `core-web` |
| PRM-05 | Local slash commands `/new`, `/mcp`, `/resources`, and `/resource ...` trigger the correct local UI or mutation path | `core-web` |
| PRM-06 | Backend slash commands dispatch `session.command` exactly once and restore the draft if the command request fails | `core-web` |

### Chat, Sync, and Recovery

| ID | Scenario | Suite |
|---|---|---|
| SES-01 | First prompt send auto-creates a session, transitions busy to idle, and persists the transcript | `smoke-web` |
| SES-02 | Reload restores the active transcript and current draft | `smoke-web` |
| SES-03 | Selecting another thread loads the correct transcript without message bleed from the previous thread | `core-web` |
| SES-04 | Aborting during a stream leaves the thread usable and does not duplicate assistant content after resync | `core-web` |
| SES-05 | Forced SSE disconnect and reconnect resync the current thread without duplicate message parts | `faults-web` |
| SES-06 | Polluted renderer storage never invents notebook membership; backend registry order wins | `faults-web` |
| SES-07 | A long seeded transcript keeps tail scrolling stable while the active turn streams under virtualization | `faults-web` |
| SES-08 | Backend restart or `session.error` shows an actionable error state and the thread recovers after reconnect | `faults-web` |

### Settings and Config

| ID | Scenario | Suite |
|---|---|---|
| CFG-01 | Theme and color-scheme changes apply immediately and survive reload | `smoke-web` |
| CFG-02 | Notebook settings autosave default persona, default intent, model, and full-text resource toggle through real config APIs | `core-web` |
| CFG-03 | Providers tab renders seeded provider state and validation errors without performing live OAuth | `core-web` |
| CFG-04 | MCP tab reflects seeded status, allows deterministic connect/auth/disconnect flows, and composer `/mcp` opens the same surface | `core-web` |
| CFG-05 | In desktop-boundary mode, a fake updater `ready` result shows the install-or-later toast path without attempting a real install | `core-web` |

### Teaching Surfaces

| ID | Scenario | Suite |
|---|---|---|
| TCH-01 | Persona and intent selection change available teaching surfaces and outgoing prompt metadata | `core-web` |
| TCH-02 | Starting an interactive lesson provisions the teaching workspace and opens the editor tab | `smoke-web` |
| TCH-03 | Reload inside an interactive session restores the teaching workspace, selected file, and saved-vs-dirty editor state | `core-web` |
| TCH-04 | Snapshot and capabilities tabs render seeded learner snapshot and runtime capability data | `core-web` |

### Resources and Diagrams

| ID | Scenario | Suite |
|---|---|---|
| RES-01 | Resource panel add, rename, rebuild, and remove flows update the list through real resource APIs | `core-web` |
| RES-02 | Preparing resources auto-refresh to `ready` without a page reload | `core-web` |
| RES-03 | Diagrams tab renders seeded Mermaid artifacts and fullscreen controls work | `core-web` |

### Desktop Shell

| ID | Scenario | Suite |
|---|---|---|
| DSK-01 | Title bar controls do not trigger window drag behavior | `desktop-shell` |
| DSK-02 | Native folder picker cancel leaves state unchanged and success opens the chosen notebook | `desktop-shell` |
| DSK-03 | Desktop storage persists theme, notebook registry, and last active notebook across relaunch | `desktop-shell` |

## Explicit Non-Goals

The implementation should not add tests for these just because vendor has them:

1. Terminal tabs or PTY reconnect
2. Command palette and command panels
3. Upstream worktree/workspace management
4. Title bar back/forward history
5. Share/open/review slash flows that Buddy does not expose
6. Real provider account login
7. Not-yet-implemented desktop deep links

## Implementation Order

1. Build the shared Playwright harness in `packages/web/e2e`, including fixtures, actions, selectors, and the minimal `__BUDDY_E2E__` driver.
2. Implement `smoke-web` first.
3. Add the missing Buddy-owned probes or seed paths required by `core-web`.
4. Implement `core-web`.
5. Add explicit reconnect and restart hooks, then implement `faults-web`.
6. Add real Tauri launch support and implement `desktop-shell`.

## Definition of Done

1. `smoke-web` is green on PR CI and does not rely on arbitrary sleeps.
2. `core-web` is green on main and nightly.
3. `faults-web` and `desktop-shell` are green in two consecutive nightly runs before a release cut.
4. Real provider auth remains a manual release checklist item until Buddy has a deterministic local auth harness.
5. New regressions in covered areas must add or update the lowest sensible automated test, with E2E used only when cross-layer behavior is the actual failure mode.
