---
name: learner-memory
description: "Memory: opt-in store, remember/correct/forget, auto-extract, Settings."
---

# Memory

Opt-in machine-local store of durable learner facts (preferences, misconceptions, project context). **Off by default.** Not full chat history. Not personalization profile. Not AGENTS.md (`instructions.md`).

## Defaults

- The Memory experiment is **off** until the user opts in.
- Notebook participation and auto-extract default to off until the user enables them.
- One store per machine under Buddy’s local data — shared across notebooks; records may tag a notebook path.
- Auto-extract is delayed and limited — not every message.
- Never claim Buddy remembers everything or learns the whole transcript by default.

## Turn it on

1. **Settings → Advanced → Experimental features** → enable **Memory**.
2. **Settings → Memory** → optionally set **Default notebook participation** and **Default auto-extract**.
3. Per notebook: **Notebook settings** → **Memory** / **Auto-extract from chats**.
4. The **Create notebook** dialog shows the same two switches while the experiment is enabled.

## How memory is used

| Path | What happens |
| --- | --- |
| Explicit user request | User asks to remember / correct / forget in chat when memory is on |
| When useful | Search prior learner facts only when they would materially help |
| Auto-extract | When the experiment + notebook participation + auto-extract are on: idle chats can contribute durable facts (not every message) |

Only write or change memories for **explicit** user memory requests. Do not invent silent “I decided to remember this” writes; auto-extract handles background learning when enabled.

## Correct / forget (user language)

| User wants… | Effect |
| --- | --- |
| Remember a fact | Stored as a durable memory |
| Fix wrong text | Update that memory |
| Stop using a memory | **Forget** hides it (not permanently erased from disk) |
| Mark as wrong / close / pin | Status and priority changes via chat |

No product **memory browser** for end users. Manage via chat language + Settings toggles. Do not invent a Settings “wipe all” UI.

## Gotchas

- **Experiment off** → memory UI is hidden; memory tools, extraction, and new memory writes do not run. Existing local data is kept.
- **Auto-extract ≠ every chat** — needs idle time, enough real user messages, and a usable model for extraction.
- **Forget ≠ erase disk forever** — hide; residual data may still exist on disk.
- **Shared store** — facts can influence other notebooks on the same machine.
- **Separate from** Settings personalization name/occupation and notebook Instructions.
- Extra tuning (models, limits) under **Settings → Memory**; leave Auto unless the user cares.
