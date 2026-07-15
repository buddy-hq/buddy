---
name: chat
description: "Buddy chat: composer, slash, @ files, follow-ups, question UI, task/skill cards."
---

# Chat

Use when the user asks about the chat box, slash commands, @ mentions, follow-ups while Buddy is busy, agent questions, Stop, or transcript cards.

Not for: chat history (`notebooks.md`), permission Allow once/always (`trust.md`), Bench layout (`workspace.md`), Practice quizzes (`practice.md`), Skills install/manage (`extend.md`).

## Dual language

| User language | Product idea |
| --- | --- |
| chat input / composer | where the user types messages |
| slash commands | user input (UI action, prompt rewrite, or session command) |
| @ file mention | file reference on the user message |
| question UI / dock | structured agent question mid-turn |
| Task / agent card | delegated helper task |
| Skill card | skill load mid-run |

Never call Practice MCQ UI the question dock.

## Composer

- Bottom of the conversation pane in a notebook chat.
- Type, attach files, optional sketch (images need a vision-capable model).
- **Enter** sends. **Shift+Enter** newline.
- While Buddy is working, primary control is **Stop** (aborts the run). Enter does **not** Stop — it steers or queues (below).
- Model / thinking pickers live on the composer toolbar.
- Hidden when a nested helper task is open. Continue from the parent chat.

## Follow-ups while busy

Settings → General → **Follow-up while Buddy is working**:

| Mode | Enter while busy |
| --- | --- |
| **Steer** (default) | Sends into the active run; follow-up dock may show “Steering” |
| **Queue for later** | Holds until the run finishes, then auto-sends |

Follow-up dock: Edit (restores draft), Send now.

## Slash commands

Type `/` at the **start** of the box for autocomplete. Mix of built-ins + entries from skills, MCP, or catalog.

**UI-only (no model turn when applied):**

| Command | Does |
| --- | --- |
| `/new` | New chat in this notebook |
| `/model` | Open model picker |
| `/mcp` | Settings → MCP |
| `/play` | Buddy Arcade |

**Session / message:**

| Command | Does |
| --- | --- |
| `/undo` | Undo last message (may put text back in composer) |
| `/redo` | Restore last undo |
| `/branch` (`/fork`) | Branch chat from latest user message |
| `/compact` (`/summarize`) | Compact session — needs selected model + active session |
| `/quiz [topic]` | Sends a quiz-create prompt (rewritten user message) |

Also: `/resources` and related for Sources ops when listed.

Other `/names` may appear from skills, MCP, or catalog — do not invent names not listed.

## Mentions and attachments

- **`@` + path** — file/folder search in the notebook; inserts a file reference.
- Drag/drop files into the composer to attach.
- **Do not claim @-agent mentions work** in current directory chat (file @ does).

## Agent questions (question UI)

Structured choices mid-turn appear in the **question UI** above the composer — not freeform in the composer for that interrupt.

- Options, multi-select when offered, “Type your own answer” (default unless disabled).
- Esc dismisses. Multi-question: tabs + Review + Submit.
- Transcript later shows a Questions card with answers.

**User help:** “answer in the question UI above the chat box.”

## Task and skill cards

- **Task / agent card**: a helper task ran; the main chat summarizes the result.
- **Skill card**: a skill was loaded mid-run. User-facing skill install/manage is right rail → Skills (`extend.md`).

## Transcript chrome (chat-adjacent)

- Undo / Branch on user messages (same idea as `/undo`, `/branch`).
- Jump to latest when scrolled up.
- Permission dock can appear above the composer — `trust.md` (Allow always = until Buddy restarts).
- Auto-compaction notice near context limit; manual `/compact` still available.

## Gotchas

- **“Question” collision.** Question UI ≠ Practice quizzes (`practice.md`).
- **Busy Enter ≠ Stop.** Steer or queue per setting; Stop aborts.
- **Images/sketch** need vision model or send is blocked.
- **`/compact`** fails without model or session.
- **Slash autocomplete** only while the draft is still a single `/token` with no space.
- **Nested helper task** has no composer.

## Related

- `notebooks.md` — chats, compact, branch
- `trust.md` — permission dock
- `extend.md` — Skills drawer (right rail)
- `practice.md` — flashcards, question sets
- `providers.md` — models, vision, connect
- `workspace.md` — docked/floating chat next to Bench
