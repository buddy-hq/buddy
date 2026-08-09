---
name: practice
description: "Buddy Practice drawer and question sets: find, create, open, answer, retry."
---

# Practice

Use when the user asks about the Practice drawer, quizzes, question sets, or where practice objects appear.

Flashcard scheduling / ratings → `flashcards.md`. Not the chat **question UI** (structured mid-turn Q&A) — `chat.md`.

## Defaults

- **Practice** = right-rail drawer: flashcard decks + question sets in this notebook.
- Rows mix both types, newest activity first.
- Flashcard row: deck name + card count + **Study N** or next return time.
- Question-set row: title + question count + **Start**.

## Open Practice

1. Right workspace rail → **Practice**.
2. Header badge = total flashcards due now.
3. Click a flashcard deck name → deck view on Bench. Click **Study N** → scheduled study.
4. Click a question set or **Start** → question set on Bench.

Empty: “No practice yet” — ask Buddy to create flashcards or a question set.

## Create

| Path | What happens |
| --- | --- |
| Ask in chat | Buddy authors flashcards or a question set when available |
| `/flashcard` [topic] | Create a flashcard deck |
| `/quiz` [topic] | Create a question set |

After save: object lands in Practice; chat may also show an open/review action. Save may prompt permissions — `trust.md`.

Flashcard types: basic (front/back) or cloze. Full flow → `flashcards.md`.

## Question sets (quizzes)

1. Answer in chat inline card or Bench.
2. Submit → score; explanations after grade.
3. Supports multi-select, optional none-of-the-above, optional shuffle.
4. Retry starts a fresh attempt.

UI nouns: question set / quiz. **Never** call this UI “question dock.”

## Gotchas

- Practice header due total counts flashcards, not unanswered quiz questions.
- Flashcard **Study N** starts scheduled study. Deck-name click opens the deck first.
- Thin chat with no learnable material → authoring should refuse empty decks.
- Practice items are local notebook objects. No practice import/export flow claimed.
- MCQ UI ≠ question UI.

## Related

- `flashcards.md`, `workspace.md`, `chat.md`, `library.md`, `trust.md`
