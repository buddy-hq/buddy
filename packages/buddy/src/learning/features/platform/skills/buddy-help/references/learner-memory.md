---
name: learner-memory
description: "Learner memory: opt-in store, remember/correct/forget, auto-extract, Settings."
---

# Learner Memory

Opt-in machine-local store of durable learner facts (preferences, misconceptions, project context). **Off by default.** Not full chat history. Not personalization profile. Not AGENTS.md (`instructions.md`).

## Defaults

- Master, notebook participation, and auto-extract: **off** until the user turns them on.
- One store per machine under Buddy’s local data — shared across notebooks; records may tag a notebook path.
- Auto-extract is delayed and limited — not every message.
- Never claim Buddy remembers everything or learns the whole transcript by default.

## Turn it on

1. **Settings → Learner Memory** → **Global learner memory** (master).
2. Optionally set **Default notebook participation** and **Default auto-extract**.
3. Per notebook: **Notebook settings** → **Learner memory** / **Auto-extract from chats** (Inherited or Override). Banner if master is off.
4. **Create notebook** dialog also has the same two switches; enabling memory at create may turn the global master on if it was off.

## How memory is used

| Path | What happens |
| --- | --- |
| Explicit user request | User asks to remember / correct / forget in chat when memory is on |
| When useful | Search prior learner facts only when they would materially help |
| Auto-extract | When master + notebook participation + auto-extract are on: idle chats can contribute durable facts (not every message) |

Only write or change memories for **explicit** user memory requests. Do not invent silent “I decided to remember this” writes; auto-extract handles background learning when enabled.

## Correct / forget (user language)

| User wants… | Effect |
| --- | --- |
| Remember a fact | Stored as a durable learner memory |
| Fix wrong text | Update that memory |
| Stop using a memory | **Forget** hides it (not permanently erased from disk) |
| Mark as wrong / close / pin | Status and priority changes via chat |

No product **memory browser** for end users. Manage via chat language + Settings toggles. Do not invent a Settings “wipe all” UI.

## Gotchas

- **Master off** → notebook memory controls disabled; auto-extract does not run.
- **Auto-extract ≠ every chat** — needs idle time, enough real user messages, and a usable model for extraction.
- **Forget ≠ erase disk forever** — hide; residual data may still exist on disk.
- **Shared store** — facts can influence other notebooks on the same machine.
- **Separate from** Settings personalization name/occupation and notebook Instructions.
- Extra tuning (models, limits) under **Settings → Learner Memory**; leave Auto unless the user cares.

