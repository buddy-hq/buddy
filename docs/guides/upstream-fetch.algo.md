# Upstream Fetch Algorithm (Buddy + Vendored OpenCode)

This is the repeatable process to sync `vendor/opencode` while preserving local Buddy work and avoiding vendor patch drift.

The algorithm is a safety and evidence scaffold, not the objective. Deviate from its ordering or individual command shapes when required by the selected snapshot, and record material deviations in the sync log. Completion means that the upstream snapshot and any requested Buddy migration work through Buddy's real product paths; mechanically completing the listed commands while Buddy remains broken is not completion.

## Inputs
- Buddy repo root: `/Users/prashantbhudwal/Code/buddy`
- Upstream mirror remote: `opencode-upstream` (GitHub)
- Local upstream clone: `/Users/prashantbhudwal/Code/opencode`
- Target upstream source: latest stable OpenCode tag unless a different tag is requested explicitly

## Rules
1. Do not trust helper scripts as source of truth.
2. Assume working tree is dirty; do not reset/revert unrelated files.
3. Keep vendor clean; put Buddy-specific behavior in Buddy/adapter/build layer.
4. Validate with real commands before and after sync.
5. Vendor guard is active on local hooks and push checks for `vendor/opencode/**`; for intentional validated vendor syncs, use `ALLOW_VENDOR_SYNC=1` on guarded git commands.
6. Treat `packages/buddy` and `packages/desktop-electron` as the primary Buddy-owned compatibility surface after sync. `packages/opencode-adapter` is an internal implementation package; validate it through Buddy consumers first, not as an isolated release gate.
7. Do not reintroduce vendored runtime patches that Buddy has already moved out to Buddy-owned boundaries. In particular:
   - keep plugin `ask()` compatibility localized to `packages/buddy/src/opencode-runtime/plugin-ask-compat.ts`
   - keep LLM event compatibility localized to `packages/opencode-adapter/src/llm.ts`
   - keep session identity/permission normalization in `packages/opencode-adapter/src/session.ts` and `session-live.ts`
   - keep tool UI decoration on Buddy-owned HTTP/SSE boundaries, not vendored `Session.updatePart` / `LLM.stream`
8. If the dry run fails only inside `vendor/opencode/**` or only in a standalone `packages/opencode-adapter` typecheck that does not reproduce in Buddy consumers, stop before churning Buddy wrappers. Fix Buddy only when the failure actually crosses the Buddy-owned boundary.
9. A sync may explicitly include Buddy adoption of upstream v2 capabilities. Treat that as a combined vendor-sync and Buddy-migration operation, not as a mechanical subtree refresh:
   - record every candidate v2 capability in the sync log with its Buddy owner, adoption decision, blocker, and validation evidence
   - migrate only capabilities that are implemented and usable through Buddy's complete execution path; presence in `packages/core` alone is not sufficient
   - migrate connected contracts together (for example session API + SDK + events + web streaming, or permission requests + replies + persistence + location/project identity)
   - preserve Buddy-owned teaching, persona, feature, skill, and subagent policy when upstream only replaces the generic runtime mechanism
   - delete superseded Buddy bridges only after the replacement path passes focused regression and live smoke checks
10. For a combined v2 adoption sync, the current vendored source is the implementation baseline and `docs/architecture/v2-upstream/**` is a research aid. Revalidate dated findings against the selected tag because v2 implementation status and hook surfaces can change between snapshots.
11. Do not adapt upstream v2 surfaces back into Buddy's v1 contracts. For every adopted capability, migrate the connected Buddy backend, adapter call sites, generated SDK, frontend, and tests to the v2 contract directly. Do not add dual-protocol fallbacks or v2-to-v1 translation shims. `@buddy/opencode-adapter` may remain for in-process embedding and Buddy-owned seams, but it must not disguise v2 as v1. If a capability cannot be migrated coherently end to end, leave it wholly on v1 and record the blocker instead of creating a hybrid path.
12. Use the selected tag's OpenCode desktop/app as the v2 adoption map. If the vendor app uses v2 for a product surface, Buddy must migrate that surface to v2 as part of a combined adoption sync. Audit `packages/app`, the desktop wrapper, SDK v2 calls/types, server handlers, and core implementation together. Defer only surfaces the stable vendor app itself still keeps on v1 or Buddy-specific behavior with no v2 equivalent, and record exact source evidence.
13. Treat the stable desktop as the mandatory compatibility floor, not the complete v2 horizon. Every combined v2 sync must also inspect the current `upstream/dev` and `upstream/v2` tips so Buddy sees upcoming cutovers before they reach a stable tag. Do not adopt an untagged branch implementation merely because it exists; distinguish backend implementation, desktop activation, and stable release explicitly.

## Algorithm
1. Create a checkpoint log entry.
   - File: `docs/ops/logs/upstream-fetch.<date>.md`.
   - Record current date/time, branch, short `git status`, and whether the run is a mechanical sync or a combined sync plus v2 adoption.
   - For v2 adoption runs, initialize a capability ledger with: upstream capability, current Buddy bridge, intended disposition, end-to-end adoption gate, validation, and status.

2. Capture baseline and prove no destructive actions are needed.
   - `git status --short`
   - `git branch --show-current`
   - Keep this output in log.

3. Independently verify upstream delta and choose the target tag (no script trust).
   - `git fetch opencode-upstream --tags`
   - `git -C /Users/prashantbhudwal/Code/opencode fetch origin --tags`
   - Determine the latest stable tag:
     - `git -C /Users/prashantbhudwal/Code/opencode tag --sort=-version:refname | head`
   - Compare Buddy's vendored version (for example `vendor/opencode/packages/opencode/package.json`) with the target tag's version.
   - Spot-check the target tree if needed:
     - `git -C /Users/prashantbhudwal/Code/opencode rev-parse <tag>^{tree}`
   - For a combined v2 adoption sync, refresh and record the forward-looking branch tips too:
     - `git -C /Users/prashantbhudwal/Code/opencode fetch upstream dev v2`
     - `git -C /Users/prashantbhudwal/Code/opencode log -1 --format='%H %cI %s' upstream/dev upstream/v2`
   - The selected stable tag remains the vendored source unless the developer explicitly requests an untagged branch. The branch tips are horizon evidence, not permission to vendor unreleased code.
   - If the vendored version already matches the requested/latest stable tag, stop.

4. Run compatibility dry-run in a temporary worktree.
   - Create temp worktree from current HEAD:
     - `tmp=$(mktemp -d /tmp/buddy-vendor-check-XXXXXX)`
     - `git worktree add -b codex/vendor-check-<date> "$tmp" HEAD`
   - In temp worktree:
    - Prefer copying the verified local upstream tag snapshot into place:
      - `git -C /Users/prashantbhudwal/Code/opencode archive <tag> | tar -x -C "$tmp/vendor/opencode"`
      - or `rsync -a --delete "/tmp/opencode-tag-snapshot/" "$tmp/vendor/opencode/"`
    - Use `git subtree pull --prefix vendor/opencode local_opencode <tag> --squash` only if you explicitly need to inspect subtree-merge behavior; do not make subtree conflict resolution in temp the default validation path.
    - Align Buddy root workspace catalog with the swapped vendor snapshot:
      - `bun run vendor:sync-catalog`
    - `bun install`
    - If install fails because the root workspace is missing dependencies or overrides required by the new upstream snapshot, patch those root files in temp too before judging the sync.
    - `bun typecheck`
    - `bun lint`
    - `bun run --cwd packages/buddy test:contracts`
    - `bun run --cwd packages/web test:contracts`
    - `bun run --cwd packages/buddy build:node`
    - `bun run --cwd packages/desktop-electron build`
    - `bun run --cwd packages/desktop-electron smoke:backend-utility`
    - Optional diagnostic only:
      - `bun run --cwd packages/opencode-adapter typecheck`
      - If this fails but `bun typecheck` stays green and the failure is confined to vendored imports, log it as a non-gating adapter diagnostic. Do not block the sync on that alone.
   - Before accepting the temp sync, explicitly review these Buddy compatibility hotspots:
     - Plugin boundary contract drift:
       - `packages/buddy/src/opencode-runtime/plugin-ask-compat.ts`
       - `packages/buddy/src/opencode-runtime/buddy-tool-shim.ts`
       - keep Promise/Effect normalization at this single seam; do not spread compatibility shims through individual tools or tests
     - LLM event compatibility:
       - `packages/opencode-adapter/src/llm.ts`
       - keep parsing structural; do not key Buddy logic off upstream exported event unions or event-tag names
     - Session wrapper compatibility:
       - `packages/opencode-adapter/src/session.ts`
       - `packages/opencode-adapter/src/session-live.ts`
       - keep readonly-safe permission normalization and wrapper-level canonicalization here; do not patch vendored `Session.Service`
     - Buddy tools that previously used direct `fs` writes or reads instead of the upstream tool/runtime path.
     - Session prompt/command routes that mutate Buddy state before the vendored runtime confirms the target session exists.
     - Runtime bootstrap modules that can read global storage paths before Buddy sets XDG/runtime-root env vars.
     - Route-layer error normalization for malformed JSON and schema-validation failures.
     - Dynamic tool visibility paths:
       - Buddy plugin tools are now pre-registered per instance and exposed via permissions/config, not ad hoc runtime registry churn
       - verify enable/disable/re-enable still changes the visible tool surface without requiring vendored registry edits
     - Tool UI decoration paths:
       - `packages/buddy/src/http/opencode-event-stream.ts`
       - `packages/buddy/src/session/orchestration/core-actions.ts`
       - do not restore tool UI mutation by patching vendored runtime methods
     - Config/tool/permission overlay isolation across directory changes and runtime disposal/recreation.
     - Desktop renderer asset paths after package moves or build-config changes, especially `publicDir`, loading screens, and chat empty-state assets.
   - For a combined v2 adoption sync, also compare the selected snapshot against `docs/architecture/v2-upstream/**` and update the capability ledger. At minimum audit:
     - session create/prompt/read/context/event support and any still-unavailable operations
     - SDK and route availability for the v2 session contract
     - `session.next.*` message and tool-input streaming through the Buddy web client
     - PermissionV2 requests, replies, saved approvals, deny precedence, and project/location ownership as one coherent path
     - AgentV2, ConfigV2, and PluginV2 coverage versus Buddy personas, overlays, tools, and chat hooks
     - child-session identity and generic permission derivation versus Buddy teaching/subagent forwarding
     - skill visibility/filtering behavior
     - Buddy adapter patches that can be removed only after their v2 replacement is proven end to end
   - For every major API, record a three-way v2 status instead of one ambiguous `v2` label:
     1. **stable desktop active** — the selected tag's desktop actually calls the v2 SDK route and consumes its events/types;
     2. **v2-branch desktop active** — current `upstream/v2` desktop actually calls the v2 route rather than only importing v2 types;
     3. **backend ready only** — SessionV2, PermissionV2, PluginV2, or another v2 service/handler exists but neither desktop path has activated it.
   - Apply that three-way check explicitly to sessions/prompts, session reads, permissions, plugin hooks/tool registration, tools and tool-input events, agents, config, skills, messages, commands, MCP, auth, and server routes.
   - Prove desktop activation with concrete call-path evidence: desktop call site, generated SDK method and URL, server handler/service, and event/reply contract. Importing `@opencode-ai/sdk/v2` or having a v2 backend handler is not by itself an active desktop cutover.
   - A stable-desktop cutover is mandatory migration work in the current sync. A v2-branch desktop cutover is a tracked upcoming migration with named Buddy blockers and a prepared test plan. Backend-ready-only work stays deferred without compatibility shims.
   - If this fails, stop and fix before touching real tree.

5. Ensure no Buddy-only patch remains in vendor.
   - Spot-check for any Buddy-owned source drift under `vendor/opencode/**` before accepting the sync.
   - Verify no Buddy runtime env override dependency has leaked back into vendored OpenCode:
     - `rg -n "OPENCODE_MIGRATION_DIR|BUDDY_RUNTIME_ROOT" vendor/opencode/packages/opencode/src`
   - If a fix seems to require a vendor patch, stop and move that behavior to Buddy build/runtime/adapter unless the sync itself is intentionally introducing a tracked vendored patch.

6. Apply validated changes to the real (possibly dirty) workspace safely.
   - Use temp worktree as source of truth.
   - Copy validated vendor directory back:
     - `rsync -a --delete "$tmp/vendor/opencode/" "vendor/opencode/"`
   - Carry over any validated root-workspace changes required for the snapshot to install and link correctly (for example `package.json`, `bun.lock`).
   - Re-run `bun run vendor:sync-catalog` in the real workspace before install so
     Buddy root catalog keys match the validated vendor snapshot.
   - Carry over the full validated Buddy-side fix set proven in temp into the current repo; do not leave the real workspace half-updated while judging the sync.
   - Do not touch unrelated paths.

7. Re-link dependencies in real workspace.
   - `bun install`
   - If the real workspace behaves differently from temp because of stale links or modules, clean the affected workspace `node_modules` state and reinstall before debugging code changes.
   - This prevents stale workspace link/module-resolution failures after large vendor updates.

8. Run post-sync validations in real workspace.
   - `bun typecheck`
   - `bun lint`
   - `bun run --cwd packages/buddy test:contracts`
   - `bun run --cwd packages/web test:contracts`
   - `bun run --cwd packages/buddy build:node`
   - `bun run --cwd packages/desktop-electron build`
   - `bun run --cwd packages/desktop-electron smoke:backend-utility`
   - Also run focused Buddy regression checks for the known sync-risk surfaces:
     - lesson-workspace write path uses upstream write runtime, not raw `fs`
     - missing-session prompt/command routes fail before Buddy state mutation
     - same-project nested sessions do not false-404 on prompt send
     - runtime root / XDG bootstrap honors `BUDDY_RUNTIME_ROOT`
     - malformed JSON and validator failures both return Buddy’s standard `{ "error": string }` envelope
     - Buddy dynamic tool visibility still shrinks and expands through permission/config changes
     - SSE `message.part.updated` frames still carry Buddy `toolUi` decoration after the Buddy-owned event-stream transform
     - overlay isolation holds for agent/subagent/tool/config/permission overlays across instance resets
     - Electron quick-chat / loading logo resolves in both packaged (`file:`) and dev (`http:`) renderer modes
   - Prefer dedicated targeted tests over broad suites; the goal is to prove Buddy compatibility, not to brute-force vendor coverage.

9. Run a real server and curl-smoke every changed Buddy-owned HTTP path.
   - Start the Buddy server from the current repo, not the temp worktree.
   - For concrete command shapes and route gotchas, see `docs/guides/buddy-http-curl-smoke.md`.
   - Enumerate changed Buddy-owned server paths from the sync diff before smoking. At minimum inspect:
     - `packages/buddy/src/routes/**`
     - `packages/buddy/src/http/**`
     - `packages/buddy/src/session/orchestration/**`
   - For every touched route/compatibility surface, run a real `curl` request against the live server.
   - Include at least:
     - `GET /api/health`
     - `GET /api/event?...` for SSE/compatibility changes
     - every touched session route with a valid request shape
     - malformed/negative cases for any route whose error normalization changed
   - Log the exact curl commands and status codes. Do not treat unit tests as a substitute for this step.

10. Verify vendor cleanliness against local upstream clone.
   - Direct spot check:
     - `git diff --no-index -- vendor/opencode/packages/opencode/src/storage/db.ts /Users/prashantbhudwal/Code/opencode/packages/opencode/src/storage/db.ts`
   - Optional broad compare with excludes:
     - `diff -qr --exclude .git --exclude node_modules --exclude .turbo --exclude dist --exclude findings.md --exclude notes /Users/prashantbhudwal/Code/opencode vendor/opencode`
   - Accept local-clone-only artifacts; reject tracked source drift.

11. Shrink temporary compatibility shims before finalizing.
   - If the first green pass used adapter wrappers to absorb upstream API churn, remove the wrappers that only preserve Buddy's old calling conventions.
   - Prefer migrating Buddy boundary call sites to upstream types and entrypoints when that reduces future sync cost (for example branded IDs, renamed server entrypoints).
   - Keep the adapter only for Buddy-owned config/runtime seams.
   - Do not "simplify" by moving compatibility back into vendored runtime patches when the same behavior already has a Buddy-owned boundary.

12. Stop and ask whether the current repo is ready to squash and commit.
   - Before creating any commit, summarize:
     - validated vendor changes
     - Buddy-side fixes carried back into the current repo
     - test results
     - curl smoke results
     - remaining warnings or known risk
   - Ask explicitly whether it is ready to squash and commit.
   - Do not auto-commit immediately after a green dry run unless the user has already asked for that behavior.

13. Commit in two clean batches.
  - Commit 1 (vendor sync plus required root install metadata):
     - `git add vendor/opencode package.json bun.lock`
     - `ALLOW_VENDOR_SYNC=1 git commit -m "chore(vendor): sync opencode upstream to <tag>"`
   - Commit 2 (Buddy adaptations only):
     - Stage only Buddy/adapter/runtime/test files, plus the sync log if you are versioning it.
     - `git commit -m "refactor(buddy): adapt buddy to new opencode runtime"`
   - Leave unrelated pre-existing local edits unstaged.
   - Prefer `ALLOW_VENDOR_SYNC=1` over `--no-verify` so the bypass is explicit and scoped to intentional vendor syncs.

14. Write an upstream delta summary and Buddy unlocks in the sync log.
   - Include a short summary of what changed in vendor (major changed areas/modules, notable adds/removes, and scale).
   - Include what those changes unlock for Buddy (runtime compatibility, fewer adapter shims, new capabilities, reduced maintenance cost, etc.).
   - Add concrete evidence snippets:
     - `git diff --shortstat -- vendor/opencode`
     - `git diff --name-only -- vendor/opencode | cut -d/ -f1-4 | sort | uniq -c | sort -nr | head -20`
   - Add a Buddy risk ledger to the same log:
     - confirmed regressions
     - rejected false alarms
     - tests added/restored to keep the next sync safer
     - any UX smoke checks performed for chat send, permission flow, and desktop shell assets

15. (Optional but recommended) push synced commits to origin.
   - `ALLOW_VENDOR_SYNC=1 git push origin <branch>`
   - If rejected, inspect remote guard output before retrying.

16. Cleanup temp artifacts.
   - `git worktree remove "$tmp"`
   - `git branch -D codex/vendor-check-<date>` (if still present)

17. Record final state in log.
   - Commit hashes created
   - Validation results
   - Remaining uncommitted files (if any)

## Minimum Buddy Smoke Checklist
Run this even if the sync looks mechanically clean:

1. Send a prompt to an existing session from the normal chat UX.
2. Send a prompt to a missing session and confirm Buddy returns a clean `404` without mutating local teaching state.
3. Trigger at least one Buddy-owned tool that asks permission and verify the permission UX still appears.
4. Exercise one Buddy-owned write path and confirm it goes through the upstream write runtime, not direct `fs`.
5. Toggle a Buddy tool/config surface off after enabling it once and confirm the visible tool surface actually shrinks without runtime re-registration hacks.
6. Verify desktop/logo assets on:
   - dev Electron (`http:` renderer)
   - packaged Electron (`file:` renderer)

## Known Sync Traps
- Upstream runtime methods and published plugin methods can silently switch between `Promise` and `Effect` return styles. Keep Buddy-side compatibility at explicit boundary helpers like `plugin-ask-compat.ts`; do not spread wrapper fixes through unrelated tools or tests.
- Do not reintroduce dependency on upstream exported event unions or specific event-tag names in `packages/opencode-adapter/src/llm.ts`. Parse only the fields Buddy actually uses.
- Do not hand-build upstream `Agent.Info`-shaped values in Buddy tests or route code when a Buddy agent id or Buddy-owned lookup path is sufficient.
- Do not move session identity, permission normalization, or tool UI decoration back into vendored runtime monkey patches. Those seams already live in Buddy-owned wrappers and HTTP/SSE transforms.
- A review patch can reintroduce regressions if session-existence checks become stricter than the upstream project/session model.
- Package renames can leave Electron/Vite `publicDir` paths pointing at dead directories even while JSX still renders the expected asset URL.
- Deleted regression tests around route envelopes, overlay isolation, and desktop assets make the next sync much harder to debug; keep them.
