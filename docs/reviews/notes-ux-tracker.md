# Notes UX tracker

Updated: 2026-09-20. Branch: `notes`. Worktree: `/Users/prashantbhudwal/Code/buddies/ux-fixes`.

Notes captures text well, but saving, reading, retrieving, and returning to the source chat need improvement. The first pass should complete that workflow before expanding capture or organisation features.

The user approved **1. Save and reopen reliably**, **2. Find notes by their content**, and **3. Make saved notes readable**. Implement these and leave all changes **uncommitted**. Delete, broader search integrations, and the other deferred items have not been approved for implementation in this pass.

The original audit followed code paths rather than clicking through the app. Follow-up inspection supports the central findings about capture formatting, save confirmation, title-only drawer search, and stored chat identity. The reported external-library image problem remains unverified. No browser or computer-use verification has been requested.

## Priorities and statuses

| Label | Meaning |
| --- | --- |
| P0, conditional | Investigate immediately; fix ahead of polish if the suspected image failure is reproduced. No confirmed P0 defect yet. |
| P1 | Needed for a dependable notes workflow. Approval is recorded separately from priority. |
| P2 | Useful follow-up or inexpensive polish; should not delay the approved core work. |
| P3 | Later convenience or broader product work. |
| In progress | Some implementation exists, but the complete behaviour has not passed verification. |
| Not started | Approved work with no completed implementation yet. |
| Deferred | Outside this implementation pass. |
| Needs decision | Product direction remains open; the assessment is a recommendation, not a user decision. |
| Needs reproduction | A suspected defect needs confirmation before being treated as established. |
| Done | Implemented and verified; never use this for partial code alone. |

## All suggestions and assessment

“Batch 1”, “Batch 2”, and “Batch 3” refer to the three approved priorities above, not the numbered sections of the original audit.

| ID | Suggestion | Assessment / intended approach | Priority | Scope | Status |
| --- | --- | --- | --- | --- | --- |
| N01 | Confirm every capture with “Saved to ‹note name› · Open”. | First capture, first capture in a chat, and subsequent captures should all give the same confirmation and an actionable destination. Keep the icon signal supplementary. | P1 | Batch 1 | Done |
| N02 | Stop replacing confirmation with an automatic drawer switch on the first save. | An unexpected panel change is a weak receipt. The standard toast should be sufficient and preserve the current workspace. | P1 | Batch 1 | Done |
| N03 | Add **Open note** in the chat header. | A permanent route back to the chat's note is more useful than a disappearing toast. Show it when a corresponding note exists; cover docked and floating chat layouts. | P1 | Batch 1 | Done |
| N04 | Add **Open chat** on chat notes. | Notes already store a session ID and notebook identity. Resolve the original notebook, including when it is closed, instead of assuming the currently open notebook owns the note. Give a clear unavailable state if the source is gone. | P1 | Batch 1 | Done |
| N05 | Mark noted messages and let their marker open the note. | Useful context, but individual message identity is not currently persisted in old capture entries. New source links can provide a foundation; markers and reconstruction of historical annotations are separate work. | P2 | Follow-up | Deferred |
| N06 | Search the text people wrote in notes. | Essential retrieval behaviour. Search the note body as well as title, notebook name, and path. Search ordinary Markdown notes too. Do not fetch every document separately from the UI. | P1 | Batch 2 | Done |
| N07 | Show a one-line content preview under each title. | Helps distinguish similarly named notes. For content matches, show an excerpt near the match instead of always showing the first line. | P1 | Batch 2 | Done |
| N08 | Show folder context for notes in subfolders. | Two `index` files should be distinguishable without opening them. Use the parent path as supporting metadata. | P1 | Batch 2 | Done |
| N09 | Remember “This notebook” / “All notes”. | Resetting the filter makes externally created notes appear to disappear. Persist the explicit choice across drawer remounts and app restarts. | P1 | Batch 2 | Done |
| N10 | Use “No notes in this notebook” with **Show all notes** for a scoped empty state. | Distinguish an empty filter from an empty library. Preserve “No matching notes” for a search with no results, and offer the broader scope when relevant. | P1 | Batch 2 | Done |
| N11 | Include notes in the main Search drawer. | Valuable after note content search is dependable. This is a separate search-provider integration, not a prerequisite for repairing the Notes drawer. | P2 | Follow-up | Implemented; not yet checked in the app |
| N12 | Include notes in the Bench new-tab picker. | Improves discovery, but permanent chat links and the drawer solve the immediate retrieval problem first. | P2 | Follow-up | Implemented; not yet checked in the app |
| N13 | Include notes in `@mentions`. | Useful for deliberately bringing a note into a conversation. Make that explicit user action distinct from automatically sharing all captures with Buddy. | P2 | Follow-up | Deferred |
| N14 | Replace “Missing notebook” with “Notebook not open”. | Avoid implying lost data when the notebook is merely closed. Actual missing-source navigation still needs its own error state. | P2 | Small copy change alongside Batch 2 | Done |
| N15 | Replace “Standalone” / “From chats” with “My notes” / “Chat notes”. | More familiar drawer labels. This does not resolve the larger Files-versus-Notes product model. | P2 | Small copy change alongside Batch 2 | Done |
| N16 | Remove repeated “Note — 14:30” and “Annotation — 14:30” headings. | Use a quiet timestamp so the outline reflects meaningful user-authored headings. Keep one growing file per chat for this pass. Apply the new format to new captures without rewriting existing prose. | P1 | Batch 3 | Done |
| N17 | Include dates and add a date separator when the day changes. | Time alone is ambiguous across days. Each day's captures should have a readable date, without repeating a large heading for every entry. | P1 | Batch 3 | Done |
| N18 | Quote a short excerpt instead of the entire message. | Keep the learner's own words prominent. Bound the quote, preserve its readability, and leave the full source accessible. The composer preview should also avoid a wall of quoted text. | P1 | Batch 3 | Done |
| N19 | Link each new message excerpt back to its source message. | A shortened quote needs a reliable way to recover context. Persist session/message identity in the link and navigate through the existing chat workflow, including virtualized messages. | P1 | Batch 3 | Done |
| N20 | Let users select a sentence in a chat message and note only that selection. | A useful capture enhancement, but not required to stop saving oversized whole-message quotes. Reuse selection infrastructure when this is taken on. | P2 | Follow-up | Deferred |
| N21 | Give a chat note a sensible initial name when its chat still has a placeholder title. | Never expose the raw `New session - <ISO timestamp>` name as the default note title. Use a readable dated fallback until the chat receives a meaningful title. | P1 | Batch 3 | Done |
| N22 | Update the note name when the chat gets its real title, unless the user renamed the note. | Record ownership of generated names. Respect manual renames inside Buddy and external filename changes. Handle filename collisions, preserve the body and attachments, and keep already-open notes usable after a rename. Do not guess whether old names were user-chosen. | P1 | Batch 3 | Done |
| N23 | Hide `.md` in note tab labels. | Cheap readability polish; the extension is unnecessary in the tab's primary label. Keep the actual filename available in file information. | P2 | Optional follow-up polish | Done |
| N24 | Give capture, quote, library, and create actions distinguishable icons or labels. | The library icon currently carries several meanings. Clear action labels are the fastest improvement; a complete icon redesign can wait. | P2 | Follow-up | Deferred |
| N25 | Label the composer action **Save** in Note mode. | A visible verb communicates the action more reliably than a tooltip on the usual send arrow. This should precede making Note mode persistent. | P2 | Optional follow-up polish | Implemented; not yet checked in the app |
| N26 | Give Note mode a clearer visual treatment, such as a tinted composer. | Helps prevent confusing a private note with a chat message. Use existing theme tokens and keep the treatment legible across themes. | P2 | Follow-up | Deferred |
| N27 | Stay in Note mode after saves; return to chat automatically after a message quote. | Reduces friction for repeated note taking, but also makes it easier to save an intended chat message accidentally. Revisit after the Save action and mode cues are unmistakable. | P2 | Follow-up | Deferred |
| N28 | Rename the message action “Add note” to “Quote in note”. | The current action prepares a draft rather than saving. The label should describe that actual behaviour. Hover-only discovery is a separate interaction concern. | P2 | Optional follow-up polish | Done |
| N29 | Add delete to the drawer row and open note, with undo or recoverable trash. | Basic ownership of personal notes. This is the recommended next P1 after the approved three batches, ahead of organisation conveniences. It is not approved in this pass. | P1 | Next batch | Implemented; not yet checked in the app |
| N30 | Put newly created chat notes in a dedicated folder. | Avoid filling an external vault's root with generated files. Decide the default placement and preserve relative attachment links; do not silently move existing user files. | P2 | Follow-up | Done |
| N31 | Add folders and move. | Helpful once the library grows, but larger than a sensible default folder. Moving requires link and attachment handling as well as a UI action. | P3 | Later | Deferred |
| N32 | Select the title when a standalone note is created. | A small improvement that prevents piles of “Untitled note N”. Focus/select only for a newly created note, not when reopening an existing note. | P2 | Optional follow-up polish | Implemented; not yet checked in the app |
| N33 | Add **Show in Finder / Explorer**. | Useful escape hatch for a filesystem-backed library. Support both macOS and Windows. | P3 | Later | Deferred |
| N34 | Add **Open in Obsidian**. | Useful for connected vault users, but not essential to Buddy's core notes workflow. Handle installations and vault paths deliberately. | P3 | Later | Deferred |
| N35 | Add pinning. | A convenience for frequently used notes. Body search, previews, and source links have higher immediate value. | P3 | Later | Deferred |
| N36 | Rename the Settings action “Change Notes” to “Choose folder…”. | Describes the filesystem action more accurately. Can ship as a small independent copy improvement. | P2 | Follow-up | Done |
| N37 | Add **Reset** for the Notes folder setting. | Clarify that reset changes the configured location; it must not imply deletion or silently relocate existing notes. | P2 | Follow-up | Implemented; not yet checked in the app |
| N38 | Fix images that may fail to render when the library is outside Buddy's default home and is not an open notebook. | Investigate promptly in temporary roots. If reproduced, rendering saved content correctly outranks cosmetic work. The original report explicitly did not reproduce this failure; it is not confirmed here either. | P0, conditional | Separate investigation; not in approved batches | Done |
| N39 | Clean up images left in `Attachments/` after removal from notes. | Avoid automatic deletion until references across all notes are accounted for; attachments can be shared or referenced externally. Orphan cleanup is less urgent than rendering correctness. | P3 | Later | Deferred |
| D01 | Decide whether Buddy should automatically know when and what the learner notes. | Recommendation: keep capture private by default; allow explicit sharing through a later mention/attach flow. Tutor signals could be useful, but automatic access changes the privacy model and needs a deliberate product decision. | Product decision | Preserve current behaviour for this pass | Decided 2026-09-23: private by default; the learner shares a note explicitly (e.g. @mention). N13 follows this model. |
| D02 | Explain or merge notebook Files, the separate Notes library, and the “Notebook” container. | Recommendation: make location and scope clear now; defer a merger. A unified storage model has broader migration, navigation, and external-vault implications. | Product decision | No storage-model redesign in this pass | Needs decision |
| D03 | Choose one note per chat or several. | Recommendation: retain one note per chat for this pass. One file can read well with dates, short quotes, and meaningful user headings; multiple notes need an explicit destination/creation model. This decision does not need to block the approved readability fixes. | Product decision | Preserve one note per chat for this pass | Needs decision |

## Completion criteria for the approved work

| Batch | Required outcome | Verification still needed |
| --- | --- | --- |
| 1 — Save and reopen | Every capture confirms with the saved name and Open action. The chat header opens its note. A chat note returns to its original chat, including across notebook contexts. Failed saves do not show success. | Verified through typed UI integration and focused navigation tests. Browser interaction was not run because it was not authorised. |
| 2 — Find by content | Body-only matches work for Buddy and ordinary Markdown notes. Rows show useful previews and folder context. The filter persists and empty states describe the selected scope. | Verified with backend body-search tests, preference migration/persistence tests, query-cache tests, lint, and typecheck. |
| 3 — Readable captures | New entries use dates and quiet times. Quotes stay short and link to the correct message. Placeholder chat names produce readable defaults. Auto names follow the chat until the user takes ownership. Existing note bodies remain intact. | Verified with capture-format, excerpt, title-following/manual-rename, stable-target, and pending message-navigation tests. Existing entries are preserved and only new captures use the new format. |

## Implementation and verification record

| Area | Current record |
| --- | --- |
| Backend changes | Complete for the approved scope in `packages/buddy/src/notes/`, `packages/buddy/src/routes/notes.ts`, and `packages/buddy/src/node-server.ts`: body search/previews, readable capture formatting, source notebook lookup, generated-title ownership, collision-safe title following, and stable ID reads/writes. |
| Frontend changes | Complete for the approved scope in Notes features, Bench routing, chat headers/transcript, drawer rows, UI preferences, and English strings: uniform confirmation, two-way navigation, compact source quotes, stable note targets, content search/previews, scope persistence, and scoped empty states. |
| Outstanding integration | None in the three approved batches. N05 and N11–N13 remain explicit follow-ups rather than hidden partial work. Browser interaction remains unverified because repository rules require explicit user approval. |
| Tests | Passed 24 backend tests across the Notes and Bench-context focused files, plus 91 web tests across Notes queries/navigation, Bench routing, drawer integration, titlebar controls, transcript mounting, composer drafts, UI preference persistence, and workspace target persistence. |
| Required checks | `bun lint` passed. `bun typecheck` passed after regenerating the SDK from the local backend schema. `git diff --check` passed. |
| Follow-up fixes (2026-09-23) | After syncing with `origin/main`: previews and body search now ignore capture dates/times, legacy `Note —`/`Annotation —` headings, `Open message` links, and image filenames (N06/N07); a new chat note re-reads the chat title inside the Notes lock so a title arriving mid-capture is not lost (N21/N22); a title-following rename publishes `notes.library.updated` so the drawer and open notes refresh (N22). Focused tests, lint, and typecheck passed. |
| Second pass (2026-09-23) | User decisions: system trash for Delete; Obsidian vaults are a supported Notes location; notes stay private unless explicitly shared. Implemented: a Notes-only image route (`GET /api/notes/image`) that resolves note-relative, library-relative, and Obsidian name-only images inside the library and refuses non-images, escapes, and symlinks out of the library (N38); note tab names from the library title by note ID, without `.md`, following background renames (N23); background-change dots on note tabs keyed by note ID again; new chat notes in a `Chat notes/` folder, existing files untouched (N30); Settings "Choose folder…" and "Reset to default" without moving files (N36/N37); "Quote in note" (N28); a "Save" button in Note mode (N25); a distinct Open-note header icon (partial N24); title selection for newly created notes (N32); Delete from the drawer row menu and the open note, with Undo while the toast is visible and a move to the system trash after it closes (N29). Focused backend and web tests, lint, and typecheck passed. `bench-surface-render.test.tsx` fails on an SVG import from an untouched file-icon dependency, independent of this work. |
| Third pass (2026-09-23) | From manual-test feedback. Delete no longer closes the open drawer: removing a note's tabs now runs through the workspace controller and keeps the drawer (N29). A quoted message can be saved without typed text. The saved toast is skipped when the note is already visible. The Open-note button sits at the right end of the chat and floating-chat headers with the rail's Notes icon. New message quotes keep the whole message in a folded Obsidian `[!quote]-` callout (expanded when the quote is the whole entry), so a note outlives its chat; headings inside the quote become bold and code fences are preserved. User decision: notes in Search cover all notes. Notes appear in the right-rail Search and the Bench new-tab picker with a Notes filter (N11/N12). Notes list and search cache each note's plain text per file version: on a 4,000-note, ~1M-line temporary vault, warm list/search dropped from 2–4 s to ~0.1–0.2 s. Focused backend and web tests, lint, and typecheck passed. |
| Formatting | Do not run `bun fmt` until implementation is complete and the user is satisfied, per repository instructions. |
| Browser verification | Not performed or authorised. Use code and focused tests unless the user requests browser/computer-use verification. |
| Git | Leave all changes uncommitted. Preserve unrelated pre-existing files in this worktree. |
| Delegation | The requested Sol-high subagents exhausted their usage limits before completing the work. Per the user's instruction, they were not resumed; the primary agent reviewed their partial state and completed the implementation, integration, and verification directly. |

Update the status and verification record as work progresses. Record failed checks and limitations explicitly; the presence of code alone does not mean an item is complete.
