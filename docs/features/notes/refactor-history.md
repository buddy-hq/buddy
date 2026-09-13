# cuts.md — Buddy Notes V1: what to delete and why

Status: **implemented in the working tree.** During implementation, the user made one further
scope cut: Notes V1 does not generate session rollout files at all.

## What this is

The Notes V1 feature is complete and green (lint, root typecheck, focused tests) but went
through six review rounds where fixing one P1 produced the next. This document argues that
the churn came from four specific integration decisions, proposes a target state, and lists
what comes out.

Measured from the uncommitted working tree on branch `Obsidian`: 57 modified files, 22 new
files, 1,729 insertions into existing code, ~4,668 lines of new modules. Roughly 6,400 lines
added in total.

---

## Diagnosis

The data model is not the problem. Plain Markdown, ULID identity, membership by metadata,
one shared MDX editor, no sidecar database — none of that is what failed, and none of it
changes here.

What failed is that the central notes library was made to **pretend to be a file inside the
open notebook**, four separate times:

| System | The pretend | The machinery it needed |
|---|---|---|
| Bench | a note is a workspace file | synthetic path `__buddy_notes__/<id>/<title>.md`, decoded at 5 sites |
| Permissions | the library is inside the project | `external_directory` allow-list + a 237-line shell-command hook |
| Buddy Home | Buddy Home owns notes like it owns notebooks | 233-line move engine + 80-line process-global barrier |
| Session store | a chat can be a file | background sync engine with job map, generations, poller, retry |

Each pretend required a system to accept a case it was designed to reject, and each
exception then had to be defended against the case it did not cover. Sorted by origin, the
finding clusters that kept reopening across the six rounds are exactly these four
(permissions ×5 rounds, Buddy Home ×4, editor/cache ×4, rollout ×3, library scanning ×2).
The findings that did *not* recur — i18n strings, the Stop button in Note mode, block-link
placement, the retry toast — are ordinary first-pass defects and were each fixed once.

**The fix is not to relocate notes into notebooks.** It is to stop pretending, and let each
system know the library is a separate, declared location.

---

## Constraints this proposal must not violate

These are decisions the user already made explicitly. Any critique should check the proposal
against them.

1. Notes are a built-in Buddy feature; Obsidian is optional and comes later.
2. Notes are ordinary Markdown and must remain useful without Buddy. No `buddy://` links, no
   Buddy-only link syntax anywhere — in notes or in metadata.
3. Links must be Obsidian-compatible. No new link patterns.
4. Notes belong to notebooks through readable metadata plus a stable ID, not by living in a
   notebook folder. Notebook renames must not orphan notes.
5. One central notes library, not per-notebook folders. (Locked after extended discussion.)
6. One chat produces one collecting session note; separate documents only via New Note.
7. V1 creates no session rollout or transcript file. A session note stores the session ID for
   a future export feature.
8. Composer captures and message annotations accumulate in the one session note for the chat.
9. Full-chat export is deferred and does not add background work to Notes V1.
10. Notes reads should not prompt; note writes should prompt. Permission changes must be
    runtime-only and never persisted to the user's machine.
11. There is always an active notebook; Quick Chats is the fallback.
12. Buddy-created types are namespaced (`buddy-note`, `buddy-session-note`).
13. Buddy-created filenames are a readable title plus a ULID; titles may change, the ULID does
    not. Plain Markdown files need no ULID.

Forward-looking constraint the user has stated as direction, not yet a locked decision: the
LLM Wiki pattern (`docs/research/llm-wiki/README.md`) is intended to be built on top of this
notes system later, and Obsidian is intended to become the physical home of the library.

---

## Target state

1. **The library is a folder the user chooses.** Its path becomes its own setting, defaulting
   to `<Buddy Home>/Notes`. Changing it changes a pointer; nothing moves on disk. Changing
   Buddy Home no longer touches notes at all.

2. **Bench targets carry which root a path is relative to.** `workspace-file` gains
   `root: "notebook" | "notes"` (or equivalent). Paths become real paths inside a declared
   root. No synthetic path, no decoding, no id lookup on the open path.

3. **Permissions are two runtime rules on the library path:** `read → allow`,
   `edit → ask`. Nothing else. Bash follows the user's own bash policy, exactly as it does
   for the notebook. A later setting can flip `edit → allow` inside the library.

4. **Any Markdown file in the library is a note.** Buddy frontmatter becomes optional
   metadata rather than the entry ticket. Files Buddy did not create are visible and
   openable.

5. **Buddy-created notes keep their stamp** (`type`, `buddy-id`, `buddy-notebook-id`,
   `notebook`). It is used for grouping ("this notebook's notes") — not for addressing.

6. **There is no rollout feature in V1.** Session notes retain `buddy-session-id`; portable
   transcript export is deferred.

7. **Notebook identity keeps its registry.** Two fixes only: corrupt registry JSON is
   quarantined rather than silently replaced, and the prompt builder stops writing it.

### Why the setting in (1) matters beyond the deletion

Pointing that setting at a folder inside an Obsidian vault is the entire Obsidian
integration — no sync, no adapter, no duplicated files. The same change that removes the
Buddy Home migration engine is the change that makes the deferred Obsidian question a
one-line answer.

### Why (3) and (4) are forced by the LLM Wiki direction

- A wiki loop (Ingest → Query → Lint) has the agent updating a summary, several concept
  pages, `index.md` and `log.md` in one pass. Under an absolute "every write asks" rule that
  is one prompt per file. Write policy inside the library has to be a setting.
- A wiki contains `AGENTS.md`, `index.md`, `log.md` and `raw/**` — none of which carry Buddy
  frontmatter. Today `scanNotes` drops any file whose frontmatter fails
  `BuddyNoteMetadataSchema`, so all of those would be invisible in the drawer and unreachable
  through the notes API. This is a current forward-incompatibility, not a hypothetical one.
- Because plain files must count, notes cannot be addressed by ID — `index.md` has none.
  That settles (2) in favour of path-addressing.

---

## The cuts

### 1. Notes shell/path permission machinery — ~620 lines

Delete:
- `packages/buddy/src/opencode-runtime/plugins/notes-path-permission.ts` (237)
- `packages/buddy/test/notes/path-permission.test.ts` (294)
- `packages/buddy/src/storage/canonical-path.ts` (27)
- `packages/opencode-adapter/src/shell.ts` (10) and the shell-kind plumbing in
  `buddy-runtime-plugin.ts`
- `RuntimeToolExecutionVetoError` and the `Effect.die` branch in
  `packages/opencode-adapter/src/plugin-live.ts`
- the `bash` rules in `buildOpenCodePermissionOverlay`

Keep: the `external_directory` allow-list for the library root, plus `read → allow` and
`edit → ask` on the library path.

Rationale: the `external_directory` allow-list that makes reads promptless is the same gate
that stops the shell. Allow-listing it for reads opened it for writes; the hook exists only
to close it again by substring-matching the command text, which cannot decide the question
(`printf x > "$dir/f.md"` contains no library path — vendor's own AST scan skips dynamic
paths for the same reason, see `vendor/opencode/packages/opencode/src/tool/shell.ts`
`argPath`/`dynamic`). The rule being defended is also stricter than any guarantee Buddy makes
about any other file: `bash` defaults to `allow`, so the agent can already write anywhere in
the user's notebook without prompting.

### 2. Buddy Home migration and the global transition barrier — ~486 lines

Delete:
- `packages/buddy/src/project/buddy-home-change.ts` (233)
- `packages/buddy/src/notes/home-transition.ts` (80)
- `packages/buddy/test/project/buddy-home-change.test.ts` (73)
- `packages/buddy/test/notes/home-transition.test.ts` (93)
- `runBuddyHomeOperation` wrapping in `project-file-editor-service.ts` (4 call sites),
  `managed-notebook.ts`, and the Bench-capture cleanup in `buddy-runtime-plugin.ts`
- `runtimeHomeOperationReleases`, the `tool.execute.before/after` release pair, and the
  `dispose` hook in `buddy-runtime-plugin.ts`
- the Buddy Home strategy UI in `settings-advanced.tsx`

Restore: `saveNotebookHome` as a config write (7 lines), plus the new library-path setting.

Rationale: notebooks do not move when Buddy Home changes — they stay where they are and
Buddy looks elsewhere. Notes were the only thing held to a stricter standard. The barrier is
process-global and correctness depends on every future file writer remembering to enter it,
which is already false (`routes/object-whiteboard.ts` and the whiteboard store write
directly). This is the only one of the four cuts that reaches into code unrelated to Notes.

### 3. Rollout feature — cut entirely

Delete from `packages/buddy/src/notes/service.ts`: `rolloutJobs`, `RolloutJobState`,
`scheduleRolloutRefresh`, `runRolloutRefreshQueue`, `retainFailedRolloutJob`, generation
counters, `ROLLOUT_FAILURE_RETENTION_MS`, `readRolloutStatusInternal`,
`retryRolloutInternal`, `refreshSessionRolloutIfPresentInternal`.

Also delete:
- `packages/web/src/state/notes-rollout-monitor.ts` (37) and the poll loop
- `monitorNoteRolloutOutcome` and the retry toast in `use-directory-chat-page-controller.ts`
- three of the ten endpoints in `routes/notes.ts` (`rolloutStatus`, `refreshRollout`,
  `retryRollout`)
- the `session.idle` rollout hook in `buddy-runtime-plugin.ts`
- `Session.setRevert` / `Session.clearRevert` and the `revert` field in
  `updateCachedSession` (`packages/opencode-adapter/src/session.ts`, `session-live.ts`) if
  nothing else uses them

Also delete rollout metadata, rendering, file creation, read-only UI grouping, and all rollout
tests. `BuddySessionCaptureResult` returns only the session note.

Rationale: session capture is useful without a portable transcript. Retaining
`buddy-session-id` preserves the stable join point for a future explicit export feature while
removing every synchronization and freshness question from V1.

### 4. Synthetic Bench path — ~180 lines

Delete:
- `packages/web/src/lib/buddy-note-bench-target.ts` (44)
- the `readBuddyNoteBenchTarget` call sites in `bench-targets.ts` (×2), `bench-tabs.ts` (×2)
  and `bench-surface-renderer.tsx`
- `isSameBenchTargetPresentation` in `bench-targets.ts` and its use in
  `bench-open-policy-core.ts`

Replace with: `root` on the `workspace-file` target, included in `benchTargetKey` and
`benchTabKey`.

Rationale: the title is currently inside the identity string, so renaming changes the path
but not the id, and the two identity functions disagree — `benchTargetKey` keys on id alone
while `isSameBenchTarget` compares id and title. `isSameBenchTargetPresentation` was added to
paper over that divergence rather than remove it. The stale "Untitled note" tab was the same
defect from the other side.

`MarkdownBenchPage` keeps `documentIO` and `readOnly`; `documentDirectory`, `target`,
`title`, and `onRenameTitle` collapse once the path is real and the root is declared.

### 5. Write-on-read and repeated scanning — ~120 lines

- Delete the notebook-label repair pass in `listBuddyNotesInternal`
  (`packages/buddy/src/notes/service.ts:406-440`) and its lock/concurrency map. The
  `notebook:` label is a copy of what the registry already knows; render it at read time.
- Stop `buildPromptContext` from calling `resolveNotesNotebookIdentity`, which can write the
  global registry. Building a prompt should not mutate global state.
- Collapse the three index layers (`scannedNoteCache`, `notePathIndexes`, the duplicate-id
  reconciliation in `scanNotes`) into one index maintained by a watcher rather than rebuilt
  by a directory walk on every operation.

---

## What stays, unchanged

- Plain Markdown as the only source of truth. No sidecar database, no manifest.
- ULID identity in frontmatter and filename; titles free to change.
- One MDX editor. The `documentIO` seam that replaced the duplicate note editor is a real
  abstraction and should be kept.
- The extracted storage primitives — `atomic-file`, `file-lock`,
  `rename-file-without-overwrite`, `text-content-version`. `project-file-editor-service.ts`
  is 57 lines shorter than before this branch as a result.
- The notebook identity registry (`notes/notebook-identity.ts`), minus the two fixes above.
- The message-visibility extraction into `packages/opencode-adapter/src/message-visibility.ts`,
  shared by backend and web.
- The Notes drawer, the composer Note mode, message annotation, and the capture model
  (one session note per chat).

---

## Totals

| Item | Lines | Action |
|---|---:|---|
| Shell/path permission machinery | ~620 | cut |
| Buddy Home migration + barrier | ~486 | cut |
| Rollout feature | >500 | cut |
| Synthetic Bench path | ~180 | cut |
| Write-on-read label repair + scan layers | ~120 | cut |
| Notes core (storage, markdown, identity, routes, drawer, capture, editor seam) | ~4,400 | keep |
| **Net removable** | **>2,180** | more than one third of the feature |

---

## Order of work

1. **Library path setting; stop migrating Buddy Home.** Largest deletion, touches the most
   unrelated code, and unblocks the deferred Obsidian question.
2. **Permission simplification.** Deletes the hook and its test.
3. **Bench root.** Deletes the synthetic path and the duplicate comparison function.
4. **Remove rollouts.** Deletes the feature and its UI/API surface.
5. **Scanning and write-on-read cleanup.**

---

## Known risks and open questions

- **Path-addressing vs. constraint 13.** Confirmed: renaming changes the Bench target, matching
  ordinary notebook-file behavior.
- **"Any Markdown is a note" vs. the existing schema.** Resolved as two forms: plain files are
  edited as complete source; valid stamped files expose the body while Buddy preserves metadata.
- **Dropping the write-gate strictness.** After cut 1, an agent with `bash: allow` can write
  into the library without prompting. This proposal argues that is correct because it matches
  every other directory, but it is a real reduction in the guarantee that was shipped.
- **Removing "Move everything"** means a user who repoints Buddy Home no longer has an
  in-app way to bring their old notes along. With the library as its own setting the notes
  do not move at all, so the question changes shape — but it does not disappear.
- The line counts above are measured file sizes and call-site counts, not a completed
  refactor. Actual deletions will differ.
