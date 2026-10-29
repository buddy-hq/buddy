# UI E2E layer (harness plan, Tier 3): design

Status: design, 2026-10-22, by the orchestrator (Claude Opus). Tier 1 (conformance) checks contracts; this layer checks what the app shows. The 2026-10-22 computer-use run found three failures that were real only on screen (N1, G5, and the declined-tool header behind E1, E2 and E4), and N2 depended on the real quit path. No backend test can see those.

## Goal

About eight Playwright tests that launch the real Electron app built from this worktree, talk to a scripted model over loopback, and run with no network, no credentials and no real user data. They replace the computer-use driver for these flows; the computer-use spec stays for exploratory runs.

| ID | Flow | Asserts on screen |
|---|---|---|
| U1 | Boot, open a notebook, send, reply, reload | The reply renders once; after reload the same chat shows the same rows, once |
| U2 | Reload while a reply streams | The reply comes back and finishes once (no duplicate rows, no lost text) |
| U3 | Stop mid-reply, then prompt again | STOPPED divider; composer idle; the next prompt gets its reply |
| U4 | Approvals | Deny: STOPPED, the group header reads "Permission denied", the file does not exist. Allow once: the file exists, the row completes |
| U5 | Reference chip draft | A draft with an `@` reference chip survives a chat switch and an app restart, and sends with the chip |
| U6 | `/undo` and `/redo` | The undone prompt is in the composer at once; redo restores the turn once |
| U7 | Missing notebook | With a notebook's folder moved away, choosing its chat shows the missing-folder notice; the current chat stays usable |
| U8 | Quit mid-reply | After a normal quit and relaunch, the cut reply keeps its text and continues ("Continuing after restart"), not from scratch |

## Decisions

1. **Built app, not the dev server.** Build once with `bun run --cwd packages/desktop-electron build`, then `_electron.launch({ executablePath, args: [<desktop package dir>], cwd: <desktop package dir>, env })`. The executable comes from the package's own resolver (`scripts/electron-bin.ts`). Never use `scripts/dev.ts`: it kills other dev processes by pattern. Clear `ELECTRON_RUN_AS_NODE`, `ELECTRON_RENDERER_URL` and the backend reload variables.

2. **Scripted model over loopback, no production hook.** The test process runs a small OpenAI-compatible server (`POST /v1/chat/completions`, streaming SSE) on `127.0.0.1:<random port>`. The notebook's `.buddy/buddy.jsonc` declares it as provider `scripted` with `npm: "@ai-sdk/openai-compatible"`, `enabled_providers: ["scripted"]`, `model` and `small_model` set to `scripted/chat`, compaction and learner memory off. v2 maps that package to its built-in OpenAI-compatible provider, so nothing is installed and the bundled free provider is off. This exercises the real provider path, which an in-process plugin would skip.
   - **One scenario vocabulary for both tiers.** The server reads the last user message for the conformance marker `BEGIN_CONFORMANCE {json} END_CONFORMANCE` (the `Instruction` union in `packages/buddy/test/conformance/harness.ts`) and plays it: a reply, a reply split into deltas, a tool call followed by a final reply once the tool result arrives, and a gated stream that pauses mid-text until the test releases it. Move the instruction schema to a shared test helper that both the harness and the server import; do not fork it.
   - Requests without a marker (title generation, other internal calls) get a fixed short reply, so they never block a test.
   - The server records every request, so tests can wait for "the model was called" instead of sleeping.

3. **Isolation.** Every run gets a fresh temporary root holding `HOME` (and `USERPROFILE` on Windows), `BUDDY_DEV_USER_DATA_DIR`, the notebooks and the fixture state; it is deleted afterwards unless a test failed and `BUDDY_E2E_KEEP=1` is set. `BUDDY_TEST_XDG_ROOT` alone is not enough: the desktop derives its paths from userData and the home directory. Model-catalog and skill-artifact fetches are disabled the way `packages/buddy/test/preload.ts` does it. If login-shell environment import (`src/main/shell-env.ts`) pulls the owner's environment into the app, add a test-only switch that skips it.

4. **Seed state; drive the UI only where the flow is the UI.** Before launch, seed `buddy.onboarding.dat` (`setupCompleted: true`) and the notebook registry (`desktop-notebooks.json`) so the app opens on `/chat`. U1 instead opens its notebook through the real "New notebook → Open existing folder" flow, with `dialog.showOpenDialog` stubbed via `electronApp.evaluate`. The pilot confirms the seed file formats against `createPlatformJsonStorage` and the registry code.

5. **Reload and restart use the real paths.** Reload: `webContents.reload()` on the main window via `electronApp.evaluate`. Restart: `electronApp.close()`, which is a normal quit and, after N2F, waits for the backend stop. Then relaunch with the same root. U8 depends on that path.

6. **Selectors: roles and names first, a few attributes added.** Use what exists: approval buttons by name, `role=alert` for the dock, `[data-timeline-row]`, `[data-activity-row]`, `[data-activity-entry]`, sidebar `data-directory`/`data-session-id`, `[data-action=prompt-submit]`. Add only what accessibility should have anyway: an accessible name on the composer textbox, `aria-expanded` on the activity group header, and a part ID on activity entries. No test-only IDs in product markup.

7. **Windows stay off the owner's main monitor.** The app has no hidden mode, and hidden windows can throttle rendering. Locally, move every window to the second monitor (macOS global x = 2600, the portrait BenQ) as soon as it opens, via `electronApp.evaluate` hooking `browser-window-created`. Expose the position as `BUDDY_E2E_WINDOW_POSITION`. If the first window flashes on the main monitor, add a test-only window-position switch in `src/main/windows.ts`.

8. **Run policy.** Playwright Test, `workers: 1`, serial, one app instance reused across flows where state allows, with explicit restarts only in U5 and U8. A package script `test:e2e` in `packages/desktop-electron`; it never runs inside `bun test` or the root suites. Local only until it is stable; then macOS and Windows GUI jobs in CI (the current test CI is Ubuntu). One Electron instance per agent at a time.

9. **Waiting.** No sleeps. Wait on fixture-server requests, on settled UI states (the activity header stops shimmering; the composer is enabled), or on `expect.poll` with a bounded timeout. Activity labels animate, so assert after settling.

## Layout

```
packages/desktop-electron/e2e/
  playwright.config.ts
  fixtures/app.ts               build check, isolated root, seeding, launch, window placement, reload, restart
  fixtures/model-server.ts      OpenAI-compatible SSE server playing conformance instructions, with gates
  fixtures/notebook.ts          notebook folders and .buddy/buddy.jsonc with the scripted provider
  chat.spec.ts                  U1, U2, U3
  approvals.spec.ts             U4
  composer.spec.ts              U5, U6
  robustness.spec.ts            U7, U8
packages/buddy/test/helpers/scripted-instruction.ts   shared Instruction schema and marker (moved from the harness)
```

## Delivery

1. **E1 pilot (one Sol worker).** Shared instruction helper, `fixtures/*`, the Playwright config and script, the three accessibility attributes, and U1 green. It proves the risky parts: build-and-launch, the loopback provider, seeding, the dialog stub and window placement. It does not touch N2F's files (`src/main/index.ts`, `backend-utility.ts`, `scripts/dev.ts`).
2. **E2 flows (two Sol workers in parallel, after the pilot lands).** One owns `chat.spec.ts` and `approvals.spec.ts` (U2–U4); the other owns `composer.spec.ts` and `robustness.spec.ts` (U5–U8). Neither edits the fixtures; fixture changes go back to the orchestrator.
3. **Who runs it.** Worker sandboxes cannot bind loopback ports or open windows, so workers write code and the orchestrator runs `test:e2e` and returns failures with traces. Windows appear on the owner's second monitor while it runs.

## Risks

- Onboarding or startup may fetch remote resources (system skill pack, model catalog) despite the switches; any non-loopback request must fail the test fixture, not hang.
- First-window selection may grab the loading window; pick the main window by URL.
- A fresh build per run is slow; the fixture checks whether `out/` is newer than the sources and rebuilds only when needed.
- On macOS the first launch may trigger permission prompts (files, network); the pilot records any and how they were avoided.
- The OpenAI-compatible stream must match what v2's native provider parses (tool-call deltas especially); the pilot covers a tool call in U1's setup, not only text.
