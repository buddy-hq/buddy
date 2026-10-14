# End-to-end computer-use test spec: Buddy on OpenCode v2

Audience: an agent with computer-use tools on the user's Mac, working in the worktree `/Users/prashantbhudwal/Code/buddies/v2-upgrade` (branch `v2-upgrade`). The job is to drive the Electron dev app built from this worktree through Buddy's main user journeys, record pass/fail with evidence, and fix what breaks. The run brief may say report-only; if so, skip §6.

Read first: `AGENTS.md`, `STATUS.md`, and the last ~20 entries of `LOG.md` in this folder. They explain what changed in the migration:

- PermissionV2 replaced v1 permissions.
- Forms replaced questions.
- Subagents use the native `subagent` tool, can run in the background, and report completion through `session.inbox.*` events.
- The host config file is watched for changes.
- The gateway in `packages/opencode-adapter/src/gateway/*` maps v2 shapes to `@buddy/transcript-contract`.

## 1. Hard rules

- **Isolated data only.** Always launch with `BUDDY_DEV_USER_DATA_DIR` set as in §2. Without it, the dev app uses the shared `~/Library/Application Support/ai.buddy.desktop.dev`. Every checkout's dev app uses that folder, including the user's running ones, and v2 would migrate its `opencode.db` in place.
- **One window only.** Touch only the window titled **`Buddy Dev — v2-upgrade`**. The user's other checkouts (`workshop`, `buddy`) run their own `Buddy Dev — <branch>` apps: never click, type into or quit those.
- **Processes.** Stop only the dev server you started (see §2). Never kill Buddy, Electron or dev servers by name or pattern.
- **One dev server per worktree.** `scripts/dev.ts` kills any other dev process from the same worktree, so only one agent may drive the app at a time. Other agents can fix bugs from the report but must not start a second dev server here.
- **No credentials.** Use free OpenCode models only. Do not sign in to ChatGPT/OpenAI or any provider, paste API keys, accept OAuth, or enter passwords.
- **No real MCP servers and no downloads** (no `npx`/`bunx` installs).
- **Don't touch:** the real `~/.buddy`, `.buddy` folders outside the E2E root, or `vendor/opencode`. v2 reads `~/.claude/skills` and `~/.agents/skills` from the real home; that is accepted, but read-only, so never write there.
- **No git** commit, stash, reset, checkout or restore. Never revert other agents' changes.

## 2. Setup

```bash
E2E=/private/tmp/buddy-v2-e2e
```

- If `$E2E` already exists from an earlier run, move it aside to `$E2E-<timestamp>`; don't delete it.
- Create:
  - `$E2E/userdata` (empty).
  - `$E2E/notebooks/v2-smoke/README.md`: a few lines about the water cycle.
  - `$E2E/notebooks/v2-smoke/notes.md`: one line.
  - `$E2E/notebooks/v2-second/README.md`: one line.
  - `$E2E/shots/`.

Launch from the worktree root as a background process that outlives your command, and record its PID:

```bash
BUDDY_DEV_USER_DATA_DIR="$E2E/userdata" nohup bun dev:desktop > "$E2E/dev.log" 2>&1 &
```

**Boot.**
- First boot builds the backend and SDK, which takes about 1–2 minutes.
- Ready when `dev.log` shows `--> GET /api/health 200` and the window opens.
- If `/api/health` keeps returning 500, read the first `[backend]` error above the poll lines. That is how the missing-wasm failure showed up; it is fixed in `packages/buddy/script/build-node.ts`.

**Isolation check (once).** After boot, `find "$E2E/userdata" -name 'opencode*.db'` must find the database. If it doesn't, stop and report: data is going somewhere else.

**Computer-use target.**
- App name: `Buddy Dev — v2-upgrade`.
- Bundle: `$TMPDIR/buddy-electron-dev/<cacheKey>/dist/Electron.app`, with bundle id `ai.buddy.desktop.dev.<cacheKey>`. Read the id with `plutil -extract CFBundleIdentifier raw <app>/Contents/Info.plist`.
- Request access only for that app.

**Opening a notebook.** Use the app's open-notebook action. In the macOS folder dialog, press Cmd+Shift+G, type the path, press Enter, then click Open.

**Stopping.**
- In `ps -axo pid,ppid,command`, follow the launch PID down to the `bun ./scripts/dev.ts` process and send it SIGTERM. It tears down electron-vite, Electron and the backend.
- Then confirm no process mentions `$E2E/userdata` or `buddies/v2-upgrade/packages/desktop-electron`.
- Restart by repeating the launch command, with the same `$E2E`.

## 3. Evidence and reporting

- Report: `docs/architecture/v2-upstream/v2-migration/reports/e2e-computer-use-<YYYYMMDD-HHMM>.md`.
- One row per case:
  - ID and result: `PASS`, `FAIL`, `BLOCKED (model)`, `BLOCKED (env)` or `NOT RUN`.
  - What you did, what you saw, and what you expected.
  - Screenshots: `$E2E/shots/<ID>-<n>.png`.
  - Matching `dev.log` lines: `[backend]` errors, 4xx/5xx, stack traces.
  - Renderer console errors, if DevTools is reachable (View menu or Cmd+Opt+I).
- Free models are nondeterministic.
  - If the model fails to call a tool or ignores an instruction, retry once with a more explicit prompt, then once with another free model.
  - Only then mark it `BLOCKED (model)`.
  - A UI or backend error is `FAIL` even if the model also misbehaved.
- After every group, scan `dev.log` for `500`, `Unhandled`, `AgentNotFound`, `CommandNotFound`, `Cannot find module`, `tree-sitter` and `ENOENT`, and attach new hits to the case that caused them.

## 4. Test cases

Run them in order; later groups reuse earlier state. Each case lists the v2-specific risk to watch for.

### A. Boot and onboarding

| ID | Steps | Expect | Watch for |
|---|---|---|---|
| A1 | Cold boot (fresh `userdata`) | Window opens with no blank screen or error toast; `dev.log` has no 5xx after health turns 200 | Backend crash at host creation |
| A2 | Onboarding: choose the free-models option and finish | A free model is selected (preferred `deepseek-v4-flash-free`, variant `max`); no "free model unavailable" | Empty provider catalog; the free OpenCode provider (`apiKey: "public"`) not enabled |
| A3 | Open the model picker, switch to another free model, reopen the picker | Only zero-cost OpenCode models are listed; the choice persists | Paid models listed without a key; selection reverts |

### B. Notebooks

| ID | Steps | Expect | Watch for |
|---|---|---|---|
| B1 | Open `$E2E/notebooks/v2-smoke` | File tree shows `README.md` and `notes.md`; the chat is ready | Notebook config plugin errors in `dev.log` |
| B2 | Send one message, open `$E2E/notebooks/v2-second`, send one message, switch back and forth | Each notebook's session list shows only its own sessions | Sessions leaking across notebooks (they share v2's `global` project ID; fixed in fx-review2b) |

### C. Chat core

| ID | Steps | Expect | Watch for |
|---|---|---|---|
| C1 | In v2-smoke: "Say hello in one sentence." | Text streams and completes; input re-enables; a session title appears | Stuck "running"; no streaming (all text arrives at the end) |
| C2 | Follow-up that depends on C1's answer | Correct use of context | Lost history |
| C3 | Reload the renderer (Cmd+R) | Transcript identical; no duplicate or missing messages or parts | History projection vs live projection mismatch |
| C4 | Stop and relaunch the dev app (§2) | Sessions and transcripts persist, including tool cards from later groups if run after D | Persistence or projection gaps |
| C5 | "Write a 1500-word essay on photosynthesis." Click Stop after about 2 s | Streaming stops; UI goes idle; partial text kept; the next prompt works | Abort 404 or 500 in `dev.log`; stuck running state |
| C6 | Send a second message while a reply is streaming (if the UI allows) | Queued or delivered and answered; nothing hangs | Prompt admission/inbox hang; duplicate user message |

### D. Tools and permissions (PermissionV2)

| ID | Steps | Expect | Watch for |
|---|---|---|---|
| D1 | "Read README.md and summarize it." | A read tool card with the path; no permission ask for an in-notebook read | Wrong path display; card stuck running |
| D2 | "Append the line 'E2E edit' to notes.md." | No permission ask: in-notebook edits are allowed by default, as in v1, where OpenCode's default was `"*": "allow"` with an ask only for external directories. The file changes on disk (check with `cat`) and a diff card renders | Diff card missing; edit card stuck |
| D3 | "Create the file /private/tmp/buddy-v2-e2e/outside.txt containing 'x'" (outside the notebook but inside the E2E root, so an accidental Allow is harmless). Deny it | External-directory ask with the path; after Deny no file exists (`ls`); the agent acknowledges; chat continues | Session hangs after deny; file written without approval |
| D4 | "Run `ls -la` in the notebook folder." | Runs without an ask (v1 default) and the output card renders | `tree-sitter`/wasm errors (the shell parser runs here) |
| D5 | "Read the file /etc/hosts." | External-directory ask shows `/etc/hosts`; Deny; nothing is read | Read without asking (containment regression) |
| D6 | If an "always allow" option exists, use it on a shell command, repeat the same command, then repeat it in a new session | Record the actual behaviour: no re-ask in the same session is expected | Rule not persisted, or leaking beyond its scope |
| D7 | If the dock accepts a denial reason, deny with "use a different approach" | The next reply reflects the feedback | Feedback dropped |

### E. Questions and forms

| ID | Steps | Expect | Watch for |
|---|---|---|---|
| E1 | "Before answering, use your question tool to ask me a multiple-choice question about which ocean to describe." Answer it | The question UI shows the options; the agent continues using the answer | Form event not rendered (v2 `form.*` → Buddy question mapping) |
| E2 | Repeat, but dismiss/cancel the question | UI clears; the agent gets the cancellation; chat usable | Stuck pending question |

### F. Slash commands and skills

| ID | Steps | Expect | Watch for |
|---|---|---|---|
| F1 | Type `/` in the composer | Menu lists commands and skills. It may be empty for a few seconds after opening a notebook: wait 10 s, retype, and record the delay | Permanently empty list |
| F2 | Run a listed command | Runs; the transcript shows a compact command display | 500 / CommandNotFoundError |
| F3 | Run a skill-only entry with arguments | Runs as a prompt with the skill attached; transcript shows `/name args` | CommandNotFoundError (fixed in fx-review2b) |
| F4 | If any command produces no prompt, run it | No crash; session updates and goes idle | Web crash on a `Session` response (fixed this session) |

### G. Teaching features and subagents

| ID | Steps | Expect | Watch for |
|---|---|---|---|
| G1 | "Make me a flashcard deck of 5 cards about the water cycle." | A subagent card attributed to the flashcard author; a generated deck card that opens | Card missing child attribution; v1 `task` shapes |
| G2 | Open the child from the card in Bench, then go back | Bench shows the child transcript; owner chat resolves correctly | Wrong owner after reload (missing ancestors) |
| G3 | "In the background, create a 5-question practice set on fractions. Meanwhile, tell me one fun fact." | A running-work indicator/menu appears while the child runs; the owner chat stays usable; a completion row (success) appears when it finishes | No completion row (`session.inbox.enqueued` path); duplicate rows |
| G4 | Start another background child and Stop it from the running-work menu | The child stops; the completion row shows cancelled; the owner is unaffected | Stop does nothing; owner aborted too |
| G5 | Reload (Cmd+R) while a background child runs | Running state rehydrates; completion arrives exactly once | Lost or duplicate completion |
| G6 | After the C4 restart, scroll through G1–G4 | Historical subagent cards and completion rows render | History projection gaps |

"Continue in background" for an already-running blocking child is **not built**. If the UI shows it, record what it does.

### H. Bench

| ID | Steps | Expect | Watch for |
|---|---|---|---|
| H1 | Open `README.md` in Bench and ask "What does the open file say?" | The answer uses the open file | Bench context missing |

### I. Settings

| ID | Steps | Expect | Watch for |
|---|---|---|---|
| I1 | Open provider settings, plus any config views | The free OpenCode provider is shown; no secret values anywhere (presence or redaction only) | Raw config or keys exposed |
| I2 | Add a local MCP server with an invalid command, e.g. `/nonexistent/mcp-server`. Check it in both Settings → MCP and the notebook settings dialog in the sidebar, then remove it | In both places the status shows "Connecting…" (pending) with Connect disabled, then failed, settling without user action; removal updates the list | Status stuck on pending; Connect clickable while pending (the sidebar dialog was fixed at handoff, never seen live) |
| I3 | Toggle global auto-compaction off and on | `find "$E2E/userdata" -name buddy-host-config.json` content flips immediately, without restart; no errors | Toggle needs restart (fixed this session) |
| I4 | Toggle concise responses (if present) and send a prompt | Reply verbosity changes plausibly | Toggle ignored |

### J. Robustness

| ID | Steps | Expect | Watch for |
|---|---|---|---|
| J1 | While the app runs, move `$E2E/notebooks/v2-second` to `$E2E/notebooks/v2-second-moved` and switch to that notebook in the app | Graceful error or an empty state; other notebooks keep working; no crash loop | Plugin setup failure cascading (fixed by fx-tests1) |
| J2 | Final `dev.log` scan (patterns in §3) | No unexplained 5xx or unhandled errors | — |

This run is macOS only. Record anything path-related that looks Windows-sensitive (separators, drive letters, case) as a note.

## 5. Known state at handoff (2026-10-08 ~12:00 IST)

**Passing**
- Root `bun typecheck` passes 13/13.
- Package typechecks pass: buddy, adapter, transcript-contract, web.
- The focused Buddy test sweep is 537 pass / 0 fail.
- Lint passes except the vendor guard, which fails on the uncommitted v1→v2 vendor swap; that is expected until it is committed as a vendor sync.

**Verified live:**
- Desktop dev app: boot, `/api/health` 200, and provider/config/open-project requests 200.
- Headless Node-bundle smoke with a real free model (`reports/headless-node-smoke.md`): 12/12 valid cases pass, covering chat, shell, edits, external-directory ask and deny, abort and recovery, and a blocking flashcards subagent with correct attribution.
- Not yet exercised live: the UI itself, forms, background subagents and settings.

**Known open**
- "Continue in background" is not built.
- Command/skill lists are empty until a notebook's plugins finish loading.

**Deferred by the user**
- The desktop v1→v2 session migration is a no-op under Node. It doesn't matter here (fresh userdata), but don't test with old dev data.
- ChatGPT token-refresh single-flight.

## 6. Fix loop

For each `FAIL`, one at a time:

1. **Reproduce** in the app and capture evidence.
2. **Find the root cause** in Buddy code only:
   - `packages/opencode-adapter/src/gateway/*`: the v2 → Buddy mapping; the only package allowed to import `@opencode/*`.
   - `packages/buddy/src/**`: routes, the runtime plugin, and features.
   - `packages/web/src/**`.

   Never edit `vendor/opencode`. If a fix needs a vendor patch or a product decision, record it under **Deferred** in the report and move on.
3. **Fix it with a focused regression test.** Use the sandbox helpers:
   - `packages/buddy/test/preload.ts`
   - `test/helpers/temporary-environment.ts`
   - `test/helpers/opencode.ts`
   - `test/opencode-runtime/scripted-model.ts`
   - `test/session/v2-write-fixture.ts`

   Never point tests at the real home, userData, XDG roots or `.buddy`.
4. **Verify:**
   - Focused tests via package scripts. From `packages/buddy`: `bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts <files>`. Adapter and web: their `test` scripts with file arguments.
   - `bun ./node_modules/oxlint/bin/oxlint --config ./.oxlintrc.json <files>`.
   - The affected package's `typecheck` script, never two at once.
   - Never run root `bun test`.
5. **Pick up the change in the running app:**
   - Backend source changes trigger the dev script's backend rebuild and reload (watch `dev.log`).
   - Web changes hot-reload.
   - Changes under `packages/buddy/script/` or `packages/desktop-electron/` need a dev-server restart.
6. **Re-run** the failing case and its neighbours in the app.
7. **Log** one bullet in `LOG.md` (symptom → root cause → fix → files → test) and update the case's row in the report.

Code rules:
- No code comments unless the surrounding file uses them for the same purpose.
- Match the surrounding style.
- No `as` casts without `// SAFETY:`, no runtime `typeof`, and no `unknown` parameters except `cause` (`.oxlintrc.json`).
- Edits must work on Windows too.

## 7. Finish

1. Stop the dev server you started (§2) and confirm nothing from this run is still running. Leave `$E2E` in place for inspection.
2. Run `bun typecheck` from the root if you changed code.
3. Update `STATUS.md` phase 8 with the result counts.
4. Final message, under 300 words:
   - counts by result;
   - fixes with files and tests;
   - open failures and deferred items;
   - the report path.

## Kickoff prompt (paste to the driving agent)

> Worktree `/Users/prashantbhudwal/Code/buddies/v2-upgrade`. Follow `AGENTS.md`. Read `docs/architecture/v2-upstream/v2-migration/e2e-computer-use-spec.md` and execute it end to end with your computer-use tools: setup (§2), all cases in §4 in order, the fix loop in §6 for every FAIL, then finish (§7). Hard rules in §1 are absolute: isolated `BUDDY_DEV_USER_DATA_DIR` only, touch only the `Buddy Dev — v2-upgrade` window, free models only and no credentials, stop only the dev server you started. If you hit a usage limit or must stop early, first update the report with every case's status so far and write `docs/architecture/v2-upstream/v2-migration/handoff-e2e.md` (cases done/pending, fixes in progress with files, how to resume).

For a report-only run, replace "the fix loop in §6 for every FAIL" with "report only; make no code changes".
