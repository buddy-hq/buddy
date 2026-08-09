# Flashcard Queue and Review Computer Use E2E

Date: 2026-08-09  
Runner: Codex Computer Use against a dedicated `bun dev:desktop:fast` instance  
Fixture title: `E2E Flashcards 2026-08-09`

## Purpose

Verify the changed flashcard system through the same Electron UI a learner uses. The run must exercise authoring, managed-object presentation, the authoritative backend queue, deck and practice surfaces, review submission, session transitions, and persisted reload behavior. React fixtures or the Easel prototype may help diagnose a failure, but they do not count as passing the live-product cases below.

## Product invariants under test

- `save_flashcard_deck` persists the authored deck and returns a managed-object result that the task card can open.
- Practice totals, deck badges, the deck standing, review remaining count, and completion all agree with `queued-cards`; the UI does not infer availability from raw cards.
- A review answer submits the served card together with its queue lease, commits once, and refreshes deck content and queue state.
- Question/answer visibility is correct for both basic and cloze notes.
- Peeking or off-schedule Practice never schedules a card or changes the due count.
- Bench owns a deck target. Deck, scheduled review, completion summary, and off-schedule Practice are modes of that same target.
- A deck opened on Bench supplies safe edit context. A minor text correction changes note text without replacing deck identity or scheduling state.
- State survives closing/reopening the surface and an Electron reload.

## Fixture request

In a new chat, run `/flashcard` with this request:

> Create a deck titled "E2E Flashcards 2026-08-09" with exactly four cards about queue testing. Use three basic notes and one cloze note with exactly one cloze ordinal. Include these recognizable answers: FIFO, idempotency key, queue lease, and 4:00 AM rollover. Keep every card to one sentence and save the deck.

The recognizable content makes hidden/revealed-state checks unambiguous. Exactly four cards permits one first-pass submission with each rating: Again, Hard, Good, and Easy.

## Test cases

### FC-E2E-01 — Dedicated instance identity

1. Start `bun dev:desktop:fast` from this repository root.
2. Record its parent PID and the spawned Electron PID from the command session.
3. In Computer Use, select the Electron/Buddy window whose title or process belongs to this worktree/branch instance.
4. Confirm the app reaches a usable directory chat without a fatal startup error.

Pass: every later UI action is performed in that exact process/window, not another running Buddy instance.

### FC-E2E-02 — Author and save through the flashcard tool flow

1. Create a fresh chat in the active test directory.
2. Submit the fixture request through `/flashcard`.
3. Observe delegation to the flashcard-author task and wait for completion.
4. Confirm the task result names the requested deck and exposes an open/view action.

Pass: the author flow completes without an error, the save tool returns a persisted flashcard-deck object, and the task card can open it.

### FC-E2E-03 — Practice catalog and queue agreement

1. Open the Practice drawer.
2. Find `E2E Flashcards 2026-08-09`.
3. Record its card metadata, row action, row due count, and aggregate Ready to review total.
4. Open the deck from its row rather than the row action.

Pass: the row reports four cards and a review action/count consistent with the aggregate total; opening the row closes the drawer and opens the deck on Bench.

### FC-E2E-04 — Fresh deck standing, filters, and peek safety

1. Confirm the deck identity and fresh/ready standing.
2. Verify the All, Due, New, and Leeches filters are present.
3. Verify All, Due, and New each show the expected four-card fixture before review; Leeches is empty.
4. Expand one basic row and the cloze row, confirming answers render in the expanded content.
5. Collapse them and return to All.
6. Reopen Practice and confirm its due count is unchanged.

Pass: the standing offers Start/Study, filter membership matches backend queue/state, expanded text is correct, and peeking does not mutate scheduling.

### FC-E2E-05 — Basic and cloze reveal contract

1. Start scheduled study from the deck.
2. Before reveal, confirm the answer text is absent and rating controls are not actionable/visible.
3. Reveal the answer; confirm the question remains contextualized and Again/Hard/Good/Easy become available.
4. When a cloze card is reached, confirm the target is a blank before reveal and filled after reveal.

Pass: no answer leaks before reveal, the reveal works, and both basic and cloze presentation match their authored content.

### FC-E2E-06 — All four review submissions and live queue refresh

1. On the first four distinct cards, submit Again, Hard, Good, and Easy once each, revealing before every rating.
2. After each rating, record the next visible card and remaining count.
3. Attempt no double-click; observe that submission disables/guards the controls while pending.
4. Confirm a rated card transition is animated and the UI never shows a stale question with another note's answer.

Pass: all four submit-review paths succeed without an error; each committed answer advances or requeues according to the scheduler, queue/deck caches refresh, and remaining counts stay internally consistent.

### FC-E2E-07 — Review continuity and same-target modes

1. Exit an in-progress review to the deck.
2. Start Study again and confirm it resumes from current persisted queue state rather than reconstructing the original four-card queue.
3. Finish the currently available sitting with Good/Easy as needed.
4. Confirm the completion summary shows reviewed count, elapsed study time, rating tally, and the scheduler-derived next standing.
5. Use Back to deck and confirm the same Bench target remains open.

Pass: review state is durable, the completion decision comes from the refreshed queue, and navigation changes modes rather than opening duplicate targets.

### FC-E2E-08 — Off-schedule Practice is non-mutating

1. From a drained/waiting deck or its completion summary, open Practice.
2. Reveal an answer, move Next, then exit to the deck.
3. Record the deck standing and Practice due count before and after.

Pass: Practice clearly identifies itself as off-schedule, permits reveal/navigation, exposes no ratings, and does not change queue counts or scheduler state.

### FC-E2E-09 — Bench edit context and live refresh

1. With the test deck open on Bench, ask Buddy in chat to change one unmistakable answer phrase, preserving IDs and scheduling.
2. Wait for the file-tool edit to complete.
3. Reopen or refresh the relevant deck row/card.
4. Confirm the corrected text appears and the deck title/card count/current standing are unchanged.

Pass: the agent receives the flashcard deck edit path/context, performs only the requested note-text edit, and the UI invalidates/refetches the managed object without resetting scheduling state.

### FC-E2E-10 — Reload persistence and error check

1. Reload the dedicated Electron window.
2. Reopen Practice and the test deck.
3. Confirm edited content, review progress, standing, and due count persist.
4. Review the dedicated dev command output for uncaught exceptions, failed API requests, React render errors, or backend crashes produced during this run.

Pass: persisted state survives reload and no flashcard-related fatal/runtime error was emitted.

## Execution record

| ID | Result | Evidence / notes |
| --- | --- | --- |
| FC-E2E-01 | Pass | `electron-vite` PID 25436; Electron PID 25493; exact app path targeted by Computer Use; window title `Buddy Dev — flashcard-redesign`; renderer `localhost:5173`; object test remained in that window. |
| FC-E2E-02 | Pass | `/flashcard` delegated to `Create queue testing flashcards`; saved object `01KZKQB8B1VXX9S8PAXWWF5E0X`; task result showed `4 cards · 4 due` and opened the object. |
| FC-E2E-03 | Pass | Practice showed aggregate `39 due`; fixture row showed `4 cards` and `Study 4`; opening the row closed the drawer and opened the deck on Bench. |
| FC-E2E-04 | Pass with copy defect | Fresh standing showed four cards; All, Due, and New contained all four; Leeches showed `No cards match this filter`; basic and cloze peeks rendered correct answers and Practice remained `Study 4`. The fresh-deck detail incorrectly rendered `1 days`; see defect D-01. |
| FC-E2E-05 | Pass | Basic answer and rating buttons were absent before reveal; reveal showed the answer and four ratings. Cloze displayed a blank before reveal and `4:00 AM` after reveal. |
| FC-E2E-06 | Pass | Again, Hard, Good, and Easy each committed on a distinct first-pass card. The queue reprojected from four new to three learning cards; deck standing, task card, and session header updated without stale content or submission errors. |
| FC-E2E-07 | Pass | Exit returned to the same object URL and a `3 due now · 3 learning` deck standing. Restart loaded `0 / 3`, not the original queue. Three Easy answers drained it to a summary: `3 reviewed in 40s · 3 Easy`, then Back to deck showed `CLEAR` and four cards returning later. |
| FC-E2E-08 | Pass | Practice displayed `OFF SCHEDULE` and `Nothing here is rated`; reveal and Next worked; no ratings appeared; exit returned to unchanged `CLEAR` standing and unchanged 2d/4d/2d/2d due dates. |
| FC-E2E-09 | Pass | With the deck on Bench, Buddy used `Read files · Edited files` to change only the FIFO answer. The expanded row live-refreshed to `FIFO means the earliest enqueued message is processed first.` while title, four-card count, and `CLEAR` standing remained unchanged. |
| FC-E2E-10 | Pass | `Cmd+R` kept the same object target. Edited text, four review cards, due dates, and `CLEAR` standing survived. Practice dropped from aggregate 39 to 35 due and showed this deck as `Aug 12`, with no Study action. Dedicated dev output showed successful 200/204 flashcard deck, queued-card, review, object, and Bench-context requests and no flashcard exception or failed request. |

## Defect record

For every failure, record the case ID, exact UI state, expected result, actual result, whether it reproduces after reload, and the relevant dedicated-instance terminal output. Do not change implementation during this run; report defects separately so the observed build remains fixed.

### D-01 — Singular day copy is grammatically incorrect

- Case: FC-E2E-04
- Severity: minor presentation defect
- State: brand-new four-card deck with `newPerDay` 20
- Expected: `At 20 new a day, that's 1 day to meet them all.`
- Actual: `At 20 new a day, that's 1 days to meet them all.`
- Reproduction: visible on the initial fresh-deck standing; that state no longer exists after completing the reviews.

## Run conclusion

All queue, authoring, managed-object, review, practice, edit-context, and persistence behaviors in this live fixture passed. D-01 is the only observed defect and does not affect flashcard data or scheduling correctness. The unrelated startup warning `System skill pack refresh failed: Skill artifact fetch failed: 404 Not Found` occurred before the E2E actions and did not affect the flashcard run.
