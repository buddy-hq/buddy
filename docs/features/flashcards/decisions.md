# Flashcards — Architecture & Decisions

Status: canonical description of the shipped Buddy flashcard system.

## Product Contract & Storage

Buddy authors basic and cloze notes (`{{cN::...}}`), expanding them into individual cards and persisting them as `flashcard-deck` managed objects under `.buddy/objects/v1/flashcard-deck/<objectID>/`.

```text
.buddy/objects/v1/flashcard-deck/<objectID>/
  object.json
  revisions/<revisionID>/deck.json
  state/deck.json
  state/reviews/<reviewID>.json
  state/reviews/idempotency/<request-digest>.json
  state/reviews/pending-ingestion/<request-digest>.json
```

- `revisions/` preserves authored card templates and notes.
- `state/deck.json` maintains mutable scheduler state, card intervals, ease factors, queues, and daily counters.
- `state/reviews/` stores append-only review event logs. Idempotency and pending-ingestion records guarantee resilient recovery and learner-memory synchronization.

## Authoring and presentation contract

The `/flashcard` command asks the active persona to delegate to `flashcard-author`. That subagent uses `ingest_full_text` for named prepared resources and `save_flashcard_deck` exactly once for a substantive deck; its feature definition has `subagents: []`. Saved objects are surfaced automatically through persisted state, task cards, Practice/Library, and Bench. There is no `render_flashcard_deck` tool and no separate rendering instruction in the authoring contract.

## Anki source baseline and port boundary

The behavioral reference is the local Anki checkout at `/Users/prashantbhudwal/Code/anki`, pinned for this work to commit `d4fdbefce` (2026-08-08). Buddy ports the applicable legacy, non-FSRS semantics into its own TypeScript/storage model; it does **not** vendor or patch Anki. The mapping below is an orientation guide, not a claim that the Anki source is a runtime dependency.

| Anki reference | Buddy equivalent |
| --- | --- |
| `rslib/src/scheduler/queue/mod.rs` and `queue/builder/` | `packages/buddy/src/learning/features/flashcards/storage/queue.ts` |
| `rslib/src/decks/limits.rs` | `packages/buddy/src/learning/features/flashcards/storage/limits.ts` |
| `rslib/src/scheduler/timing.rs` | `packages/buddy/src/learning/features/flashcards/storage/timing.ts` |
| `rslib/src/scheduler/states/steps.rs` and `learning.rs` | `packages/buddy/src/learning/features/flashcards/storage/scheduler.ts` |
| `rslib/src/scheduler/states/review.rs` and `fuzz.rs` | `packages/buddy/src/learning/features/flashcards/storage/scheduler.ts` |
| `rslib/src/scheduler/states/relearning.rs` | `packages/buddy/src/learning/features/flashcards/storage/scheduler.ts` |
| `rslib/src/scheduler/answering/` | `packages/buddy/src/learning/features/flashcards/storage/review.ts` and `review-transaction.ts` |
| `proto/anki/scheduler.proto::QueuedCards` | Buddy's `GET .../queued-cards` route |

The port changes storage representation only: Anki numeric card IDs and scheduling-day integers become Buddy ULIDs and rollover timestamps. Exact fuzz choices are intentionally not binary-identical because Buddy derives a deterministic factor from each card ULID and repetition.

## Card state versus queue

These are deliberately different dimensions:

| Dimension | Values | Meaning |
| --- | --- | --- |
| Card state | `new`, `learning`, `review`, `relearning` | The durable lifecycle state of the card. |
| Queue | `new`, `learning`, `day-learning`, `review` | The currently gathered scheduling bucket. |

A learning or relearning card can cross the 04:00 scheduling-day boundary and move into `day-learning` without changing its lifecycle state. This distinction is also why persisted card state must not be mistaken for a product-facing queue; only the backend queue builder decides availability and counts.

## Central Invariant: Backend Queue Ownership

> Persisted cards are scheduler input, not a product-facing queue. Only the backend queue builder decides card availability and queue counts.

Every UI surface (Practice total, due badges, Start action, review session, and completion states) consumes the backend queue projection from `GET /api/objects/flashcard-deck/:objectID/queued-cards`. The web client never derives card availability or due counts independently.

```text
newCount + learningCount + reviewCount == 0  iff  cards is empty
queuedCardIDs.length == newCount + learningCount + reviewCount
cards is a prefix of queuedCardIDs
```

## Scheduler Decisions & Anki Alignment

Buddy implements an Anki-aligned subset of the legacy (non-FSRS) scheduler (referenced against Anki `rslib/src/scheduler/`):

1. **Scheduling Day Rollover:** The scheduling day rolls over at 04:00 local time. Daily counters (`reviewsStudiedToday`, `newStudiedToday`) calculate remaining capacity against this boundary.
2. **Limit Coupling:** When `newCardsIgnoreReviewLimit` is false, new card capacity is capped by remaining review capacity (`min(remainingNew, remainingReview)`). Intraday learning does not consume daily review limits.
3. **Queue Sorting & Mixing:**
   - Intraday learning due now is served first (ordered by attempted-first, then due time).
   - Main queue evenly mixes reviews, interday learning, and template-ordered new cards using Anki's `MixWithReviews` interspersing.
   - Learn-ahead cards (default 20-minute window) follow the main queue.
4. **Learning & Relearning Steps:**
   - Again resets to the first step.
   - Hard uses the step midpoint or 150% for single steps; on later steps, it repeats the current step.
   - Good advances steps or graduates. Easy graduates immediately.
   - Relearning preserves the prior review interval under learning steps; Good restores that interval upon completion.
5. **Review Interval & Fuzz:**
   - Intervals follow standard ease scaling with overdue bonuses and minimum lapse intervals.
   - Review fuzz uses Anki's ranges but derives deterministic factors from card ULIDs.
   - Leeches are flagged at configured thresholds and subsequent half-threshold intervals.

### Decision summary for legacy review behavior

These are compact port decisions, not a second scheduler specification: Hard lowers ease by **0.15**, Again by **0.20**, and Easy raises it by **0.15**; passing intervals are constrained in `Hard < Good < Easy` order when `maxInterval` permits. Relearning keeps the prior review interval under its learning steps; Easy returns at the prior interval plus one day even when that one-day exit exceeds `maxInterval`.

Daily-limit coupling is similarly explicit: when review-limit coupling is enabled, `remainingReview` is reduced by `newStudiedToday` before new capacity is capped:

```text
remainingReview = reviewsPerDay - reviewsStudiedToday
remainingNew = newPerDay - newStudiedToday
remainingReview -= newStudiedToday
remainingNew = min(remainingNew, remainingReview)
```

## Answer Transactions & Frontend Contract

Reviews are serialized per deck:
1. Review requests receive a `queueLease` capturing card state and queue timestamp.
2. `POST .../reviews` validates the lease; modified, stale, or out-of-order submissions return HTTP 409.
3. Transactions atomically update card state, append the review log, record idempotency, and enqueue learner-memory ingestion.
4. Clients re-fetch the queue projection post-submission rather than optimistically mutating scheduler state locally.

`completion.nextQueueAt` is a refresh hint for the earliest time the queue may change without another answer (for example, a learn-ahead card or the next scheduling-day boundary). Active TanStack Query consumers and an open empty reviewer schedule a refresh at that time; the empty-reviewer UI intentionally keeps the simpler no-due/complete wording.

## Intentionally Deferred Concepts

The following Anki features are explicitly out of scope for current architecture:
- FSRS / desired-retention optimization.
- Parent/child deck limit inheritance trees.
- Sibling burying, manual card suspension, and forget/reset flows.
- Anki package (`.apkg`) import/export pipelines and sync servers.
- Filtered decks and custom study.
- Undo-aware incremental in-memory queues.
- Configurable gather, sort, and mixing modes.
- Load balancing and easy-day adjustments.
- Sync, profiles, add-ons, media packages, and template infrastructure.

These deferrals preserve the backend queue boundary; they do not authorize moving scheduling decisions into the UI.

## Product work after scheduler correctness

The post-scheduler product backlog is deliberately operational:

1. Browser/editor surfaces for inspecting, repairing, tagging, archiving, and deduplicating generated notes/cards.
2. Review recovery controls such as undo, suspend, bury, forget, and set-due.
3. Review history, backlog, lapse, leech, and deck-health surfaces.
4. Import/export and backup workflows.
5. Controlled study modes.
6. Richer card types and, when justified by evidence, FSRS.
