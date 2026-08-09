---
name: flashcards
description: "Buddy flashcards: content, images, due counts, ratings, timing, limits, review history, off-schedule practice."
---

# Flashcards

Use when the user asks how Buddy flashcards work, what cards can contain, why something is due, what a rating changes, or how to plan study.

Not question sets / quizzes — `practice.md`.

## Mental model

- **Deck** = saved set of cards in this notebook.
- **Deck view** = status + every card. Always browseable.
- **Study** = cards Buddy selected for now.
- Reading / peeking changes nothing. Only a rating moves a due date.
- Deck size ≠ today’s count. Limits and waits can hold cards for later.

## Create and find

- Create: ask in chat or `/flashcard` [topic].
- Find: right rail → **Practice**.
- Deck name → deck view. **Study N** → scheduled study.
- Saved in the current notebook.
- Typical generated deck: 6–25 high-value cards; fewer for thin material, more only when useful.
- Named source available → cards should stay grounded in it. Too little learnable content → no empty/padded deck.

## Source material

- Can use meaningful chat context or prepared text from a named notebook source: document, PDF, EPUB, or book.
- Named source → read its available text before authoring when possible.
- Deck stores the resulting card text + optional source label—not a copy of the whole source.
- Source attachments do not automatically become card attachments.
- Image-only/scanned material is not a guaranteed text source. Do not promise extraction Buddy has not shown.

## Card content

| Type | Stores | Best for |
| --- | --- | --- |
| **Basic** | separate front + back | questions, explanations, contrasts, examples, formulas |
| **Cloze** | sentence with one or more hidden parts | exact terms, symbols, short phrases, ordered steps |

- Basic front/back render Markdown: emphasis, lists, tables, links, inline/block code, and math.
- Cloze is plain text in review; Markdown inside it is not formatted.
- Each distinct cloze number makes one card. Repeated blanks with the same number belong to that card.
- Deck title + optional deck source. Notes can also store tags + source labels.
- Tags/source are stored; no current deck-view filter/editor for them.
- Recall is self-rated. No typed-answer checking or automatic grading.

## Images and media

- No native image-attachment field or deck media bundle.
- Basic cards can render a reachable image URL in Markdown: `![label](https://…)`.
- Buddy does not copy that image into the deck. Offline, moved, private, or expired URL → image may fail.
- Do not promise notebook-relative/local image paths.
- Cloze cards do not render Markdown images.
- No native audio card, video card, image occlusion, or embedded media editor.
- A link can appear on a basic card; that is not the same as bundled playable media.

## What “Due” means

- **Due** = cards Buddy selected for today: new + learning + returning review.
- **New** = never rated.
- **Learning** = short first-day repeats.
- **Review** = learned card returning after a day or longer.
- **Relearning** = previously learned card missed again.
- Reviewer shows one card at a time; Due count describes the whole ready set.

Example: 24 unseen cards, 20-new daily limit → 20 ready today; 4 wait for the next study day. Nothing is missing.

## Default timing

Current deck defaults; explain as approximate, not promises:

| Rule | Default |
| --- | --- |
| Study day resets | 4:00 a.m. local time |
| New cards | up to 20 per study day |
| Returning-review capacity | up to 200 per study day; new cards use remaining room |
| First learning steps | about 1 minute, then about 10 minutes |
| Early review | a learning card due within 20 minutes may appear early after other work |
| First successful return | about the next study day |
| Easy exit from first learning | about 4 days |
| Missed learned card | relearn after about 10 minutes; return interval restarts from at least 1 day |
| Leech warning | after 8 misses, then periodically after more misses |

- Same-day learning repeats do not spend the returning-review limit.
- Returning reviews get capacity before new cards when the day is crowded.
- Due learning cards come first; returning and new cards are mixed through the session.
- Small stable timing variation prevents large groups returning together. Exact minute/day can differ slightly.
- “Today” runs until the 4:00 a.m. reset, not midnight.

## What ratings change

### New / learning card

- **Again** — reset to the first short step; usually about 1 minute.
- **Hard** — stay on the current learning step or use a middle delay; usually several minutes.
- **Good** — advance to the next step; after the last step, return about the next study day.
- **Easy** — skip remaining learning steps; return in roughly 4 days.

First pass through a new card:

| Rating | Usual next appearance |
| --- | --- |
| **Again** | about 1 minute |
| **Hard** | about 5–7 minutes |
| **Good** | about 10–13 minutes; another Good then sends it to the next study day |
| **Easy** | roughly 4 days; skips short learning |

### Returning review card

- **Again** — count a miss; short relearning repeat; shrink the interval; future growth becomes slower.
- **Hard** — smallest interval growth; future growth becomes slightly slower.
- **Good** — normal interval growth; part of overdue time counts.
- **Easy** — largest interval growth; all overdue time counts; future growth becomes slightly faster.

Intervals grow from that card’s own history. Two cards given the same rating can receive different dates.

### Returning-card math

**Growth factor** = that card’s personal interval multiplier. Starts at 2.5×; never below 1.3×.

| Rating | Default interval rule | Growth-factor change |
| --- | --- | --- |
| **Again** | short repeat near 10 minutes; later interval restarts at 1 day | −0.20 |
| **Hard** | current interval × 1.2; normally at least 1 day longer | −0.15 |
| **Good** | (current interval + half the overdue days) × growth factor | none |
| **Easy** | (current interval + all overdue days) × growth factor × 1.3 | +0.15 |

- Passing dates stay ordered: Hard before Good before Easy, unless the maximum interval is reached.
- Short learning delays can vary by up to 25%, capped at 5 extra minutes.
- Longer intervals receive a small stable variation; avoids many cards landing together.
- Maximum stored interval: 36,500 days. Usually irrelevant; prevents unbounded growth.

## Study flow

1. **Start studying** / **Study N**.
2. Read front → **Show answer**.
3. Judge recall → **Again / Hard / Good / Easy**.
4. Continue until ready cards finish, a learning card is waiting, or a daily limit is reached.

A rating is schedule input—not a grade or judgment of the learner.

End screen: reviewed count + time + rating mix + why study stopped + other due decks. Deck remains available.

## Why study stopped

- **Next card in…** — learning card is waiting; deck can refill later today.
- **Daily limit** — ready cards held until the next 4:00 a.m. reset.
- **All caught up** — nothing ready now; later cards remain scheduled.
- **No new cards left today** — new-card allowance used; returning cards may still appear.

## Practice off schedule

- Available from caught-up / waiting / limited deck.
- Browse all cards; show/hide answer; move next.
- No ratings. No due-date, interval, miss, or review-history change.
- Extra rehearsal only; it does not catch up or reschedule cards.

## What Buddy remembers for the deck

- Per card: next due time, interval, learning state, review count, misses, remaining steps, last answer time.
- Per rated answer: rating, time spent, answer time, and schedule before/after.
- Per study day: new cards studied + returning reviews completed.
- Stored locally with the deck in this notebook.
- Separate learner-profile memory follows Memory settings — `learner-memory.md`.

## Honest boundaries

- No user-facing card editor or scheduling controls currently claimed.
- No flashcard import/export flow currently claimed.
- No managed image/audio/video attachments.
- Exact return date depends on card history, rating, overdue time, daily limits, and timing variation. Never invent one.

## Related

- `practice.md` — Practice drawer + question sets
- `workspace.md` — right rail + Bench
- `learner-memory.md` — memory beyond the deck
- `trust.md` — local-first / permissions
