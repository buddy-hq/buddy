# Desktop import of v1 chats: design

Opus design, 2026-10-22, revision 4. Revision 2 answered the first Opus critique. This revision answers the Opus re-review and GPT-6 Astra's review; each hole below was checked against the code. Built by Opus only; several Sols review the implementation. No owner sign-off step.

## The problem

Current users run Buddy from `main` (OpenCode v1). Their chats live in `<data>/buddy/opencode/opencode.db`, in the v1 tables `session`, `message` and `part`. OpenCode v2 reads chats from `session_v2` and `session_message`.

OpenCode ships an importer (`vendor/opencode/packages/core/src/database/v1-migration.bun.ts`, **U** below), mounted with the embedded routes (`packages/server/src/routes.ts:188`). Its package maps `#v1-migration` to a no-op for the `node` condition (`packages/core/package.json:69-73`), and Buddy's desktop backend is a Node build (`packages/buddy/script/build-node.ts:101`). On desktop the importer does nothing, and upgraded users see no old chats. Under `bun run dev` the real importer runs.

Verified on `main`'s real data (`packages/buddy/test/fixtures/v1-upgrade/`, built from `main`'s runtime): under Bun, the importer moves all three chats with their original IDs and the parent link, and leaves the v1 tables untouched.

How the importer works, which the design depends on:
- Session IDs sort descending (`schema/src/identifier.ts:23-29`), and the importer reads `ORDER BY id DESC` with `id < cursor` (U:585-591), so it walks **oldest first**.
- It writes the cursor `{phase: "sessions", cursor: <id>}` under the KV key `migration.v1-v2` in the same transaction as that session (U:593-671). A failed session rolls back, leaving the cursor on the previous one.
- Before reinserting a session, it deletes that session's v2 messages (U:641). Moving the cursor backwards wipes anything added since in v2.
- It runs once per process, forked when the server layer starts (U:505-521). A failure leaves `status: "error"` in memory until the process restarts; the error carries no session ID.
- Before the session loop it clears `event` (only when no state exists), inserts the global project with `OR IGNORE`, and counts rows (U:543-580). After the loop it writes `completed` (U:683-696). These steps fail only on storage errors.
- It silently drops some valid v1 content (see "What does not come across").

## What the reviews changed

| Hole (verified) | Consequence | Answer |
|---|---|---|
| Packaged Buddy and Buddy Beta share `opencode.db` (`desktop-electron/src/main/storage-paths.ts:84-136`) | A v2 Beta migrates the database under a running v1 Buddy | **v2 gets its own file**, `opencode-v2.db`; the v1 file and its WAL are the backup |
| `/api/health` waits for the whole runtime (`buddy/src/routes/compatibility.ts:131-134`), and the desktop needs both health routes within 30 s or kills the backend (`desktop-electron/src/main/server.ts:195-201,280-295`) | A large copy at first launch kills the app, and every later launch starts the copy again | An **upgrade launch** answers health without waiting for the runtime; progress is shown in the app |
| The online backup restarts after any write by another connection; with the default rate it never finished under a steady writer (Electron's Node 24.17) | Startup hangs while a v1 Buddy streams a reply | `backup(…, { rate: -1 })`: one step, off the main thread (69 ms in the same test) |
| Buddy and Beta, both on v2, can seed at the same time | One app writes into a deleted file; its first chats vanish | Seed under the cross-process `Flock`; a per-process temporary name; publish with `link()`, which never replaces |
| A failed start clears the cached runtime (`buddy/src/runtime/agent-runtime.ts:54-55`), so every request re-copies | Repeated multi-GB copies on a full disk | Seeding is memoised per process; free space is checked first |
| Comparing the copy's counts with the live source rejects a correct snapshot | Spurious startup failure | Validate the snapshot itself: `quick_check` and the expected tables |
| An already v2-shaped source (development data, or a Beta that migrated `opencode.db` in place) has real v2 events and may lack the v1 tables | Emptying `event` loses usage history; legacy counts throw | Classify the source; a v2-shaped source is copied as is |
| "The failing session is the newest" contradicts the oldest-first walk | Literally built, the cursor jumps to the newest chat and nothing imports | The failing session is the importer's own next session |
| `error` also comes from storage failures; a crash never reports `error`; an unconditional cursor write can move it backwards | Healthy chats skipped, endless crash loops, or re-import wiping new messages | Skip only after repeated non-transient failures at the same cursor, at most three sessions ever, by compare-and-set in the same transaction as the skip record |
| The importer drops command subtask prompts and their results, and assistant file parts, silently (U:315-319,373-393); `main`'s Buddy creates subtask parts (`main:packages/buddy/src/session/orchestration/command-transcript.ts:54-102`) | "Completed" hides lost content | Buddy counts these before the import and reports them per chat |
| Undo on imported turns depends on how v1 recorded file snapshots | Undo must restore only that turn's files, inside the notebook | Proved on a Git notebook; undo across imported turns is refused unless that proof passes |
| Provider sign-ins come across through OpenCode's one-time credential migration | Some users may need to sign in again | Proved for the normal case; the release notes say when a fresh sign-in is needed |
| A rewrite test can pass while the shipped build still uses the Node no-op | The desktop imports nothing, again | The Node build asserts the importer was resolved and rewritten exactly once |
| `event` deletion leaves the file at full size; some old databases have no `event` | Permanent bloat; rare startup failure | `VACUUM` after emptying; skip when absent |
| Opening `opencode.db` read-write folds a leftover WAL into it | The "never written" claim is false | Open the source read-only |
| Proof gaps: impossible failing fixture, an interrupted-import seed that skips its prefix, `0600` on Windows, macOS-only fixture paths, Windows PR CI runs only `smoke:node-backend` (`.github/workflows/ci.yml:154-203`) | The proof passes with the shipped app broken | Rewritten proof below |

## Design

1. **A separate v2 database file.** `BUDDY_OPENCODE_DB_FILENAME` (`packages/script/src/storage-env.ts:4`) becomes `opencode-v2.db`; production reaches it through `buddy/src/runtime/runtime-paths.ts:77-85` and `host.ts:150`. A new `BUDDY_OPENCODE_V1_DB_FILENAME = "opencode.db"` names the copy source only.
   - v1 Buddy keeps using `opencode.db`; rolling back to `main` finds it unchanged.
   - Tests and scripts that hard-code the old name move to the constant, deliberately, not by blind rename:
     - `desktop-electron/test/storage-paths.test.ts:74,83,92,120`
     - `buddy/test/opencode-runtime/env.test.ts:19,33`
     - `buddy/test/conformance/storage.test.ts:33`
     - `buddy/test/opencode-runtime/buddy-runtime-plugin.test.ts:138`
     - `buddy/test/helpers/{v2-host,opencode}.ts:19-20`
     - `buddy/test/opencode-runtime/{subagent-transcript-history,buddy-subagents}.test.ts`
     - `script/node-backend-smoke.ts:77`
     - `buddy/script/export-session-trace.ts:364-390`
2. **Seed once, safely.** A new adapter module, `seed-v2-database.ts`, called in `startOpenCodeHost` (`packages/opencode-adapter/src/host.ts:197`) after `initializeStorage` and **before** `repairLegacyMigrations`, so the repair only ever touches the v2 file. It runs when `opencode-v2.db` is absent and `opencode.db` exists.
   1. Take `Flock.withLock("buddy-v2-database-seed", …)` (the global is set by `configureOpenCodeGlobalPaths`, `host.ts:138`). Inside the lock, check again; if `opencode-v2.db` now exists, stop.
   2. Remove stale `opencode-v2.db.*.tmp` files and their `-wal`, `-shm` and `-journal` side files. Under the lock no other seeder can be writing them.
   3. Check free space with `fs.statfs`: at least the size of `opencode.db` plus its `-wal`. Otherwise fail with "Not enough disk space to upgrade your chats: need N, have M".
   4. Open `opencode.db` read-only and **classify** it:
      - **v1:** it has `session`, `message` and `part`, and no `kv` row `migration.v1-v2`.
      - **v2-shaped:** it has `session_v2`.
      - **Empty:** neither. Nothing is seeded, and OpenCode creates a fresh database.
   5. Copy to `opencode-v2.db.<pid>.tmp`: on Node, `backup(source, tmp, { rate: -1 })` from `node:sqlite`; on Bun (development only), `VACUUM INTO ?` with the path bound as a parameter.
   6. Open the temporary copy, which is private to this process.
      - For a **v1** source: if it has an `event` table, `DELETE FROM event` (one statement; SQLite's truncate optimisation), then `VACUUM`. Create the guard's table (step 5) and store the content counts (step 7).
      - For a **v2-shaped** source: no cleanup; its events are real history.
      - Then `PRAGMA quick_check` must return `ok`, and the tables that classified the source must be present.
   7. Close the copy (no live connection may hold its WAL), set mode `0600` on POSIX (as `core/src/database/database.ts:83-86` does; Windows relies on the profile's ACLs), and `fsync` the file. Then `link()` it to `opencode-v2.db`, which fails if the file exists and never replaces it. `fsync` the folder (POSIX only) and unlink the temporary name.

   Any failure removes the temporary file and its side files and rejects with a clear cause. The result is memoised for the life of the process: a failed seed is not retried until the next launch.
3. **An upgrade launch does not race the health check.** A small Buddy-side module holds the upgrade state: `idle`, `copying`, `migrating` (the first `OpenCode.create` after a seed, which runs the schema migrations), `ready` or `failed` with cause.
   - While the state is `copying` or `migrating`, `/api/health` answers `{ healthy: true, version }` from the static runtime version, without awaiting the runtime. The desktop's 30-second check then measures that the backend is alive, not how long the copy takes.
   - On every other launch, `/api/health` is unchanged.
   - Requests that need the runtime wait for it as today; the web shows the upgrade notice (step 6) meanwhile.
   - A `failed` state makes `/api/health` fail at once with the cause, so the desktop shows its normal backend error instead of waiting.
4. **The real importer in the Node build.** `build-node.ts` resolves `#v1-migration` to `v1-migration.bun.ts`, as it already resolves `#photon-wasm` and `#shell-parser-wasm`. A Node-only exact-match table makes it Node-safe; each snippet must match exactly once, or the build fails.
   - `new Bun.CryptoHasher("sha256")` becomes `createHash("sha256")` from `node:crypto`, with identical output.
   - `nextPath` returns `undefined`, so the `opencode-next.db` branch (U:711, `bun:sqlite`; OpenCode preview only) is never reached.
   - The build plugin counts its loads and fails the build unless the importer was resolved, loaded and rewritten exactly once.
   - The table is not installed by the Bun development preload (`buddy/src/dev/opencode-branding-preload.ts`). Source runs keep the original file, which is already the real importer.
5. **A failing session never blocks the rest, and a good one is never lost lightly.** A new adapter module, `v1-import-guard.ts`. Its state lives in a Buddy-owned table in the v2 database, `buddy_v1_import (key TEXT PRIMARY KEY, value TEXT NOT NULL)`, so a skip and its record commit in one transaction. Keys:
   - `attempt`: `{ cursor, candidate, running, failures, interruptions, lastError }`
   - `skipped`: a list of `{ id, at, error }`
   - `content`: per-chat counts of content the importer drops (step 7)
   - **At each start, before `OpenCode.create`:**
     - If the v2 file has no `kv` table, or `migration.v1-v2` is `completed`, do nothing.
     - Otherwise read the state `S` and its cursor `C` (absent before the first session). The candidate `F` is the importer's own next session: `SELECT id FROM session WHERE (C IS NULL OR id < C) ORDER BY id DESC LIMIT 1`. No candidate: do nothing; a failure there was the completion write.
     - If the stored attempt has a different `cursor` or `candidate`, start a new attempt at zero.
     - If the stored attempt is still `running`, the last run ended without an outcome (a crash or a quit): `interruptions + 1`.
     - **Skip `F`** when `failures >= 2` or `interruptions >= 3`, and fewer than 3 sessions have been skipped in total. In one transaction:
       - update `migration.v1-v2` to `{phase: "sessions", cursor: F}` **only if** its value still equals `S` exactly;
       - if that changed one row, append `F` to `skipped` and clear the attempt;
       - otherwise change nothing.
     - At the cap, stop skipping. The status then reports the error with no skip.
     - Mark the attempt `running`.
   - **After `OpenCode.create`:** poll `migration.v1.status` every second until `completed` or `error`.
     - `completed`: clear the attempt.
     - `error` naming a transient SQLite condition (`SQLITE_BUSY`, `SQLITE_LOCKED`, `SQLITE_FULL`, `SQLITE_IOERR`, `SQLITE_INTERRUPT`, `SQLITE_NOMEM`, "database is locked", "database or disk is full", "disk I/O error"): only clear `running`. Such failures never count.
     - Any other `error`: `failures + 1`, store the text, clear `running`.
   - Why this attribution is sound enough:
     - The steps outside the per-session transaction fail only on storage errors, which never count.
     - A failure with no candidate is never attributed.
     - Two failures at the same cursor rule out one-off races, such as two importers starting together (U:560-563).
     - The cap bounds any mistake to three chats, each still readable in the v1 file and listed.
   - Buddy never resets the import state, never lowers the cursor, and never writes it once the state is `completed`.
6. **Status the user can see.** `GET /api/runtime/v1-import` returns `{ upgrade, import, skipped, content }` without needing the OpenCode host:
   - `upgrade` is the state from step 3;
   - `import` is OpenCode's `migration.v1.status` (`protocol/src/groups/migration.ts:18`) once the host exists;
   - `skipped` and `content` come from the guard's table.

   The web shows:
   - While copying, migrating or importing, a quiet notice in the chat list: "Bringing over your chats from the previous version…".
   - When the import completes, it reloads the notebook's chat list.
   - On `error`: "Some older chats haven't come across yet. Buddy will continue the next time it starts."
   - A failed upgrade shows its cause, for example the disk-space message.
   - Skipped chats: how many, and that the originals are kept.
   - Dropped content: "Some command results in N older chats couldn't be brought over."
   - The notice reuses an existing banner component; no new visual design.
7. **Content the importer drops is counted.** During the seed of a v1 source (step 2.6), Buddy counts per chat in the copy's v1 tables:
   - user messages whose only content is `subtask` parts;
   - assistant messages that hold a `task` tool call under a subtask parent;
   - assistant `file` parts.

   It stores them under `content` before the copy is published. The chats themselves, including the subagent chats those commands created, import normally.
8. **Undo on imported turns.** The proof (case 13) runs undo on an imported code-editing turn in a Git notebook, on macOS and Windows.
   - If the right files are restored, nothing more is needed.
   - If not, undo on imported turns is refused with "Undo isn't available for turns brought over from the previous version.", and nothing in OpenCode's data is rewritten.
9. **What does not come across, or is not promised.** Stated in the release notes:
   - Command subtask prompts and their results in the parent chat, and assistant file parts (counted, step 7).
   - Non-inline file attachments become a placeholder line (U:322,1039).
   - Part IDs change: artifacts keep their session and message links, but may lose the exact part. Compaction summary messages lose their paired IDs (U:275-288).
   - Per-session permission rules are dropped.
   - In-progress undo and compaction state are reset (U:485).
   - Messages in shapes too old to decode are dropped with a log warning (U:226-233).
   - A skipped parent chat leaves its subagent chats pointing at a missing parent.
   - MCP sign-ins must be redone.
   - Chats made, or continued, in v1 after the copy are not imported. Importing only sessions missing from `session_v2` is a later, separate change.
   - Provider sign-ins, ChatGPT included, are imported once by OpenCode's own migration; some users will need to sign in again, including after running v1 and v2 side by side or rolling back.
   - Running v1 and v2 at the same time is not supported beyond the database. Snapshots (a shared Git repository with process-local locks), tool output, generated images, `~/.buddy` stores and notebook `.buddy` folders stay shared, as they already are between Buddy and Buddy Beta today.
   - Two v2 apps importing at the same moment can each import the same chat; the second rewrites identical content.

## Proof

All in temporary roots, using the `main` fixture.
- **Fixture paths.** Its absolute macOS notebook paths are remapped before startup (fixture README:52-56) to temporary paths containing spaces, an apostrophe and non-ASCII characters. Chats are queried by the actual notebook directory.
- **Runners.**
  - `desktop-electron/scripts/smoke-backend-utility.ts` runs through Electron's own Node, locally and in release builds, in workspace and packaged modes. It exercises the desktop's real health contract: both routes, 3-second fetches, the 30-second deadline.
  - `smoke:node-backend` runs in PR CI on macOS and Windows, on Node 24.
  - Shared logic also gets a Bun conformance case.

1. **Fresh upgrade.**
   - `opencode-v2.db` appears, with mode `0600` on POSIX; `opencode.db` and its WAL are byte-for-byte unchanged.
   - The status reaches `completed`.
   - Every fixture chat is listed through Buddy's HTTP API with every transformed message and the parent link, not just its ID.
   - The mermaid artifact still resolves its chat.
   - The fixture's fake `auth.json` credentials are usable through the provider listing.
2. **Restart twice.** No second copy, no duplicates, the same IDs. A message added to an imported chat before the restarts survives them.
3. **Interrupted import.** From a full import on a scratch copy, build a v2 file where the sessions at and above a middle cursor are imported and the rest are not, with `migration.v1-v2` at that cursor. The run imports exactly the rest. Every expected session is present afterwards.
4. **Failing session.** In a seeded copy, add a `session_message` row under another session, with an ID the importer will produce for the target session (found by a first run on a scratch copy).
   - Target in the middle: two starts give `error` at the same cursor; the third skips it; the rest import; the API reports one skipped.
   - Target first in the walk (no cursor): the same, and no other session is skipped.
5. **No backwards move.** A guard that would skip, while the stored state has moved on or is `completed`, changes nothing.
6. **Transient errors.** A `database is locked` failure never counts.
7. **Crash loop.** Three starts ending without an outcome at the same cursor skip that session; a fourth failing session after three skips is not skipped.
8. **A v1 writer during the copy.** A second process writes to `opencode.db` continuously during the backup. The copy finishes and passes its checks; `opencode.db` holds only that writer's changes.
9. **Two seeders.** Two processes seed at once: one copy is made, the other uses it, and no stray temporary file is left.
10. **Interrupted copy.** A stale `.tmp` with side files is removed and the copy is redone; a failed check never produces `opencode-v2.db`.
11. **Source shapes.** A v2-shaped source keeps its `event` rows; an empty source seeds nothing; a v1 source without `event` seeds and imports.
12. **Content counts.** A fixture variant with a command subtask, its task result and an assistant file part reports them for that chat.
13. **Undo.** A Git-notebook fixture, on macOS and Windows: undo on an imported code-editing turn either restores the right files or is refused (step 8). It never touches a file outside the notebook.
14. **Slow upgrade.** A seed delayed past 30 seconds (an injected pause in the copy) still passes the desktop's health check, and the app shows the upgrade notice.
15. **Build.** The Node build fails if the importer is not resolved, loaded and rewritten exactly once, and the rewrite table fails on a changed vendor snippet.

A large-database timing check (for example 1 GB, mostly `event`, plus 200 MB of chats) is measured on macOS and recorded: total seed time and the longest event-loop pause.
