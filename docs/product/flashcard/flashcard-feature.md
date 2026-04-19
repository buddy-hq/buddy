# Flashcard Feature

Spaced-repetition flashcard capability for Buddy. Lets users generate flashcard decks from any learning material via AI, then review them with SM-2 scheduling.

## Architecture

Follows the question-set two-tool-plus-subagent pattern exactly.

### Backend

| Layer | File | Purpose |
|-------|------|---------|
| Types | `packages/buddy/src/learning/capabilities/flashcard/types.ts` | All Zod schemas, constants, inferred TS types |
| Scheduler | `packages/buddy/src/learning/capabilities/flashcard/scheduler.ts` | Pure SM-2 scheduling logic (no I/O) |
| Paths | `packages/buddy/src/learning/capabilities/flashcard/path.ts` | Filesystem path helpers for `.buddy/flashcard-decks/` |
| Service | `packages/buddy/src/learning/capabilities/flashcard/service.ts` | CRUD, review submission, due-card selection, note-to-card expansion |
| Save tool | `packages/buddy/src/learning/capabilities/flashcard/tools/save-flashcard-deck.ts` | AI tool: persist a deck authored by the subagent |
| Render tool | `packages/buddy/src/learning/capabilities/flashcard/tools/render-flashcard-deck.ts` | AI tool: produce metadata for inline chat rendering |
| Subagent | `packages/buddy/src/learning/flashcard-author/agent.ts` + `prompt.p.md` | Specialized author agent; gets save tool, denied render tool |
| API routes | `packages/buddy/src/routes/flashcard-decks.ts` | Hono routes: list, read, next-card, submit-review |

### Frontend

| Layer | File | Purpose |
|-------|------|---------|
| SDK | `packages/sdk/src/gen/` (generated) | `FlashcardDecks` class: `.list()`, `.read()`, `.nextCard()`, `.submitReview()` |
| State | `packages/web/src/state/workspace-artifacts-query.ts` | TanStack Query keys + options for deck list |
| State | `packages/web/src/state/chat-actions.ts` | `FlashcardDeckListItem` type + SDK-based loader |
| Panel | `packages/web/src/components/layout/workspace-flashcard-panel.tsx` | Dock tab: deck list + embedded review session |
| Inline render | `packages/web/src/components/chat/tools/render/flashcard/index.tsx` | Chat tool render: card previews + review dialog trigger |
| Card display | `packages/web/src/components/flashcard/flashcard-card-display.tsx` | Basic + cloze card renderer with flip animation |
| Ratings | `packages/web/src/components/flashcard/flashcard-review-ratings.tsx` | Again / Hard / Good / Easy buttons |
| Review dialog | `packages/web/src/components/flashcard/flashcard-review-dialog.tsx` | Modal review session (opened from inline render) |

### Registration Points

The flashcard capability is wired into Buddy through these 8 files:

1. `teaching-vocabulary.ts` — `"flashcard"` added to `SURFACES`
2. `define-buddy-persona.ts` — `"flashcard"` added to `PersonaSurface` union
3. `tool-metadata.ts` — `flashcard` group policy + metadata for both tools
4. `tool-registry.ts` — `flashcard: flashcardTools` in `learningToolGroups` + descriptor
5. `subagent-manifest.ts` — `FLASHCARD_AUTHOR_AGENT` in `BUDDY_SUBAGENTS`
6. `buddy.ts` (persona) — `"flashcard"` surface, `render_flashcard_deck: "allow"`, `"flashcard-author": "prefer"`
7. `routes/index.ts` — `FlashcardDeckRoutes` export
8. `index.ts` (server) — Mounted at `/api/flashcard-decks`

### /flashcard Command

Registered programmatically via the config overlay in `packages/buddy/src/config/opencode/overlay-builder.ts` as `BUDDY_BUILTIN_COMMANDS`. This was necessary because file-based `.opencode/command/*.md` discovery walks from the user's project directory upward, and user projects are not inside the Buddy repo.

## Data Model

### Storage Layout

```
.buddy/flashcard-decks/
  <ULID>/
    deck.json          # FlashcardDeck (config + notes + cards)
    reviews/
      2026-04-19.jsonl  # ReviewRecord entries (append-only, one per line)
```

### FlashcardDeck

Single JSON file per deck. Contains:
- **DeckConfig**: SM-2 parameters (newPerDay, reviewsPerDay, learnSteps, ease factors, multipliers, maxInterval, leechThreshold)
- **Notes**: Content units. Types:
  - `basic` — `{ front, back }`
  - `cloze` — `{ text }` with `{{c1::answer}}` syntax. One cloze note with N distinct ordinals produces N cards.
- **Cards**: Reviewable units. States: `new` -> `learning` -> `review`, with `relearning` on lapse. Each card tracks: state, due (timestamp ms), interval (days), easeFactor (permille), reps, lapses, remainingSteps.
- **Provenance**: `createdBy { sessionID, messageID, callID, subagent }`

### SM-2 Scheduling

Implemented in `scheduler.ts` as pure functions (no I/O, no side effects).

**Learning phase:**
- New cards enter learning, step through `learnSteps` (minutes)
- Again -> reset to step 0; Hard -> repeat current step; Good -> advance step; Easy -> graduate immediately
- Graduate: card transitions to `review` state with `graduatingIntervalGood` or `graduatingIntervalEasy`

**Review phase:**
- Again -> lapse (ease -= 200, enter relearning, interval reset)
- Hard -> ease -= 150, interval * hardMultiplier
- Good -> interval * (ease / 1000)
- Easy -> ease += 150, interval * (ease / 1000) * easyMultiplier
- Intervals clamped to [1, maxInterval], fuzzed +/-5% to prevent clustering

**Leech detection:** After N lapses (configurable `leechThreshold`), card is flagged as leech in the review response.

## Two-Tool Pattern

Matches the question-set architecture:

1. **User sends `/flashcard` command** (or Buddy auto-detects flashcard intent)
2. **Persona delegates to `flashcard-author` subagent** (preference: "prefer")
3. **Subagent calls `pedagogy_resource_ingest_full_text`** to get the source material
4. **Subagent calls `save_flashcard_deck`** with title + notes array -> deck persisted to disk
5. **Subagent hands off back to persona** with `deckID` in response
6. **Persona calls `render_flashcard_deck`** with the `deckID` -> returns metadata for inline chat rendering
7. **Frontend renders inline tool card** with card previews + "Start Review" button

## v1 Scope

### Included

- Basic cards (front/back) and cloze cards (`{{c1::answer}}` syntax)
- SM-2 scheduling algorithm
- Four ratings: Again, Hard, Good, Easy
- Learning steps and relearning steps
- Leech detection
- Daily new-card and review limits
- Due count tracking (new, learning, review)
- Per-notebook decks
- AI generation from any learning context
- Inline chat preview with card count and sample cards
- Deck panel in workspace dock with due count badges
- Review UI with flip animation
- Review dialog (from inline render) and embedded review (from panel)
- Review history logging (append-only JSONL per day)

### Excluded (future)

- FSRS (Free Spaced Repetition Scheduler) — more sophisticated successor to SM-2
- Image occlusion cards
- Reversed card type (auto-generate back->front from basic cards)
- Cross-notebook review (review all due cards across notebooks)
- Deck import/export (Anki `.apkg`, CSV)
- Full statistics graphs (retention curves, review heatmaps)
- Filtered/custom study decks
- Suspend/bury individual cards
- Undo last review
- Tag-based filtering during review
- Manual card editor UI (add/edit/delete individual cards without AI)
