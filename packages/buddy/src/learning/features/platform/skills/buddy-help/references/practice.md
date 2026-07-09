---
name: practice
description: "Buddy Practice: flashcards, question sets, SM-2 review, /flashcard, /quiz."
---

# Practice

Use when the user asks about flashcards, quizzes, question sets, Practice drawer, SM-2 ratings, or how practice objects show up.

Not the chat **question UI** (structured mid-turn Q&A) — see `chat.md`.

## Defaults

- **Practice** = right-rail drawer: flashcard decks + question sets for this notebook.
- Create via chat, `/flashcard`, or `/quiz`. Open/review via Practice drawer or Bench.
- Flashcards: spaced review (Again / Hard / Good / Easy). Question sets: MCQ; graded on submit.

## Open Practice

1. Right workspace rail → **Practice**.
2. **Ready to review**: total cards due; **Start** opens first deck with due cards on Bench (disabled if none).
3. Filters: **All** | **Cards** | **Questions**. Search practice…
4. Click a deck → Bench flashcard review. Click a set → Bench question set.

Empty: “No practice yet” — ask Buddy to create flashcards or a question set.

## Create

| Path | What happens |
| --- | --- |
| Ask in chat | Buddy authors flashcards or a quiz when available |
| `/flashcard` [topic] | Flashcard authoring prompt |
| `/quiz` [topic] | Quiz-create prompt |

After save: chat may show a deck card (**Review**) or an inline quiz. Objects also land in Practice. Save may prompt permissions — `trust.md`.

**Card types (product):** basic (front/back) or cloze. One idea per card.

## Review flashcards

1. Practice → deck, chat **Review**, or Bench object.
2. Front → **Tap to reveal** → rate: **Again** / **Hard** / **Good** / **Easy**.
3. Scheduler queues learning → review → new (daily caps). Due badges: new / learning / review.
4. **No cards due** / **All done for now** when empty. Leech warning after many lapses — attention only, not auto-delete.

No user Settings knobs found for SM-2 parameters.

## Question sets (quizzes)

1. Answer in chat inline card or Bench.
2. Submit → score; explanations after grade.
3. Supports multi-select, optional none-of-the-above, optional shuffle.
4. Retry starts a fresh attempt.

UI: question set / quiz / Questions filter. **Never** call this UI “question dock.”

## Gotchas

- **Start** in Practice only starts a due **deck**, not a question set.
- Thin chat with no learnable material → authoring should refuse empty decks.
- Daily limits can leave cards in a deck but not due today.
- Practice items are local notebook objects. No Anki import/export claimed.
- MCQ UI ≠ question UI.

## Related

- `workspace.md`, `chat.md`, `library.md`, `workspace.md`, `trust.md`
