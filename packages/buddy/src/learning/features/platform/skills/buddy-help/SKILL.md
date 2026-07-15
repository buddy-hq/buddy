---
name: buddy-help
description: "Buddy app help: setup, workspace, notebooks, chat, library, settings, providers, trust; agent basics for newbies only."
---

# Buddy Help

Use when the user asks how Buddy works, how to install/setup/customize it, or where something lives in the app (Bench, notebooks, Settings, skills, providers, memory, permissions).

Not for subject teaching (math, history, code lessons as content). Use pedagogy skills for that. This skill is product help only — except `references/basics-of-agents.md` (general agent vocabulary; not Buddy UI).

## Rules

- Authority: only `references/` in this skill for product UI and product honesty. Never invent menus or UI.
- Prefer one reference per turn. Open a second only if the first cannot answer.
- Answer users in **UI nouns** (Settings, notebook, chat, Sources, Bench) for product questions.
- Do **not** restate tool names, parameters, or how tools work — those already live in the live tool list and system prompt. Name capabilities generically when needed (diagram tool, memory tools, whiteboard tools).
- Never tell yourself to “open the question dock” or “use the composer tool.” Chat (sidebar) ≈ session. Notebook (UI) ≈ workspace folder.
- Honesty: do not over-promise. See Defaults + `references/trust.md` + `references/learner-memory.md`.
- If a reference is empty or only frontmatter, say you lack packaged product copy; do not invent.
- **`references/basics-of-agents.md`**: general agent foundations (not product UI source of truth). Open **only** when the user is a complete newbie to agents or asks fundamental agent questions (what is an agent, tools, skills, MCP, subagents, session, context, providers, compaction, etc.). **Must bridge** foundations → how the concept shows up in Buddy (bridge map in that file); open a second product ref when they need UI steps or honesty defaults. Do **not** open for pure Buddy how-to alone (install, Settings path, “where is X”) — use product topic-map refs.

## Workflow

1. Classify the question with the topic map below.
2. `read` the matching `references/<file>.md` (path relative to this skill directory).
3. Answer short. Product questions → UI nouns + next step. Fundamentals → `basics-of-agents.md` then bridge to Buddy (second product ref if needed).
4. If marketing/site claims conflict with product truth, prefer `trust.md` honesty.

## Topic map

| User asks about… | Open |
| --- | --- |
| What is an agent / tools / skills / MCP / subagents / session / context / providers (complete newbie or fundamentals only) | `references/basics-of-agents.md` |
| Install, update, channels, download, won’t start, restart, logs, first launch, onboarding | `references/setup.md` |
| No account, privacy, local data, site claims, permission prompts, Allow once/always | `references/trust.md` |
| What Buddy can do, layout, sidebar, library rail, Bench docked/floating | `references/workspace.md` |
| Notebooks, Home, Inbox, Quick Chat, chats, pin/archive, branch, compact | `references/notebooks.md` |
| Chat box, slash, @, follow-ups, agent questions | `references/chat.md` |
| Sources, PDF/EPUB, Files, Boards, Creations | `references/library.md` |
| Flashcards, question sets, Practice | `references/practice.md` |
| Providers, API keys, ChatGPT login, models, usage | `references/providers.md` |
| Skills (right rail), MCP servers, Advanced Math / Standards packages | `references/extend.md` |
| Hand-edit MCP config, enable MCP via buddy.jsonc, notebook mcp override | `references/config-mcp.md` |
| AGENTS.md, instructions, personalization profile | `references/instructions.md` |
| Memory, “does Buddy remember me” | `references/learner-memory.md` |
| Settings tabs, theme, notifications | `references/settings.md` |

## Defaults

- Product is **local-first**, single-machine; no Buddy multi-user accounts.
- “No Buddy login” ≠ “no AI provider login.” Providers may need OAuth or API keys (`providers.md`, `trust.md`).
- **Allow always** on permissions = until Buddy restarts — not forever (`trust.md`).
- Not every action prompts. Do not say “approve every action” as absolute (`trust.md`).
- Memory: opt-in / off by default unless `learner-memory.md` says otherwise; never claim Buddy remembers everything by default.
- Notebook (UI) ≈ workspace folder. Chat (UI) ≈ session.

## User ↔ product map (not tool docs)

| User language | Product idea |
| --- | --- |
| notebook | workspace folder the user opened |
| chat | session in the sidebar |
| question UI / dock | structured agent question (not chat composer) |
| permission dock | allow once / always until restart / reject |
| Bench | main work area beside or under chat |
| Sources | reading catalog (PDF/EPUB) |
| Practice | flashcards and question sets |
| Boards | whiteboard catalog |
| Creations | widgets, diagrams, figures, media catalog |
| Skills | right-rail Skills drawer (Installed / Discover) |
| chat input / composer | user message entry (not a tool) |
| slash commands | user input |

## References

Deep copy lives under `references/`. Resolve paths relative to this skill directory. Do not bulk-load every file.
