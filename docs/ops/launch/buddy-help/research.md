# Buddy Help — consolidated research

Single source for this launch lane. Supersedes prior fragments (candidates, term-checks, file-trees, taxonomies).  
**Related (kept separate):** `skill-style-guide.md` — how to *write* skills (agent-scripts corpus).  
**Launch home:** `docs/ops/launch/critical-path.md` → About Buddy Skill.

**Out of scope this product pass (archived, not in live skill tree):** personas / Code Buddy / Math Buddy / teaching workspace / checkpoints / “surfaces” as product vocab. See `pilot-archive/out-of-scope-code-buddy-personas/`. Live `overview.md` is product map only (no persona modes).

---

## 1. Goal

When users ask how Buddy works / how to customize it, the agent answers from **shipped product knowledge**, not invented UI.

**Pi pattern (corrected):** Pi does not ship an “about-pi” skill. It injects absolute paths to packaged `docs/` + `examples/` in the system prompt and says: read only when the user asks about Pi. Progressive disclosure via `read`.

**Buddy pattern (chosen):** One system skill `buddy-help` — `SKILL.md` router + flat `references/*.md`. Same *behavior* (on-demand product truth), skill-shaped for OpenCode/Buddy skill loading. Optional short always-on prompt index later if routing fails.

---

## 2. Shipping shape (ontology)

```text
Layer 0  name + description     (always routable)
Layer 1  SKILL.md              (router + topic map + honesty)
Layer 2  references/<topic>.md (one load unit)
```

No nested `pages/app/index.md` docs-site. No research at runtime.

Reference file names follow skill-style-guide naming: kebab-case, short trigger nouns, no eng slang (`runtime`, `chrome`), avoid long `*-and-*` compounds.

### Tree

```text
buddy-help/
├── SKILL.md
└── references/                 # flat
    ├── install.md
    ├── desktop.md
    ├── first-run.md
    ├── trust.md
    ├── approvals.md
    ├── learner-memory.md
    ├── providers.md
    ├── notebooks.md
    ├── sessions.md
    ├── layout.md
    ├── bench.md
    ├── chat.md
    ├── reading.md
    ├── practice.md
    ├── boards.md
    ├── creations.md
    ├── files.md
    ├── skills.md
    ├── instructions.md
    ├── mcp.md
    ├── packages.md
    ├── overview.md
    └── settings.md
```

**23 live references** (code-buddy archived). Optional symptom router can be a section in `SKILL.md`, not a 25th encyclopedia.

### Rename map (old → new)

| Old | New |
| --- | --- |
| install-and-updates | `install` |
| desktop-runtime | `desktop` |
| trust-and-privacy | `trust` |
| providers-and-models | `providers` |
| workspace-chrome | `layout` |
| conversation | `chat` |
| sources-and-reading | `reading` |
| instructions-and-profile | `instructions` |
| optional-runtimes | `packages` |
| product-map | `overview` |

Unchanged: `first-run`, `approvals`, `learner-memory`, `notebooks`, `sessions`, `bench`, `practice`, `boards`, `creations`, `files`, `skills`, `mcp`, `code-buddy`, `settings`.

### Frontmatter (routing)

```yaml
---
name: buddy-help
description: "Buddy app help: install, setup, notebooks, Bench, chat, skills, settings, providers."
---
```

### Author groups (not disk folders)

| Group | Refs |
| --- | --- |
| App software | install, desktop, first-run |
| Trust | trust, approvals, learner-memory |
| AI | providers |
| Containers | notebooks, sessions, layout, bench |
| Chat | chat |
| Library | reading, practice, boards, creations, files |
| Extend | skills, instructions, mcp, packages, settings |
| Personas | overview, code-buddy |

---

## 3. Dual-language rule (term audits)

Help text serves **two audiences**. Confusing them is the main failure mode.

| Audience | Vocabulary source | Examples |
| --- | --- | --- |
| **User** | UI / i18n / Settings labels | notebook, thread, composer, question dock, Sources, Settings |
| **Model** | prompts, tool ids, skill names | workspace, session, `question`, `task`, `bench_present`, `learner_memory_*` |

**Rules for every reference:**

1. User-facing answers use **UI nouns** so users recognize the product.
2. When describing agent behavior, use **model nouns / tool ids** (or dual phrase once).
3. Never teach the model “open the question dock” or “composer tool.”
4. Never invent tool names the runtime does not expose.
5. App install/update/desktop behavior is largely **UI-only** — the model does not already know it; the ref must *supply* it, not assume constitution knowledge.

---

## 4. Term audit — all 24 leaves

Verdict key: **match** = model already knows the core noun · **partial** = some model terms, heavy UI · **ui-supply** = model almost blind; help must teach · **dual** = must map UI ↔ model

| Reference | Verdict | Model-facing anchors | User / UI nouns | Help-skill wording stance |
| --- | --- | --- | --- | --- |
| **install** | ui-supply | “install” = skills/deps, not app binary | install app, channels, Beta/Dev, updates | Teach OS install/update; don’t claim model already knows channels |
| **desktop** | ui-supply | rare “desktop” (e.g. PDF); no deep-link/backend lexicon | Starting Buddy, restart, deep links, windows | Supply process facts; optional advanced |
| **first-run** | ui-supply | personalization fields may appear as runtime facts later | onboarding, setup steps | Document `/onboarding` flow; link providers + home |
| **trust** | partial | local/workspace locality, permission philosophy | no Buddy account, data locations, site honesty | Reconcile “no logins” vs provider OAuth; honesty required |
| **approvals** | dual | permission ask flow, tool permission language | Allow once / always until restart / reject | Map dock UI → permission replies; “always” ≠ forever |
| **learner-memory** | match+ui | `learner_memory_search`, `learner_memory_update`; ops remember/correct/forget/…; types preference/goal/… | Learner Memory settings, master switch, auto-extract | Prefer model ops names in agent sections; UI labels for settings |
| **providers** | partial | model selection, provider ids in runtime | ChatGPT OAuth, API keys, BYO, usage | Teach connect flow; model knows models mid-session more than OAuth |
| **notebooks** | dual | **workspace** dominant; rare “notebook” | notebook, Buddy Home, Inbox, Quick Chat | File name `notebooks.md`; body: “notebook (workspace folder)” |
| **sessions** | dual | **session**, fork/revert/compact language in APIs/tools | thread, pin, archive, unread, branch UI | “thread = session in the sidebar”; compact via `/compact` |
| **layout** | ui-supply | little layout vocabulary in prompts | left sidebar, rail drawers | Pure layout help; don’t invent model terms |
| **bench** | match | **Bench**, `bench_present`, `bench_read_context`, docked/floating in prompts | Bench, float chat | Use **Bench** (capital B); present/close language matches tools |
| **chat** | dual | chat/turn, `question`, `task`, `skill`, dynamic tool ids | composer, slash, mentions, steer/queue, docks, cards | Highest risk: question dock vs `question`; slash is user input |
| **reading** | match+ui | `prepare_resource`, `ingest_full_text`, skill `reading`, resource | Sources drawer | Dual: Sources UI + resource tools |
| **practice** | match+ui | `save_flashcard_deck`, `save_question_set`, surfaces flashcard/question-set | Practice drawer, SM-2 ratings | Don’t call MCQ UI “question dock” |
| **boards** | match+ui | whiteboard tools/skill, board session language | Boards drawer | Whiteboard/board = model; Boards = rail |
| **creations** | match+ui | `present_html_widget`, `render_mermaid`, figures, `present_media` | Creations drawer | Prefer tool/capability names; “Creations” is catalog chrome |
| **files** | partial | workspace paths, file tools, present_file | Files drawer, large-file dialog | Open policy is UI + policy package |
| **skills** | match | skill load via `skill` tool / `$SkillName` / available_skills | Skills library install UI | Keep skill name language; install flow is UI |
| **instructions** | partial | AGENTS / instructions injection patterns | Notebook Instructions, personalization form | AGENTS.md + preferred_name/occupation/about (profile section inside) |
| **mcp** | partial | MCP as tool source when connected | Settings → MCP | User: servers; model: tools appear |
| **packages** | partial | `python_calculator`, standards tools when enabled | Advanced settings install packages | Name packages for users; tools for agent |
| **settings** | ui-supply | almost no “Settings” in prompts | Settings tabs | Route users; don’t pretend model navigates Settings |
| **overview** | match | personas `buddy`, `code-buddy`, surfaces | Buddy / Code Buddy pickers | Only personas that exist in registry |
| **code-buddy** | match | `teaching_*` tools, editor surface, checkpoint/restore | teaching editor panel | Use tool/workflow names from lesson-workspace |

### High-risk mismatches (do not ship wrong)

| Bad phrasing in help/skill | Prefer |
| --- | --- |
| “Open the question dock” (to the model) | “Use the `question` tool; the user answers in the question UI” |
| notebook as if model’s primary noun | “notebook (the workspace folder the user opened)” |
| thread as model term | session; dual: “thread (session)” |
| Always-allow forever | until Buddy is restarted |
| Approve every action (absolute) | many tools pre-allow/deny via rules; dock is for ask |
| Math Buddy (unverified) | verify registry — term audits saw buddy + code-buddy |
| “composer” as agent surface | chat input (user); model receives messages |
| Creations/Sources as tool ids | drawer names + underlying tools |

### Core model tool/id glossary (non-exhaustive)

| Id / noun | Role |
| --- | --- |
| `bench_present`, `bench_read_context` | Bench |
| `question` | Structured user Q&A interrupt |
| `task` + subagent_type | Subagents |
| `skill` / skill names | Load skill body |
| `learner_memory_search`, `learner_memory_update` | Memory |
| `prepare_resource`, `ingest_full_text` | Reading |
| `save_flashcard_deck`, `save_question_set` | Practice artifacts |
| `whiteboard_*`, `present_html_widget`, `render_mermaid`, `present_media` | Visuals |
| `teaching_*` | Code Buddy lessons |
| workspace / session | Containers (model) |

---

## 5. Write order (priority, not extra files)

| Wave | References to fill first |
| --- | --- |
| **P0** | first-run, install, providers, trust, approvals, notebooks, layout, bench, chat (core), overview, learner-memory |
| **P1** | sessions, reading, practice, skills, instructions, settings, desktop (or fold process notes into install) |
| **P2** | boards, creations, files, mcp, packages, code-buddy |

Omit unwritten refs from the live topic map until content exists.

---

## 6. SKILL.md topic-map skeleton (use dual phrases)

Intent → file (draft lines for authors):

| User asks about… | Open |
| --- | --- |
| Install / update / channels | `install.md` |
| App won’t start / restart / deep links | `desktop.md` |
| First launch / onboarding | `first-run.md` |
| Account / privacy / local data / marketing claims | `trust.md` |
| Permission prompts / allow always | `approvals.md` |
| Memory / remember me | `learner-memory.md` |
| Providers / API keys / ChatGPT / models | `providers.md` |
| Notebooks / Home / Inbox | `notebooks.md` |
| Threads / history / compact / branch | `sessions.md` |
| Layout / library rail icons | `layout.md` |
| Bench / docked / floating | `bench.md` |
| Chat box / slash / follow-ups / agent questions | `chat.md` |
| PDF/EPUB / reading | `reading.md` |
| Flashcards / quizzes | `practice.md` |
| Whiteboard | `boards.md` |
| Widgets / diagrams / media | `creations.md` |
| Files explorer / large files | `files.md` |
| Skills library | `skills.md` |
| AGENTS.md / personalization | `instructions.md` |
| MCP | `mcp.md` |
| Math/standards packages | `packages.md` |
| What can Buddy do / personas | `overview.md` |
| Coding lessons | `code-buddy.md` |
| Settings tabs | `settings.md` |

---

## 7. Implementation checklist (later)

1. Author `buddy-help` skill (style: see `skill-style-guide.md`).
2. Wired as system skill under feature `platform`: `packages/buddy/src/learning/features/platform/skills/buddy-help/`.
3. Term-safe references: dual-language where audits say dual/ui-supply.
4. Golden questions: install, Bench, providers, memory honesty, allow-always-until-restart, notebook vs workspace.
5. Package with Electron backend resources / system installer fingerprint.
6. Do not load this research file at runtime.

---

## 8. Superseded / deleted fragments

Consolidated into this file and removed:

- `candidates/agent-1.md` … `agent-6.md` (raw discovery)
- `candidates/term-check-*.md` (8 audits)
- `file-tree.md`, `taxonomy.md`, `recategorization.md`, `merged-priority.md`, `ontology.md`
- Prior nested `pages/` proposals

**Kept next to this file:**

| Path | Role |
| --- | --- |
| `docs/ops/launch/buddy-help/research.md` | **This file** — plan, tree, term audit |
| `docs/ops/launch/buddy-help/skill-style-guide.md` | Writing craft for skills (separate on purpose) |

Discovery method (history): six folder-scoped agents (desktop-electron, web UI, web state, learning, buddy backend, adapter+site); term agents on model-facing `packages/buddy/src/learning/**`.
