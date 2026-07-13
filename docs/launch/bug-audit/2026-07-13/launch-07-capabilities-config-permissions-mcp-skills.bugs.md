# LAUNCH-07 — Capability/config compilation, permissions, MCP, and skills

Audit date: 2026-07-13
Pass status: Discovery complete; verification pending
Baseline: Current workspace, evaluated as a clean release-candidate tree. Unrelated dirty-worktree changes were ignored.

This file records first-pass candidates. A candidate is not a final launch verdict until the verification pass either retains it under **Verified bugs** or moves it to **Rejected after verification**.

## Candidate bugs

### L07-C01 — P1/P2 — Concurrent notebook config patches can silently discard each other

- **Locations:** `packages/buddy/src/config/orchestration/project-config-service.ts:57-80`, `packages/buddy/src/config/orchestration/project-config-service.ts:113-158`, `packages/buddy/src/config/store/write-config.ts:61-78`
- **Trigger:** Two settings surfaces patch different fields in the same notebook at nearly the same time, such as MCP enablement and a notebook setting autosave.
- **Expected:** The per-notebook mutation lock encloses the read, merge, validation, write, and runtime sync so both disjoint changes survive.
- **Observed in discovery:** `patchProjectConfig` reads and merges the current document before entering `withProjectConfigChangeLock`. Both callers can therefore derive complete replacement documents from the same stale snapshot; the lock only serializes writing those already-derived documents, so the later write replaces the earlier patch.
- **Impact:** Buddy reports both saves as successful while one notebook setting, tool toggle, persona override, or MCP change disappears. A stale cleanup patch can also restore fields the user just changed.
- **Verification pending:** Delay the first apply after both callers have read the same fixture, submit disjoint patches concurrently, and assert the final JSONC contains both changes and preserved comments.
- **First-pass confidence:** High.

### L07-C02 — P1 — Config and instruction writes are direct, non-atomic replacements

- **Locations:** `packages/buddy/src/config/store/write-config.ts:37-39`, `packages/buddy/src/config/store/write-config.ts:61-109`, `packages/buddy/src/config/store/write-config.ts:120-140`, `packages/buddy/src/config/orchestration/project-config-service.ts:103-110`, `packages/buddy/src/agents-md/service.ts:55-75`
- **Trigger:** Buddy crashes, the machine loses power, or a write fails after truncation while saving global/project config or `AGENTS.md`.
- **Expected:** Durable configuration and instruction files are written to a sibling temporary file, flushed as required, and atomically renamed; recovery never promotes a partial document.
- **Observed in discovery:** These paths call `writeFile` on the authoritative target. The project rollback path also restores directly to the target. Unlike signed-artifact and installed-skill state writers elsewhere in the same subsystem, there is no temporary-file promotion.
- **Impact:** A partial global config can prevent configuration/runtime bootstrap; a partial project config can strand a notebook; a truncated `AGENTS.md` can silently replace the user's durable instructions.
- **Verification pending:** Inject short-write, ENOSPC, and process termination between truncate and completion for JSON and JSONC fixtures, then restart and inspect the authoritative and recovery state.
- **First-pass confidence:** High on mechanism; platform-specific failure behavior remains to be reproduced.

### L07-C03 — P1 — Notebook `AGENTS.md` follows a symlink outside the allowed notebook

- **Locations:** `packages/buddy/src/agents-md/service.ts:35-42`, `packages/buddy/src/agents-md/service.ts:55-79`, `packages/buddy/src/agents-md/service.ts:86-100`, `packages/buddy/src/routes/agents-md.ts:20-88`
- **Trigger:** Open an otherwise allowed notebook containing an `AGENTS.md` symlink or junction whose target is outside that notebook, then read or save the instructions panel.
- **Expected:** The service rejects symlinks/junctions or resolves the target and enforces canonical containment before reading or writing.
- **Observed in discovery:** The route authorizes only the notebook directory. The service then uses `path.join(directory, "AGENTS.md")` and ordinary `readFile`/`writeFile`, both of which follow an existing link; it performs no `lstat`, `realpath`, or containment check on the file target.
- **Impact:** A notebook can make the instructions UI disclose or overwrite an arbitrary same-user file outside the notebook without the external-directory permission boundary that normal workspace tools require.
- **Verification pending:** Create notebook-local symlinks to sentinel files inside and outside the allowed root on macOS and Windows (including a junction/reparse-point case), exercise both routes, and assert rejection with unchanged targets.
- **First-pass confidence:** High on POSIX; Windows link behavior needs platform verification.

### L07-C04 — P1 — Dynamic-tool grant and permission recomputation use racing whole-ruleset writes

- **Locations:** `packages/buddy/src/learning/runtime/dynamic-tool-grants.ts:77-95`, `packages/buddy/src/learning/runtime/dynamic-tool-grants.ts:144-185`, `packages/buddy/src/learning/agent-execution/permissions/runtime-session-permissions.ts:62-105`, `vendor/opencode/packages/opencode/src/session/session.ts:782-786`
- **Trigger:** A dynamic tool load/clear overlaps a turn transform, runtime readiness refresh, archive cleanup, or another grant for the same session.
- **Expected:** Permission updates are serialized or compare-and-swap against the latest session revision, and a clear/recompute cannot be overwritten by a stale grant.
- **Observed in discovery:** Each path reads the session's entire permission array, derives a replacement, and calls `Session.setPermission`; there is no per-session lock or revision precondition shared between grant, clear, and recomputation paths. A later stale writer can restore rules removed by the other operation or discard newly recomputed denies.
- **Impact:** A dynamic tool may remain callable after it was cleared/disabled, or an unrelated permission update can disappear. The result depends on timing at an authority boundary.
- **Verification pending:** Barrier two writers after their reads, race grant versus clear and grant versus recompute repeatedly, and evaluate the resulting ruleset for every managed dynamic tool.
- **First-pass confidence:** Medium-high; exact interleavings must be reproduced against the current session store.

### L07-C05 — P1/P2 — Parallel skill mutations can leave installed trees untracked or permissions lost

- **Locations:** `packages/buddy/src/learning/skill-management/service/mutations.ts:224-248`, `packages/buddy/src/learning/skill-management/service/mutations.ts:356-388`, `packages/buddy/src/learning/skill-management/service/mutations.ts:484-553`, `packages/buddy/src/learning/skill-management/service/lock.ts:65-95`, `packages/buddy/src/learning/skill-management/service/permissions.ts:93-155`
- **Trigger:** Install, update, remove, or enable two different skills concurrently, including a background catalog reconciliation overlapping a user action.
- **Expected:** One transaction/lock covers tree publication, permission mutation, lockfile mutation, and rollback, preserving every independent entry.
- **Observed in discovery:** Skill operations independently read and rewrite the whole installed-skill lock, while permission helpers independently read and replace the whole nested skill permission map. The lockfile write is atomic but mutations are not serialized; tree publication and permission changes happen in separate steps outside any shared transaction.
- **Impact:** Both requests can report success while only one lock/permission entry survives. A skill tree may remain executable but untracked, or be tracked without its intended permission, breaking updates, withdrawal, removal, and trust accounting.
- **Verification pending:** Run two dependency-injected curated installs and mixed install/remove operations behind read barriers, then reconcile filesystem trees, `skills.lock.json`, global permission rules, catalog output, and runtime-visible skills after restart.
- **First-pass confidence:** High on lost-update mechanism.

### L07-C06 — P2 — An occupied MCP OAuth callback port is treated as a running Buddy callback server

- **Locations:** `vendor/opencode/packages/opencode/src/mcp/oauth-callback.ts:105-145`, `vendor/opencode/packages/opencode/src/mcp/oauth-callback.ts:163-173`, `vendor/opencode/packages/opencode/src/mcp/index.ts:816-833`, `vendor/opencode/packages/opencode/src/mcp/index.ts:898-912`
- **Trigger:** Another process already listens on the configured/default loopback callback port when MCP OAuth starts.
- **Expected:** Buddy either proves ownership of a compatible callback server, selects another registered loopback port, or fails immediately with an actionable collision error.
- **Observed in discovery:** `ensureRunning` probes the port and returns success whenever anything accepts a connection. Buddy then records its pending state only in its own process and waits up to five minutes, while the browser callback is delivered to the unrelated listener.
- **Impact:** MCP sign-in appears to start normally but cannot complete and stalls until timeout; an unrelated local service receives the authorization code and state.
- **Verification pending:** Bind a sentinel HTTP server to the callback port, initiate auth with a deterministic provider fixture, deliver the callback, and assert immediate failure/no code delivery outside Buddy.
- **First-pass confidence:** High.

### L07-C07 — P1/P2 — MCP disconnect and Windows shutdown do not terminate descendant processes

- **Locations:** `vendor/opencode/packages/opencode/src/mcp/index.ts:418-440`, `vendor/opencode/packages/opencode/src/mcp/index.ts:531-568`, `vendor/opencode/packages/opencode/src/mcp/index.ts:571-589`, `vendor/opencode/packages/opencode/src/mcp/index.ts:653-657`
- **Trigger:** A local MCP command launches a child/grandchild server through a package runner or shell, then the user disconnects/reconfigures it or Buddy disposes the runtime on Windows.
- **Expected:** The complete MCP process tree is terminated with a bounded cross-platform policy on disconnect, replacement, shutdown, and failed startup.
- **Observed in discovery:** Descendants are collected only by the instance finalizer, and the collector returns an empty list on Windows. Explicit disconnect and client replacement call only `client.close()` and never traverse descendants on any platform.
- **Impact:** Orphan MCP processes can retain files, ports, credentials, CPU/memory, and network authority after Buddy says the server is disconnected or after the app exits.
- **Verification pending:** Use an MCP fixture whose direct child spawns a long-lived descendant, exercise disconnect/reconfigure/finalize on macOS and Windows, and assert every PID exits within a deadline.
- **First-pass confidence:** Medium-high; direct transport cleanup behavior and platform process inheritance must be measured.

### L07-C08 — P2 — “Allow always” approvals are discarded by ordinary config changes

- **Locations:** `packages/web/src/i18n/en.ts:34-37`, `vendor/opencode/packages/opencode/src/permission/index.ts:46-64`, `vendor/opencode/packages/opencode/src/permission/index.ts:109-166`, `packages/buddy/src/config/store/write-config.ts:120-140`
- **Trigger:** Approve a permission with **Allow always**, then change a global setting, skill toggle, or other config field before restarting Buddy.
- **Expected:** The approval remains valid for the lifetime promised by the UI: “Remember until Buddy is restarted.”
- **Observed in discovery:** Always-approval rules exist only in the OpenCode instance's in-memory `approved` array. Every global config mutation calls `OpenCodeInstance.disposeAll()`, finalizing and recreating that state even though Buddy itself remains running.
- **Impact:** Users are unexpectedly reprompted for previously approved commands or paths during the same app run, and active pending requests are rejected as a side effect of unrelated settings changes.
- **Verification pending:** Approve a sentinel pattern, mutate a benign global setting through the supported route, repeat the request, and observe the approval/pending-event lifecycle without restarting the process.
- **First-pass confidence:** High on lifecycle; severity is bounded to workflow reliability rather than durable authority.

## Verified bugs

Pending second-pass verification.

## Rejected after verification

None yet.

## Discovery coverage with no retained candidate

- Persona/feature registration rejects duplicate capability IDs and derives explicit default denies for unavailable managed tools and subagents.
- Dynamic-tool discovery rechecks persona, config, and runtime constraints at load time and limits each search/load request.
- Permission replies are resolved inside the authorized directory instance and unknown request IDs fail closed.
- Curated skill sources are commit-pinned, tree-limited, hash-checked, scanned, rechecked against the current signed catalog, and published through staging/backup directories.
- System skill packs and the library catalog enforce signatures and monotonic revisions; no rollback/substitution candidate was retained.
- Skill-tree copying rejects symlinks and non-regular entries.
- MCP remote request timeouts, OAuth state correlation, and token-to-server URL binding were reviewed without another retained candidate.
