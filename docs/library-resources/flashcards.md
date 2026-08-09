# Flashcards

Status: canonical description of the shipped Buddy flashcard system.

This is the only flashcard architecture document under `docs/`. It covers authoring, storage, the Anki-aligned scheduler, review transactions, API contracts, frontend ownership, verification, and intentionally deferred work.

## Product contract

Buddy can author basic and cloze flashcard decks, persist them as managed objects, and review them with an Anki-aligned subset of the legacy scheduler.

The central correctness rule is:

> Persisted cards are scheduler input, not a product-facing queue. Only the backend queue builder decides what is available and how many cards remain.

Every due badge, Practice total, Start action, review card, and completion state consumes the same backend queue projection. A deck cannot report a positive due count while returning no review card.

## Authoring and presentation flow

The `/flashcard` command asks the active persona to delegate to `flashcard-author`. The feature is registered by `packages/buddy/src/learning/features/flashcards/feature.ts` and enabled by Buddy's shared persona feature set.

`flashcard-author` has two feature-owned tools:

- `ingest_full_text`, for named prepared resources;
- `save_flashcard_deck`, for persisting the completed deck.

It cannot delegate to another subagent. `save_flashcard_deck` returns structured `buddyObjectResult` metadata with a managed-object reference. There is no separate `render_flashcard_deck` tool: saved objects are surfaced from persisted state through the task card, Library/Practice surfaces, and Bench.

Basic notes produce one card. A cloze note produces one card per distinct `{{cN::...}}` ordinal; non-contiguous ordinals retain their template positions. Object, revision, note, card, review, and submission identities use the repository's existing identity helpers.

Key authoring files:

| Concern | File |
| --- | --- |
| Command | `packages/buddy/src/config/opencode/overlay-builder.ts` |
| Feature registration | `packages/buddy/src/learning/features/flashcards/feature.ts` |
| Subagent | `packages/buddy/src/learning/features/flashcards/subagents/flashcard-author.ts` |
| Subagent prompt | `packages/buddy/src/learning/features/flashcards/subagents/flashcard-author.md` |
| Save tool | `packages/buddy/src/learning/features/flashcards/tools/save-flashcard-deck.ts` |
| Note/card expansion | `packages/buddy/src/learning/features/flashcards/storage/save-deck.ts` |

## Managed-object storage

Each deck is a `flashcard-deck` managed object:

```text
.buddy/objects/v1/flashcard-deck/<objectID>/
  object.json
  revisions/<revisionID>/deck.json
  state/deck.json
  state/reviews/<reviewID>.json
  state/reviews/idempotency/<request-digest>.json
  state/reviews/pending-ingestion/<request-digest>.json
```

The revision payload preserves authored content. `state/deck.json` is mutable scheduler state. Review records are append-only events. Idempotency and pending-ingestion records make answer recovery and learner-memory reconciliation durable.

The deck stores:

- configuration;
- basic or cloze notes and provenance;
- cards with durable state, current queue, due value, interval, ease, repetitions, lapses, remaining steps, and last-review time;
- the current scheduling day's new/review counters.

Daily counters follow Anki's deck-counter pattern so normal queue reads are constant-time with respect to review history. A deck without counters can reconstruct them from review records and persists them on the next answer.

Card state and queue are deliberately distinct:

- states: `new`, `learning`, `review`, `relearning`;
- queues: `new`, `learning`, `day-learning`, `review`.

The distinction lets a learning or relearning card cross the day boundary and consume the correct limit without changing its learning state.

## Anki source baseline

The behavioral reference is the local Anki checkout at `/Users/prashantbhudwal/Code/anki`, commit `d4fdbefce` from 2026-08-08. Buddy reimplements the applicable semantics in its own TypeScript/storage model; it does not vendor or patch Anki.

| Concern | Anki reference | Buddy implementation |
| --- | --- | --- |
| Queue/count ownership | `rslib/src/scheduler/queue/mod.rs` | `storage/queue.ts` |
| Gathering/default mixing | `rslib/src/scheduler/queue/builder/` | `storage/queue.ts` |
| Remaining limits | `rslib/src/decks/limits.rs` | `storage/limits.ts` |
| Scheduling day | `rslib/src/scheduler/timing.rs` | `storage/timing.ts` |
| Learning steps | `rslib/src/scheduler/states/steps.rs`, `learning.rs` | `storage/scheduler.ts` |
| Reviews and fuzz | `rslib/src/scheduler/states/review.rs`, `fuzz.rs` | `storage/scheduler.ts` |
| Relearning | `rslib/src/scheduler/states/relearning.rs` | `storage/scheduler.ts` |
| Answer mutation | `rslib/src/scheduler/answering/` | `storage/review.ts`, `review-transaction.ts` |
| Reviewer response | `proto/anki/scheduler.proto::QueuedCards` | `GET .../queued-cards` |

The port preserves scheduler behavior while translating only storage representation: Anki's numeric card IDs and scheduling-day integers become Buddy ULIDs and rollover timestamps. Fuzz remains deterministic per card and repetition and uses Anki's ranges, but Buddy derives the factor from the ULID, so exact fuzz choices are not binary-identical to an Anki collection. Buddy does not retain Anki's undo-aware in-memory queues; instead, each response leases the served card's scheduling state and queue time so answer validation and no-immediate-repeat behavior use the queue that actually dealt the card.

## Queue and count ownership

The queue builder returns cards and counts from one snapshot:

```ts
type FlashcardQueuedCards = {
  queuedCardIDs: string[]
  cards: FlashcardCard[]
  queueLease: FlashcardQueueLease | null
  newCount: number
  learningCount: number
  reviewCount: number
  completion: {
    nextLearningAt: number | null
    nextQueueAt: number | null
    newLimitReached: boolean
    reviewLimitReached: boolean
  }
}
```

Reviewers normally request one card. Counts describe the whole admitted queue, not the fetch slice. For a positive fetch limit:

```text
newCount + learningCount + reviewCount == 0  iff  cards is empty
queuedCardIDs.length == newCount + learningCount + reviewCount
cards.map(card => card.cardID) is a prefix of queuedCardIDs
every returned card belongs to the counted queue
```

`queuedCardIDs` exposes the complete queue projection for deck-wide product surfaces while `cards` remains the bounded reviewer payload. It is derived from the already ordered queue after Anki-aligned admission and mixing; it does not perform or duplicate scheduling.

Queue construction separates:

- intraday learning due now;
- intraday learning inside the learn-ahead window;
- intraday learning due later;
- interday learning due now or later;
- due reviews;
- new cards.

Intraday learning uses Anki's attempted-first, then due-time ordering. Reviews and interday learning sort by due time and card ID. New cards use Anki's default template-first ordering, with ULID creation order inside a template. Intraday learning due now is presented first. The main queue evenly mixes reviews, interday learning, and new cards with the same intersperser behavior as Anki's default `MixWithReviews`; learn-ahead cards follow the main queue.

## Daily limits

Remaining limits are computed before cards are gathered:

```text
remainingReview = reviewsPerDay - reviewsStudiedToday
remainingNew = newPerDay - newStudiedToday

when newCardsIgnoreReviewLimit is false:
  remainingReview -= newStudiedToday
  remainingNew = min(remainingNew, remainingReview)
```

Review and interday-learning cards decrement review capacity as they are admitted. Because Anki caps new capacity whenever review capacity falls, new cards use only capacity left after those categories. Intraday learning does not consume the daily review limit. Setting `newCardsIgnoreReviewLimit` separates the two limits.

## Scheduling day and learning

The scheduling day rolls over at 04:00 local time by default. Daily accounting and days-late calculations use that boundary, not calendar midnight. Date arithmetic uses local dates so day-based scheduling remains aligned through daylight-saving transitions.

The default learn-ahead window is 20 minutes. An intraday card inside that window is counted and can be reviewed early. A later card is excluded and exposed through `completion.nextLearningAt`.

Learning delays follow Anki's current legacy step semantics:

- Again resets to the first configured step;
- Hard at the first step uses the midpoint of the first two steps;
- with one step, Hard uses 150% of it, capped at one additional day;
- Hard at a later step repeats that step;
- Good advances or graduates when no step remains;
- Easy graduates immediately;
- a minute delay that reaches the next rollover becomes `day-learning`;
- intraday delays receive stable card/repetition-derived fuzz of up to 25%, capped at five minutes.

## Legacy review and relearning

Buddy uses the applicable non-FSRS scheduling states from Anki:

- Hard applies `hardMultiplier` and reduces ease by 0.15;
- Good applies ease and half the overdue bonus;
- Easy applies ease, `easyMultiplier`, and the full overdue bonus, then raises ease by 0.15;
- Again increments lapses, lowers ease by 0.20, applies the lapse multiplier/minimum interval, and enters relearning when steps exist;
- passing intervals are constrained in Hard < Good < Easy order when the maximum interval permits it;
- normal graduation, lapse, and review intervals respect `intervalMultiplier`, the minimum lapse interval, and `maxInterval`;
- review fuzz uses Anki's piecewise ranges starting at 2.5 days and a stable card/repetition factor;
- a leech is reported at the configured threshold and every rounded-up half-threshold after it; zero disables leech reporting.

Relearning retains the failed review interval underneath the learning steps. Good returns to that interval; Easy returns at one day more, matching Anki's legacy transition even when that one-day exit is above `maxInterval`.

When a just-answered intraday learning card would otherwise be shown again immediately after the main queue collapses, it is placed one second behind the next ahead-learning card, matching Anki's requeue guard.

## Answer transaction

Reviews are serialized per directory and object. A submission must return the lease for the card it was shown. The backend verifies that the card's scheduling state is unchanged, reconstructs the queue at the lease time, and confirms that the submitted card was first. Stale, modified, or out-of-order cards receive HTTP 409. A learning card becoming due while the user reads another card does not invalidate the served card.

The transaction:

1. recovers an interrupted transaction and reconciles pending learner-memory ingestion;
2. resolves idempotent retries before scheduling;
3. validates the leased card state and its served queue position;
4. applies the rating and persists state, queue, daily counters, and the review record;
5. commits the idempotency record;
6. ingests the review into learner memory, retaining a retryable pending-ingestion record on failure.

The submit response contains the committed transition, not a queue snapshot. Clients request a fresh queue after success, matching Anki's answer-then-`get_queued_cards()` flow and keeping idempotent retries time-stable.

## HTTP and frontend contract

The typed routes are:

- `GET /api/objects/flashcard-deck/:objectID/deck`;
- `GET /api/objects/flashcard-deck/:objectID/queued-cards?fetchLimit=1`;
- `POST /api/objects/flashcard-deck/:objectID/reviews` with an idempotency key and the queue lease returned by `queued-cards`.

The SDK is generated from the Hono/OpenAPI contract. The web app uses `objectFlashcardDeckQueueQueryOptions()`; it does not manually fetch or inspect raw cards for availability.

The authoritative queue drives:

- Practice row badges and the aggregate due total;
- the first reviewable deck and Start button;
- workspace deck cards and category badges;
- generated-deck task cards;
- Bench and workspace review sessions;
- the review-session remaining count and completion decision.

The shared review session loads deck content and queue state concurrently. After an answer it refreshes both concurrently and updates their shared TanStack Query caches. Deck content resolves the current note; the queue exclusively owns availability.

`completion` distinguishes limit exhaustion and deferred learning. `nextQueueAt` is the earliest time the queue must be checked again without an answer: an intraday card's learn-ahead entry, or the next scheduling-day boundary for future day cards and exhausted limits. Active TanStack queries and an open empty reviewer schedule a refresh for it instead of leaving “nothing due” cached indefinitely. The current review UI intentionally renders the simpler no-due/complete wording.

## Verification

Focused backend tests live in:

- `packages/buddy/test/flashcard/flashcard-scheduler.test.ts`;
- `packages/buddy/test/flashcard/flashcard-tools-routes.test.ts`.

They cover daily limits, consumed counters, review-cap coupling, intraday/interday behavior, learn-ahead, default interspersing, learning Hard, ordered and overdue intervals, deterministic fuzz bounds, relearning, leech cadence, 04:00 rollover, queue/count consistency, transaction recovery, and idempotency.

`packages/web/test/bench-surface-render.test.tsx` verifies that Bench uses the loader deck for content while independently loading the authoritative queue.

Completion gates are the changed-package tests, `bun lint`, and root `bun typecheck`.

## Deliberately deferred Anki concepts

These remain outside the current Buddy product model:

- FSRS and desired-retention configuration;
- parent/child deck limit trees and per-day overrides;
- sibling burying, suspension, and card reset/forget;
- filtered decks and custom study;
- undo-aware incremental in-memory queue mutation;
- configurable gather, sort, and mixing modes;
- load balancing and easy-day adjustments;
- Anki import/export and media packages;
- sync, profiles, add-ons, and template infrastructure.

The scheduler boundary allows these to be introduced without moving scheduling ownership back into the UI.

## Product work after scheduler correctness

The highest-leverage next work is operational depth:

1. a browser/editor for inspecting, repairing, tagging, archiving, and deduplicating generated notes and cards;
2. review recovery controls such as undo, suspend, bury, forget, and set-due;
3. review history, backlog, lapse, leech, and deck-health surfaces;
4. import/export and backup workflows;
5. controlled study modes;
6. richer card types and, when justified, FSRS.

Those are product extensions. The queue/count/scheduling ownership described above is the shipped foundation they must reuse.
