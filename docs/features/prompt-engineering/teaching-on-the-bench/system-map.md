# System Map — how a Buddy turn is put together

This map covers only what the Teaching on the Bench effort needs: which persona runs, what the model receives on a turn, which feature owns which tool and skill, where each visual lands, and which layers we can change. It describes the `fix/visuals-prompt` working tree as of 2026-09-28. It is not a general architecture document. Update it when the branch changes this wiring, so later sessions don't have to trace the code again.

Evidence IDs (A1, H4, …) point into [research-ledger.md](research-ledger.md).

## 1. Personas are the mode switch

| Persona id | Shown to the user as | Prompt | Available in |
|---|---|---|---|
| `buddy` | "Learn with Buddy" | `personas/prompts/learning-companion.p.md` | Production |
| `teaching-buddy` | "Teach with Buddy" | `personas/prompts/teaching-assistant.p.md` | Production |
| `code` | "Code" | OpenCode's GPT system prompt plus `code-avatar.p.md` | Development builds only (`DEVELOPMENT_PERSONAS`) |

**How the switch works.**
- Onboarding asks "How would you like to use Buddy?" and offers Learn or Teach.
- Settings → Personalization → "Default way Buddy works" changes the answer later.
- The chosen *primary use* maps to the default persona (`personas/wiring/default-persona.ts`): `learn` → `buddy`, `teach` → `teaching-buddy`.
- The persona picker in the composer appears only in development builds (`web/.../prompt-composer.tsx:534`), and `/persona` is a hidden slash command.
- In production, then, the persona is a standing choice the user made, not something they change per chat.

**What this means.** A user in `buddy` has said they want to learn. A user in `teaching-buddy` has said they teach. Buddy does not need to detect learning intent: the persona has already declared it.

**What differs between personas.**

| | `buddy` | `teaching-buddy` | `code` |
|---|---|---|---|
| Persona prompt | Learning companion | Teaching assistant | OpenCode's coding prompt |
| Curriculum context attached | Yes | Yes | No |
| Progress context attached | Yes | No | No |
| Concise-response preference | Yes (user can turn it off) | Yes (user can turn it off) | Never |

**What is the same for all three.** All three use one feature list (`personas/shared-features.ts`). That means the same tools, the same skills, and the same feature prompts. All three run as OpenCode `build` agents, which have a shell and file tools. All three can delegate to `question-set-author`, `flashcard-author`, and `general`.

## 2. What the model receives on a turn

In order, following `learning/prompt/AGENTS.md`:

| # | Part | Owner | Contents | Changes |
|---|---|---|---|---|
| 1 | Persona prompt | Buddy | For `buddy` and `teaching-buddy`: <br>• *Constitution*: concision preference, shared constitution, "Show the idea" (visual guidance)<br>• *Product*: vocabulary, formatting, how to use skills<br>• *Teaching*: "Plan how you'll teach it", then the teaching principles | Fixed for the chat, so it can be cached. The concision paragraph is removed when the user turns concise responses off. |
| 2 | Environment | OpenCode | Model, date, working directory | Per session |
| 3 | Skills list | OpenCode | `<available_skills>`: name, description, and path of every allowed skill. The model has to call the `skill` tool to read one. | Per session |
| 4 | AGENTS.md instructions | OpenCode | Instruction files | Per session |
| 5 | `<buddy_runtime_context>` | Buddy | See the runtime context list below | Stable; frequently changing state is kept out of it |
| — | Tool list | OpenCode + Buddy | Each allowed tool's description and parameter schema. **This is where per-tool routing lives.** | Per session |
| 6 | Earlier turns | — | The conversation so far | — |
| 7 | `<system-reminder>` prelude | Buddy | See the prelude list below | Every turn, sent only when something changed |
| 8 | The user's message | — | — | — |

**`<buddy_runtime_context>` (row 5) contains:**
- `<feature_instructions>`: the Bench feature prompt, plus the memory prompt when memory is enabled.
- Model limits.
- Personalization: name, occupation, and "more about you".
- The calculator runtime. This names `python_calculator` and says to call it before any mathematical claim. It appears only when the math runtime is installed.
- The notes directory, the active resource, and the notebook's resources.

**The `<system-reminder>` prelude (row 7) contains:**
- Reading position and the current passage.
- **Bench turn context.** Present only when the Bench is open or parked. When the Bench is closed, Buddy is told nothing about it.
- Native attachments.
- Learner memory.
- A concision transition, when the setting changes mid-chat.
- Persona and turn transitions.

**Consequences for this effort:**
- A fresh chat starts with the Bench closed, so Buddy gets no Bench context on turn 1. Any first-turn default to show something or open the board has to come from the persona prompt, a feature prompt, or app code.
- The persona prompt and runtime context must stay stable, because of prompt caching (`prompt/AGENTS.md`). Anything that changes turn to turn belongs in the prelude.

## 3. Features: what each one owns

Only the features that matter for showing and teaching are listed. Feature files live in `packages/buddy/src/learning/features/*/feature.ts`.

| Feature | Tools | Skills | Feature prompt |
|---|---|---|---|
| `bench` | `bench_present`, `bench_read_context` | — | `bench-feature.p.md` (tabs, tab jobs, home tab, promotion, announcing) |
| `browser` | `inapp_browser_open` | — | — |
| `whiteboard` | `whiteboard_create_view`, `whiteboard_read_context` | `whiteboard-authoring` (about 7k words) | — |
| `diagrams` | `render_mermaid` | — | — |
| `figure-rendering` | `render_figure`, `render_freeform_figure` | — | — |
| `svg-rendering` | `render_svg` (writes a file) | — | — |
| `calculator` | `python_calculator` (needs the math runtime) | — | Through the runtime context |
| `html-widgets` | `present_html_widget` | `interactive-pages` | — |
| `image-generation` | `imagegen` | — | — |
| `media-presentations` | `present_media` | — | — |
| `reading` | `prepare_resource`, `ingest_full_text` | `reading`, `summarise` | — |
| `teaching-guidance` | `reflection` | `teaching-models`, `explanatory-drawing`, `find-and-show-resources`, `resolve-confusions`, `learning-design-frameworks`, `teaching-resource-authoring`, `teach-chemistry`, `align-teaching-topics-to-grade-level-and-age`, `find-indian-education-resources`, `fetch-indian-competition-papers` | — |
| `analogies` | — | `analogy` | — |
| `math` | — | `teach-mathematics` | — |
| `practice`, `assessment`, `question-sets`, `flashcards`, `curriculum` | Subagents | — | — |
| `memory` (experimental, opt-in) | `learner_memory_search`, `learner_memory_update` | — | `memory-feature.p.md` |
| `platform` | — | `buddy-help` | — |

**Other things to know:**
- OpenCode adds its own tools: `question`, `websearch`, `webfetch`, `codesearch`, shell, file tools, `task`, `skill`, and todos.
- The skills `learn`, `practice`, `assess`, `explain`, `worked-example`, and `compare-concepts` are in the repo but not registered.
- Which tools a session has also depends on the machine and config:
  - `python_calculator` and the standards tools need local runtimes.
  - Users can switch individual tools off (`config.tools`).

## 4. Where each visual lands

| Tool | Where it appears | Moving it to the Bench |
|---|---|---|
| `render_mermaid`, `render_figure`, `render_freeform_figure`, `python_calculator` plots, `imagegen`, `present_media`, question sets, flashcards | Inline in chat | `bench_present` `present_object` with the object id (A13) |
| `whiteboard_create_view` | The Bench, always. It auto-opens and takes focus, and it can replace a different visible tab (A15). | Already there |
| `present_html_widget` | An inline card. The `standard_16_10`, `wide_16_9`, and `tall_mobile` presets also auto-open on the Bench. | Depends on the preset |
| `bench_present` | The Bench: files, reading resources, objects, `focus_tab`, `close` | Explicit |
| `inapp_browser_open` | A new Browser tab on the Bench on every call. Buddy can't read the page or refocus the tab (A22). | Explicit |
| `render_svg` | A file on disk | — |

Users cannot turn auto-open off (`autoOpenSuppressed` is hard-coded to `false`, A15).

## 5. The layers we can change

| Layer | Applies to | When the model sees it | Good for | Limits |
|---|---|---|---|---|
| Persona prompt | One persona, every turn | Always, and cached | Identity, the teaching algorithm, and defaults that must apply before any tool or skill is chosen | Fixed for the chat. Names no tools (problem.md, principle 3). |
| Feature prompt | Sessions where the feature is enabled | Always, in the runtime context | Rules about one capability (the Bench's tabs) | Shared by every persona, so it must work for teaching and non-teaching use |
| Tool description | One tool | Always, in the tool list | When to use it and when not, where the result appears, what it returns, what the parameters mean | Weighed only when the model is already considering tools. Shared by every persona. |
| Skill | Loaded when the model asks for it | Only after the model decides to load it | Craft and long procedures | Costs a call and tokens. It is chosen after the routing judgment, and skipped when the model doesn't think it needs it (L). |
| Per-turn prelude | One turn | Always, on the current message | State that changes: the Bench, reading position, reminders | Must stay short and change-only |
| App code | — | — | Deterministic behaviour: auto-open, focus, defaults, which tools exist | A product change, not a prompt change |

## 6. Constraints any decision has to respect

- **Personas share features.** Tool descriptions, feature prompts, and skill descriptions are the same in every persona. Teaching judgment that only the learner persona should apply belongs in the persona prompt.
- **The model varies.** The user chooses the model. The first live failure (L) was GPT-6 Sol through a ChatGPT sign-in. OpenAI sign-in models receive the persona prompt as top-level `instructions`.
- **The tool set varies by machine and config** (see section 3).
- **Caching:** the persona prompt and runtime context stay stable. Anything that changes per turn goes in the prelude.
- **Known gaps:**
  - The Browser can't open pages Buddy authors.
  - There is no tool for finding images.
  - Buddy can't refocus Browser tabs.

  See problem.md, "Known issues".
