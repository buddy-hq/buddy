# Learner Memory In Buddy

Buddy can remember useful learning context across chats and notebooks on your machine. The goal is not to profile you. The goal is to avoid starting from zero every time: what you are trying to learn, what keeps tripping you up, what teaching style helps, and what evidence Buddy has seen from real work.

## What Buddy Remembers

Buddy stores learner memory as small records with a title, explanation, type, confidence, strength, source pointers, and notebook/project metadata.

Typical memory types:

- Preferences: examples before theory, concise hints, visual explanations.
- Goals: what you are currently trying to learn or finish.
- Evidence: things you demonstrated in quizzes, flashcards, tasks, or real project work.
- Fragile skills: areas that need more practice.
- Misconceptions: incorrect models that were corrected or still need care.
- Open loops: unanswered questions or follow-up tasks.
- Project context: facts that matter only inside a notebook.

## How Memory Is Created

Memory can be created in three ways:

- Explicitly: you ask Buddy to remember, forget, correct, pin, or reject something.
- Deterministically: Buddy records evidence from learning artifacts such as question-set attempts, flashcard reviews, and task checkpoints.
- Automatically: if enabled for a notebook, Buddy can scan a real chat after the turn finishes and extract candidate memories using a small model from your connected provider.

Automatic extraction is not run on every message. Buddy first checks whether the session has enough learning signal: enough user messages, enough session span or active burst, assistant effort, tool use, or learning artifacts. Shallow chats are skipped.

## How Buddy Uses Memory

Buddy gets a small learner context only when it changes. This keeps prompt caching safe and avoids re-sending the same dynamic context every turn.

During a chat, Buddy can also call `learner_memory_search` when deeper recall would materially improve the answer. Search results include ranking reasons such as text match, notebook scope, memory strength, recency, pinned status, stale penalties, and evidence strength.

Passive delivery does not strengthen memory. A memory strengthens only when it is actively used, explicitly pinned, or reinforced by evidence.

## Notebook Controls

Open learner memory settings to configure memory.

- Notebook controls: turn memory delivery/search and auto-extraction on or off for the current notebook.
- Global model defaults: choose extraction and consolidation models once for the machine.
- Global extraction tuning: set attention gates, delays, call caps, retention, and search limits once for the machine.

## Inspecting And Correcting Memory

The notebook settings panel shows learner memory records, their scope, source IDs, and quick controls. You can pin, hide, or delete records there.

In development builds, Buddy DevTools has a Memory tab. It shows recent records, search scoring for a query, records linked to the current session, and a manual "Extract Session" action for testing real-session extraction.

If Buddy remembers something wrong, correct it directly. Learner corrections override inferred model extraction.

## Where Memory Lives

Memory is local to your machine under Buddy's global home:

```text
~/.buddy/learner-memory/
```

Buddy keeps two file-first memory lanes:

- `MEMORY.md`: read-only consolidated base memory written by the background consolidator.
- `summary.md`: compact read-path summary written by the background consolidator.
- `working-memory.md`: editable working memory for explicit learner corrections, deterministic learning evidence, and chat-time memory CRUD.
- `working-summary.md`: compact summary generated from `working-memory.md`.
- `events/*.jsonl`: memory events and audit trail.
- `evidence/*.json`: deterministic learning evidence.
- `session-summaries/*`: summaries of session extraction.

Generated state can be rebuilt:

- `index.sqlite`

Buddy does not parse or rewrite consolidated base memory for chat-time CRUD. The UI and memory tools edit the working lane; the background consolidator can later fold selected working/session evidence into the base lane.
