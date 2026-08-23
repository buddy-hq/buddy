# Tool Rendering Audit

> **Status**: Proposal v5 — ability categories + foundation fixes  
> **Purpose**: Audit tool rendering in Buddy. Define a coherent product design with five ability categories, a shared motion language, and foundation state primitives. Fix cross-cutting bugs. Make each category of interaction feel intentional.

---

## Checklist

- [x] Explore codebase and identify all tool renderers
- [x] Read every renderer file
- [x] Document each tool (see Tool-by-Tool Audit)
- [x] Identify cross-tool inconsistencies (see Current Tool System)
- [x] Propose new system (see Proposed System)

---

## Architecture Overview

```
MessagePart (type="tool")
  └─ AssistantPartRenderer
       └─ ToolPartCard
            ├─ parseToolState()      → normalises part into ToolState
            ├─ getToolInfo()         → derives ToolInfo (title/subtitle/summary/args)
            ├─ isBuddyCustomTool()   → routes prefixed tools to BuddyCustomTool
            ├─ getToolRenderer()     → looks up registered renderer in registry
            └─ renderGenericTool()   → fallback
```

### Shared State Model

```ts
type ToolStatus = "pending" | "running" | "completed" | "error"

interface ToolState {
  status: ToolStatus
  input: Record<string, unknown>
  metadata: Record<string, unknown>
  attachments: ToolAttachment[]
  start?: number
  end?: number
  output?: string
  error?: string
  title?: string
}
```

Four statuses exist: `pending`, `running`, `completed`, `error`.

### Shared Primitives (existing)

| Component | File | Role |
|---|---|---|
| `BasicTool` | `basic-tool.tsx` | Collapsible row: title + subtitle + args + status badge + chevron |
| `ToolStatusBadge` | `tool-header.tsx` | Animated dot: hidden while running, appears on complete/error |
| `ToolOutputPanel` | `tool-output-panel.tsx` | Scrollable `<pre>` box with copy button; red on error |
| `ToolAttachmentGallery` | `tool-attachments.tsx` | Image thumbnails + file links |
| `MermaidToolCard` | `render/mermaid/mermaid-tool-card.tsx` | Custom card shell with dot-grid bg |
| `QuestionSetToolCard` | `render/question-set/question-set-tool-card.tsx` | Custom card shell with title/subtitle/status header |

---

## Tool-by-Tool Audit

### 1. `read`

**File**: `render/read.tsx`  
**Shell**: `BasicTool` with `hideDetails=true` (always expanded)

| State | What renders |
|---|---|
| `pending` / `running` | Title pulses. No content. |
| `completed` | List of loaded filenames (from `metadata.loaded[]`). No collapse chevron. |
| `error` | `ToolOutputPanel` with error text (red). Auto-expands via `BasicTool` effect. |

**Notes**:
- Uses `hideDetails` so the file list is always visible, never behind a click — correct for a "what did I read" summary.
- `completed` with no loaded files shows nothing below the title row — silent success with no signal.
- Status badge appears on complete/error but is hidden while running/pending.

---

### 2. `list` / `glob` / `grep`

**File**: `render/search.tsx`  
**Shell**: `BasicTool` (collapsible, default closed unless `defaultOpen`)

| State | What renders |
|---|---|
| `pending` / `running` | Title pulses. No content area shown. |
| `completed` | Markdown-rendered output inside a bordered card. |
| `error` | Markdown-rendered error text (same box, no special styling). |

**Notes**:
- Error is shown in the same Markdown box as success — no visual distinction between error and success output.
- `ToolOutputPanel` (with red styling) is **not used** here; instead a neutral `<div>` with `Markdown` is used. Error output can look identical to normal output.
- No "no results" empty state — a `completed` with empty output shows nothing.

---

### 3. `edit` / `write`

**File**: `render/edit.tsx`  
**Shell**: `BasicTool` (collapsible)

| State | What renders |
|---|---|
| `pending` / `running` | Title pulses. No content. |
| `completed` — with diff | Before/after side-by-side `<pre>` panels (max-h-60). |
| `completed` — write mode | Single `<pre>` with write content (different background: `bg-background-base` vs `bg-surface-weak/40`). |
| `completed` — with diagnostics | `DiagnosticList` for LSP errors (severity === 1, max 3). |
| `completed` + output | `ToolOutputPanel` (error case auto-opened). |
| `error` | `ToolOutputPanel` (red). Auto-expands. |

**Notes**:
- Two `<pre>` background tokens used: `bg-surface-weak/40` (before/after panels) vs `bg-background-base` (write content). Inconsistency within the same tool.
- Before/after panels have a "Before"/"After" label — the only tool with explicit section labels.
- `DiagnosticList` is unique to this renderer.
- No loading/skeleton state while edit is running.

---

### 4. `apply_patch`

**File**: `render/apply-patch.tsx`  
**Shell**: `BasicTool` (collapsible; `hideDetails=true` while running)

| State | What renders |
|---|---|
| `pending` | Title pulses. A `trailing` animated text label: "Preparing patch...". Output panel with the pending message. |
| `running` | Title pulses. A `trailing` animated text label: "Applying patch...". Output panel with the running message. `hideDetails=true` so content is always visible. |
| `completed` | List of `ApplyPatchFileItem` per-file collapsibles with before/after diff and +/- stats. |
| `error` | `ToolOutputPanel` (red). Auto-expands. |

**Notes**:
- Only tool that shows meaningful in-progress status messages ("Preparing patch..." / "Applying patch...") via `trailing` slot in header.
- `hideDetails` switches from `true` (running) to `false` (done) — the transition from "always visible" to "collapsible" on completion is unique.
- `ApplyPatchFileItem` uses its own nested collapsible — two levels of collapsing.

---

### 5. `bash`

**File**: `render/bash.tsx`  
**Shell**: `BasicTool` (collapsible)

| State | What renders |
|---|---|
| `pending` / `running` | Title pulses. No content. The shell command is shown as subtitle (if available). |
| `completed` — with output | `ToolOutputPanel` showing `$ command\n\noutput`. |
| `completed` — no output | Tiny text: "No output". |
| `error` | `ToolOutputPanel` (red). Auto-expands. |

**Notes**:
- Shell command is shown in the subtitle even before completion — the only tool that exposes input in the header before completion.
- `defaultOpen` is forwarded from parent so some contexts auto-open it.
- "No output" text is `text-xs text-text-weak` — very subtle, easy to miss.

---

### 6. `webfetch`

**File**: `render/webfetch.tsx`  
**Shell**: `BasicTool` with `hideDetails=true` (always expanded)

| State | What renders |
|---|---|
| `pending` / `running` | Title pulses. No link shown yet (URL from `state.input.url`). |
| `completed` | Clickable URL link (`<a>` tag). No summary of content. |
| `error` | Nothing below title (no error output shown!). |

**Notes**:
- **Error state shows nothing** — unique among all tools. This is a gap.
- Shows the URL from input immediately (since it reads `state.input.url`), but this is already available in `info.subtitle` too, so both the trigger subtitle and the body link show the same URL.
- URL appears twice: once as `info.subtitle` in the trigger, once as a clickable `<a>` in the body.

---

### 7. `websearch` / `codesearch`

**File**: `render/exa-search.tsx`  
**Shell**: `BasicTool` (collapsible)

| State | What renders |
|---|---|
| `pending` / `running` | Title pulses. No content. |
| `completed` | List of extracted URLs as clickable links. |
| `error` | `ToolOutputPanel` (red). |
| `completed` — no URLs found | Nothing (silent empty state). |

**Notes**:
- URL extraction uses regex on raw output string — fragile, not structured data.
- No distinction between "0 results" and "error" in the visual result.
- No count of results shown (unlike knowledge-graph tools that show counts with badges).

---

### 8. `task` (generic)

**File**: `render/task.tsx` → `TaskToolCard`  
**Shell**: Custom `motion.div` card (no `BasicTool`)

| State | What renders |
|---|---|
| `pending` / `running` | Card with shimmer gradient animation + spinning `LoaderCircleIcon`. Title shows "Running {agent}...". |
| `completed` | Card with "Used {agent}" text. If child session exists, title is a clickable link. |
| `error` | Card + animated `ToolOutputPanel` (red) expanding below. |

**Notes**:
- Completely different shell from all other tools — a standalone `motion.div` card.
- Uses `y: 4 → 0` entry animation — the only standard tool to do this.
- Running state: shimmer gradient (`bg-gradient-to-r`) is unique to this tool.
- Verb shifts: "Running X" → "Used X" on completion.
- No collapse toggle — content is always visible.
- Interactive: if child session exists, the whole card is a `motion.button`.

---

### 9. `task` (flashcard-author subtype)

**File**: `render/task.tsx` → `FlashcardAuthorTaskCard`  
**Shell**: Custom `motion.div` card with `AnimatePresence` sections

| State | What renders |
|---|---|
| `pending` / `running` | Same header as generic task. No body section (body only renders on `completed`). |
| `completed` — loading decks | "Loading generated flashcard deck..." loading text. |
| `completed` — decks found | `FlashcardDeckTaskPreview` items — each shows title, card count, and if review available: a "Review" button. |
| `completed` — no decks + has output | `ToolOutputPanel` fallback. |
| `error` | `ToolOutputPanel` (red). |

**Notes**:
- Fetches generated flashcard artifacts from `/api/artifacts?kind=flashcard-deck` on completion.
- Body uses `AnimatePresence mode="wait"` for transitions.
- "Loading generated flashcard deck..." text is not i18n'd (hardcoded string).
- `FlashcardReviewDialog` is launched inline from this renderer — a modal triggered by tool card.

---

### 10. `task` (question-set-author subtype)

**File**: `render/task.tsx` → `QuestionSetAuthorTaskCard`  
**Shell**: Same custom `motion.div` card as flashcard variant

| State | What renders |
|---|---|
| `pending` / `running` | Same header with spinner. No body. |
| `completed` — loading artifacts | "Loading generated question set..." text. |
| `completed` — artifacts found | `QuestionSetArtifactTaskPreview` items — title, type, count, "Open" button. |
| `completed` — no artifacts + has output | `ToolOutputPanel` fallback. |
| `error` | `ToolOutputPanel` (red). |

**Notes**:
- Clicking "Open" opens the right sidebar panel with the question set.
- "Loading generated question set..." is also hardcoded (not i18n'd).
- Structurally identical to flashcard variant, just different data source.

---

### 11. `skill`

**File**: `render/skill.tsx`  
**Shell**: `BasicTool` (collapsible, `defaultOpen=false`)

| State | What renders |
|---|---|
| `pending` / `running` | Title pulses. No content. |
| `completed` | `Badge` with skill name + `ToolOutputPanel` with parsed skill content (strips `<skill_content>` tags). |
| `error` | `ToolOutputPanel` (red). |

**Notes**:
- `defaultOpen=false` hard-coded — skill content is never auto-opened.
- Skill content is shown in `ToolOutputPanel` which styles it like raw output text — not rendered as markdown despite being structured content.
- Badge duplicates the subtitle in the trigger row.

---

### 12. `render_figure` / `render_freeform_figure`

**File**: `render/render-figure.tsx`  
**Shell**: `BasicTool` with `hideDetails=true` (always expanded)

| State | What renders |
|---|---|
| `pending` / `running` | Title pulses. No image. |
| `completed` — parsed output | `<figure>` with `<img>`, caption, copy URL action, repair attempt count. |
| `completed` — no parsed output | Nothing below title row (silent success). |
| `error` | `ToolOutputPanel` (red). |

**Notes**:
- "Rendered automatically" / "Repaired N time(s)" metadata shown — only tool exposing repair attempt info.
- No loading skeleton while image loads after `lazy` load.
- `<figure>` is the only usage of semantic `<figure>` in all tool renderers.

---

### 13. `render_mermaid`

**File**: `render/mermaid/index.tsx`  
**Shell**: Custom `MermaidToolCard` (no `BasicTool`)

| State | What renders |
|---|---|
| `pending` / `running` | `MermaidToolCard` with animated skeleton (pulse dot + line/block shimmer). |
| `completed` — source available | `MermaidDiagram` (live-rendered SVG) inside `MermaidToolCard`, with action bar (copy/download/fullscreen). |
| `completed` — rehydrating (no source yet) | `MermaidToolCard` + "Rehydrating diagram..." text. |
| `completed` — source unavailable | `MermaidToolCard` + "Mermaid source unavailable" error text (critical red bg). |
| `completed` — rehydration error | `MermaidToolCard` + error text. |
| `completed` — repair log | Repair log text shown below diagram. |
| `error` | `MermaidToolCard` + `ToolOutputPanel` (red). |

**Notes**:
- Most complex renderer: has its own module directory with 11 files.
- Unique features: fullscreen dialog, copy/download actions, auto-fix feedback button.
- Loading skeleton is bespoke and detailed — unique among all tools.
- Dot-grid background on the diagram canvas is unique to Mermaid.
- `hideStatus=true` when source is available (status dot hidden) — relies on action bar instead.
- The `MermaidToolCard` is a completely different visual paradigm from `BasicTool`: horizontal header bar with type badge, title, actions — not a collapsible row.

---

### 14. `render_saved_question_set`

**File**: `render/question-set/saved-question-set-tool.tsx`  
**Shell**: Custom `QuestionSetToolCard` (no `BasicTool`)

| State | What renders |
|---|---|
| `pending` / `running` | `QuestionSetToolCard` + "Preparing question set..." text. |
| `completed` — artifact loaded | `QuestionSetToolCard` + full interactive `QuestionSetInlineView`. |
| `completed` — loading artifact | `QuestionSetToolCard` + "Loading question set..." text. |
| `completed` — no parsed output | `QuestionSetToolCard` + optional `ToolOutputPanel`. |
| `error` | `QuestionSetToolCard` + optional `ToolOutputPanel` + inline error paragraph (custom red styling, NOT via `ToolOutputPanel`). |

**Notes**:
- Error paragraph uses custom inline `<p>` styling (`border-border-critical-base/40 bg-surface-critical-base/10`) — not `ToolOutputPanel`. Diverges from all other tools.
- "Preparing question set..." / "Loading question set..." are hardcoded strings, not i18n'd.
- `QuestionSetToolCard` visual matches `MermaidToolCard` structure (card with top header bar) but has no dot-grid bg and no actions bar.
- Interactive inline quiz embedded directly in the chat — highest complexity of any tool from user interaction standpoint.

---

### 15. `question`

**File**: `render/question.tsx`  
**Shell**: `BasicTool` (collapsible; auto-opens if answers exist)

| State | What renders |
|---|---|
| `pending` / `running` | Title pulses. No content. |
| `completed` — with answers | Q+A pairs in bordered cards (question text + answer text). |
| `completed` — no answers yet | Nothing (waiting for answers). |
| `error` | `ToolOutputPanel`. |

**Notes**:
- `defaultOpen` set to `true` when answers exist — one of the few auto-open states based on data content.
- Q+A card uses `rounded-md border border-border-base bg-background-base p-2` — same pattern as other tools' output boxes, but this is semantically different (it's structured content, not raw text).
- Subtitle cleverly switches: "1 question" → "1 answered" based on whether answers exist.

---

### 16. Knowledge Graph tools
(`search_standards`, `get_standard`, `get_learning_components`, `get_prerequisites`, `get_next_standards`, `get_crosswalk`, `query_standards_sql`)

**File**: `render/knowledge-graph.tsx`  
**Shell**: `BasicTool` (collapsible)

| State | What renders |
|---|---|
| `pending` / `running` | `BasicTool` row + body with per-tool "Loading..." label text. |
| `completed` — parsed | Structured `KnowledgeGraphBody` with `KnowledgeGraphSection` panels + `StandardCard` components. |
| `completed` — unparsed | `ToolOutputPanel` (raw text fallback). |
| `error` | `ToolOutputPanel` (red). |

**Notes**:
- Only tool group that shows a running-state label inside the body (e.g. "Searching standards...").
- Most visually rich structured output of any tool: nested sections, badges, counts, standard cards.
- `defaultOpen` defaults to `state.status === "error"` — won't auto-open on success.
- Badge counts inside sections (e.g., "4" matches) use `Badge` from `@buddy/ui`.

---

### 17. `python_calculator`

**File**: `render/python-calculator.tsx`  
**Shell**: `BasicTool` (collapsible, `defaultOpen` based on status)

| State | What renders |
|---|---|
| `pending` | Collapsed. No content. |
| `running` | `BasicTool` with `defaultOpen=true`. `ToolOutputPanel` starts showing output as it streams. |
| `completed` — with output | `ToolOutputPanel`. |
| `completed` — no output + value | `<pre>` with JSON value. |
| `completed` — with attachments | `ToolAttachmentGallery` (images/files). |
| `error` | `ToolOutputPanel` (red). |

**Notes**:
- `defaultOpen={defaultOpen ?? state.status !== "pending"}` — auto-opens on running/completed/error.
- `<pre>` for JSON value uses `border-border-base bg-background-base` — slightly different style from `ToolOutputPanel`'s `bg-background-base px-3 py-2`.

---

### 18. Buddy Custom tools
(`pedagogy_resource_ingest_full_text`, `learner_snapshot_read`, all `teaching_*` / `goal_*` / `learner_*` / `curriculum_*` / `pedagogy_*` prefix tools)

**File**: `render/buddy-custom.tsx`  
**Shell**: `BasicTool` (collapsible)

| State | What renders |
|---|---|
| `pending` | Collapsed (for `learner_snapshot_read`). For others: auto-opens. |
| `running` / `completed` | Title (title-cased tool name) + optional `Badge` with artifact type + `ToolOutputPanel` with output + optional JSON value `<pre>` + `ToolAttachmentGallery`. |
| `error` | `ToolOutputPanel` (red). |

**Special case: `pedagogy_resource_ingest_full_text`**:
- `hideDetails=true` (always expanded).
- Shows token count text.
- Error-only output panel.

**Notes**:
- `titleFromToolName` converts `snake_case` to "Title Case" — no custom labels.
- `defaultOpen` logic: `learner_snapshot_read` defaults to `false`, all others default to `state.status !== "pending"`.
- Badge shows raw `artifact` string from metadata — no label mapping.
- JSON value shown in `<pre>` with `bg-background-base` background — consistent with `python_calculator`.

---

### 19. Generic / Fallback

**File**: `render/generic.tsx`  
**Shell**: `BasicTool` with `hideDetails=true` (always expanded)

| State | What renders |
|---|---|
| `pending` / `running` | Title pulses. Nothing else. |
| `completed` | Nothing (no output shown for completed state). |
| `error` | `ToolOutputPanel` (red). |

**Notes**:
- **Completed state shows nothing at all** — silent success.
- Error-only output display.
- Used for all unregistered tools.

---

### 20. Hidden tools (`todowrite`, `todoread`)

Registered with `render: () => null`. Render nothing. No visual state at all.

---

---

## Current Tool System: Inconsistencies

### I-1: Three competing shell primitives

Tools use three different shells with no consistent criteria for choosing one:

| Shell | Used by |
|---|---|
| `BasicTool` (collapsible row) | `read`, `bash`, `edit`, `write`, `apply_patch`, `search`, `webfetch`, `exa-search`, `skill`, `render_figure`, `knowledge-graph`, `question`, `python_calculator`, buddy-custom, generic |
| `MermaidToolCard` (card with header bar) | `render_mermaid` |
| `QuestionSetToolCard` (card with header bar) | `render_saved_question_set` |
| Custom `motion.div` card | `task`, `task:flashcard-author`, `task:question-set-author` |

`MermaidToolCard` and `QuestionSetToolCard` share nearly identical visual structure (rounded card, top header bar with title/subtitle/status) but were built independently. They are not composed from the same primitive.

---

### I-2: Inconsistent `defaultOpen` behavior

| Tool | Default open logic |
|---|---|
| `read` | Always expanded (`hideDetails=true`) |
| `bash` | Forwarded from parent |
| `edit` | Forwarded from parent |
| `apply_patch` | Always expanded while running; forwarded when done |
| `search` | Forwarded from parent |
| `webfetch` | Always expanded (`hideDetails=true`) |
| `exa-search` | Forwarded from parent |
| `render_figure` | Always expanded (`hideDetails=true`) |
| `skill` | Always closed (`defaultOpen=false`) |
| `knowledge-graph` | Closed except on error |
| `question` | Closed, but opens when answers exist |
| `python_calculator` | Open unless pending |
| `buddy-custom` | Open unless pending (varies by tool name) |
| `generic` | Always expanded (`hideDetails=true`) |
| `task` | No collapse (card, always visible) |
| `mermaid` | No collapse (card, always visible) |
| `question-set` | No collapse (card, always visible) |

There is no coherent rule. "Always expanded," "forwarded from parent," "open by default," "closed by default," and "open on error" are all used inconsistently.

---

### I-3: Running state has no visual affordance in most tools

When `status === "running"`, the only signal in `BasicTool`-based tools is:
- The title pulses via `animate-pulse`.
- The status badge is hidden (invisible).

No spinner, no skeleton, no progress indicator. This is sparse for longer-running operations. Compare to:
- `task`: shimmer gradient + spinning `LoaderCircleIcon`.
- `render_mermaid`: full skeleton (pulse dot + line/block shimmer).
- `render_saved_question_set`: "Preparing question set..." text.
- `apply_patch`: "Preparing patch..." / "Applying patch..." text in header.
- `knowledge-graph`: per-tool running label in body.

Six tools have meaningful running-state feedback; twelve have only a pulsing title.

---

### I-4: Error state handling is inconsistent

| Tool | Error behavior |
|---|---|
| `webfetch` | **Nothing shown** — error state is completely silent |
| `search` (list/glob/grep) | Error output in same Markdown box as success — no visual distinction |
| `read` | `ToolOutputPanel` (red) |
| `bash` | `ToolOutputPanel` (red) |
| `edit` | `ToolOutputPanel` (red) |
| `apply_patch` | `ToolOutputPanel` (red) |
| `render_figure` | `ToolOutputPanel` (red) |
| `render_mermaid` | `ToolOutputPanel` (red) |
| `task` | Animated `ToolOutputPanel` (red) |
| `render_saved_question_set` | Custom inline `<p>` (red, different DOM + styling) |
| `knowledge-graph` | `ToolOutputPanel` (red) |
| `question` | `ToolOutputPanel` (red) |

Three divergent patterns:
1. Silent (webfetch).
2. Undifferentiated (search — error looks like success).
3. `ToolOutputPanel` (most tools).
4. Custom inline paragraph (question-set).

---

### I-5: Completed state with no content varies

Some tools show rich output on completion; others are completely silent:

| Tool | Completed + empty content |
|---|---|
| `read` (no loaded files) | Silent — nothing shown |
| `webfetch` | URL link always shown |
| `generic` | Silent — nothing shown |
| `render_figure` (no parsed output) | Silent |
| `bash` (no output) | "No output" text |

Only `bash` shows an explicit empty state. Others are silent — ambiguous between "nothing happened" and "tool ran successfully."

---

### I-6: Output content styling has three variants

For text output blocks:

| Style | Used by |
|---|---|
| `ToolOutputPanel` (`bg-background-base px-3 py-2 text-xs`) | `bash`, `edit`, `skill`, `task`, `exa-search` (error), `render_figure` (error), `render_mermaid` (error), `knowledge-graph`, `question`, `python_calculator` (has output) |
| Raw `<pre>` (`bg-surface-weak/40 p-2 text-xs`) | `edit` (before/after panels) |
| Raw `<pre>` (`bg-background-base p-2 text-xs`) | `edit` (write content), `python_calculator` (JSON value), `buddy-custom` (JSON value) |
| Markdown in bordered card (`bg-background-base px-3 py-2`) | `search` (list/glob/grep) |

The `before/after` `<pre>` panels in `edit` use `bg-surface-weak/40` (slightly elevated surface) while the write content `<pre>` uses `bg-background-base` (sunken). These are three slightly different background tokens for conceptually similar "code/text display" blocks.

---

### I-7: Status badge visibility rules are inconsistent

`ToolStatusBadge` is hidden while `pending` or `running` (shows only on `complete`/`error`). But:
- `MermaidToolCard` sets `hideStatus=true` when source is available (no dot at all on a successfully rendered diagram).
- `TaskToolCard` does not use `ToolStatusBadge` at all — uses `LoaderCircleIcon` instead.
- `task` subtype cards use a custom `LoaderCircleIcon` spinner, not the shared badge.

There is no unified rule for "how do we show the current status of a running tool."

---

### I-8: Running-state content visibility is inconsistent

| Tool | Body visible while running? |
|---|---|
| `apply_patch` | Yes (running message shown) |
| `knowledge-graph` | Yes (running label shown) |
| `render_mermaid` | Yes (skeleton) |
| `render_saved_question_set` | Yes ("Preparing...") |
| `task` | Yes (card always visible) |
| All `BasicTool` tools | No — body is hidden while running; collapse is disabled (`!running && children`) |

`BasicTool` hides the chevron and collapses content while running (`!running && children` condition). Some tools override this with `hideDetails=true` (always expanded). The UX effect is: for most tools, you see only a pulsing title with no expandable content while they run.

---

### I-9: Motion is only used in three tools

Framer Motion animations appear only in:
- `task` variants: entry animation (`y: 4 → 0`), shimmer gradient, `AnimatePresence` for body sections.
- `mermaid`: custom `motion.ts` spring configs.
- `BasicTool`: chevron rotation spring.
- `ToolStatusBadge`: scale/opacity spring on status dot.

The `question-set` card is static (no motion). Buddy-custom, skill, knowledge-graph, and all `BasicTool` tools have no body motion at all — no enter animation, no content transition.

---

### I-10: i18n coverage is incomplete

Several strings are hardcoded, not in the `language` system:
- `"Loading generated flashcard deck..."` (task.tsx)
- `"Loading generated question set..."` (task.tsx)
- `"Preparing question set..."` (saved-question-set-tool.tsx)
- `"Loading question set..."` (saved-question-set-tool.tsx)
- `"Using {agent}"` / `"Used {agent}"` are in the language system, but `"{verb} subagent"` fallback is not.
- Knowledge graph RUNNING_LABELS are hardcoded strings, not i18n'd.

---

### I-11: Duplicate URL display in `webfetch`

`webfetch` shows the URL in both:
1. The `info.subtitle` of the `BasicTool` trigger (dimmed text next to title).
2. The body as a clickable `<a>` link.

The subtitle is already clickable-looking but is not a link. The body link is the actual interactive element. This creates redundancy and visual clutter.

---

### I-12: No consistent affordance for "tool has interactive output"

Tools with interactive output (`question-set`, `question`, `flashcard-author task`) use no consistent visual signal that the tool card contains something interactive. They look the same as static output cards until you inspect them closely.

---

---

## Proposed System

### Design Philosophy

From the user's perspective, there are no "tools" — there are **agent abilities**. A diagram is not a "mermaid tool call." A quiz is not a "question-set tool call." A subagent delegation is not a "task tool." Each of these is a fundamentally different kind of interaction, and they should look and feel different.

But "different" doesn't mean "random." Right now the tool rendering system feels like 20 independent implementations that happen to share a couple of primitives. The goal of this proposal is to design a **coherent product language** where each category of ability has a distinct, intentional personality — and where the cross-cutting behaviors (errors, loading, empty states, motion) feel like they come from one system.

**Two layers:**
1. **Foundation** — shared state primitives that every tool must use. Error rendering, status indication, empty states. These are the bones. They fix real bugs and create a baseline of reliability.
2. **Ability Design** — each category of interaction gets its own interaction signature: how it enters, how it shows progress, how it reveals content, how it invites action. This is the personality. This is what makes the agent feel capable, not mechanical.

---

### The Hidden Steps System (Existing, Under-Documented)

The codebase already has a two-tier rendering architecture that separates "background work" from "foreground artifacts." This was not documented in the original audit and is critical context for the proposal.

#### How it works

```
assistant-section.tsx
  └─ groupAssistantParts()          (message-utils.ts)
       ├─ ABSTRACTABLE_TOOLS set    (constants.ts) — tools to fold into hidden steps
       ├─ HIDDEN_TOOLS set          (registry.ts)  — tools to hide entirely
       └─ Parts are classified:
            ├─ "abstracted" → grouped into HiddenSteps
            └─ "part"       → rendered inline via AssistantPartRenderer
```

**ABSTRACTABLE_TOOLS** — these are folded into the `HiddenSteps` collapsible:
`read`, `list`, `glob`, `grep`, `bash`, `websearch`, `codesearch`, `webfetch`, `learner_snapshot_read`, `pedagogy_resource_ingest_full_text`, `skill`, and all seven knowledge-graph tools.

**HIDDEN_TOOLS** — these render `null` (invisible):
`todowrite`, `todoread`.

**Foreground tools** — everything NOT in `ABSTRACTABLE_TOOLS` renders inline in the chat:
`task` (and subtypes), `render_mermaid`, `render_figure`, `render_freeform_figure`, `render_saved_question_set`, `edit`, `write`, `apply_patch`, `question`, `python_calculator`.

#### HiddenSteps component (hidden-steps/index.tsx)

The `HiddenSteps` component is sophisticated — it's not just a simple collapsible:

- **Live preview**: While a tool is running, the last active entry's output is shown in a scrolling preview window (max 80px tall) below the trigger.
- **Bucketed summary**: On completion, entries are grouped into buckets: "Read 3 files · Searched 2 times" — using `buildSummary()`.
- **Error preview**: If a hidden step errors, the preview switches to red text with the error message. The trigger shows an error count badge.
- **summaryOnly rendering**: Some tools (registered with `createSummaryOnlyHiddenStepPresentation`) get a compact `SummaryOnlyToolRow` instead of their full renderer when expanded.
- **Full renderer fallback**: Tools without `summaryOnly: true` render their full `AssistantPartRenderer` when the user expands the collapsible.

#### Registry integration

Each tool registration can include a `hiddenSteps` callback:

```ts
registerTool({
  name: "read",
  render: renderReadTool,
  isContextTool: true,
  hiddenSteps: createReadHiddenStepPresentation,  // ← controls how it appears inside HiddenSteps
})
```

Four presenter factories exist:
- `createReadHiddenStepPresentation` — shows file name, directory, and a content snippet preview.
- `createSearchHiddenStepPresentation` — shows query text and output preview.
- `createSummaryOnlyHiddenStepPresentation` — compact label only, no preview (skill, knowledge-graph tools, pedagogy tools).
- `createArtifactHiddenStepPresentation` — shows artifact type badge and output preview.

#### Current gaps in the hidden steps system

1. **Error visibility is subtle.** The error count badge (`"1 error"`) is small red text inline with the summary. It's easy to miss. The preview does show the error in red, but only while active — once the run finishes, the preview collapses and the error indicator is just the count text.

2. **Several foreground tools probably belong in hidden steps.** `edit`, `write`, `apply_patch`, and `python_calculator` are currently rendered inline but are arguably "background work" — the user cares about the result, not the tool invocation. Whether to move them is a UX decision, not a technical one. This proposal does not move them — that's a separate discussion.

3. **`webfetch` is in ABSTRACTABLE_TOOLS but has no `hiddenSteps` callback.** It uses `renderWebfetchTool` when expanded inside HiddenSteps, which works but means the hidden steps system falls back to the full renderer instead of a compact summary. Same for several other tools that are abstractable but lack a `hiddenSteps` presenter.

4. **Not all buddy-custom tools are abstractable.** Only `learner_snapshot_read` and `pedagogy_resource_ingest_full_text` are registered. Other buddy-custom tools that hit the `renderBuddyCustomTool` fallback (any `teaching_*`, `goal_*`, `curriculum_*` prefix tools) are rendered via the buddy-custom catch-all in `isBuddyCustomTool()` but are NOT in `ABSTRACTABLE_TOOLS`, so they appear inline in chat.

---

### Ability Categories

The agent has five kinds of abilities. Each deserves a distinct interaction signature — not a uniform shell, but an intentional visual and behavioral personality.

#### 1. Background Work — "The agent was thinking"

**Tools**: `read`, `list`, `glob`, `grep`, `bash` (when abstracted), `websearch`, `codesearch`, `webfetch`, `skill`, all knowledge-graph tools, `learner_snapshot_read`, `pedagogy_resource_ingest_full_text`

**User perception**: "The agent gathered information / prepared something." The user doesn't care about individual invocations — they care about the aggregate outcome.

**Interaction signature**:
- **Rendered via**: `HiddenSteps` collapsible — already correct.
- **While working**: Live preview of the latest step, pulsing "Thinking" label. The preview should feel like a peek behind the curtain — quick, scrolling, low-contrast text.
- **When done**: Compact bucketed summary ("Read 3 files · Searched 2 times"). This is the only thing most users will ever see. It needs to be informative in one glance.
- **On error**: The summary should make errors impossible to miss — not a small red count, but a prominent indicator that invites expansion.
- **Expand behavior**: User can expand to see full tool renderers. These are informational — never auto-expanded on success.

**What to improve** (vs. current):
- The error indicator in the trigger should be more prominent (see Fix 5 below).
- Tools in this category that lack a `hiddenSteps` presenter should get one so expanded view is compact, not the full renderer. Currently `webfetch`, `bash` have no `hiddenSteps` callback.
- The "Thinking" placeholder should feel more like the agent is actively working — perhaps a subtle progress pulse or streaking animation rather than a static pulsing word.

#### 2. Mutations — "The agent changed something"

**Tools**: `edit`, `write`, `apply_patch`

**User perception**: "The agent modified my files." This is high-stakes — the user wants to see exactly what changed and have confidence the agent did the right thing.

**Interaction signature**:
- **Rendered via**: `BasicTool` collapsible — these appear inline in chat, not hidden.
- **While working**: The title pulses (current). For `apply_patch`, a running label like "Applying patch..." appears in the header `trailing` slot (current, good). For `edit`/`write`, there's currently no running feedback beyond the pulsing title — these should also show a brief label or spinner in the header.
- **When done**: Auto-open on content. The diff view (before/after panels) is the key affordance — the user needs to scan the change. Currently `edit` and `apply_patch` use `defaultOpen={defaultOpen}` from parent, which may or may not open. These should **default to expanded on completion** — the diff IS the output.
- **On error**: `ToolErrorPanel` with diagnostics if available. `DiagnosticList` (unique to edit) is a great tool-specific enhancement — keep it.
- **Collapse behavior**: Collapsed by default while running/pending. Expands on completion or error.

**What to improve** (vs. current):
- `edit`/`write` should default-expand on completion (currently depends on parent prop).
- The before/after `<pre>` panels use inconsistent background tokens (`bg-surface-weak/40` vs `bg-background-base`). These should use the same token — they're the same semantic concept.
- Consider a subtle entry animation for the diff panels — content sliding or fading in rather than just appearing.

#### 3. Artifacts — "The agent created something"

**Tools**: `render_mermaid`, `render_figure`, `render_freeform_figure`, `render_saved_question_set`

**User perception**: "The agent produced a deliverable." A diagram, an image, a quiz. This is output the user will use, export, interact with. These should feel like **first-class objects**, not collapsed rows.

**Interaction signature**:
- **Rendered via**: Custom cards (`MermaidToolCard`, `QuestionSetToolCard`) or `BasicTool` with `hideDetails=true` (`render_figure`). Always expanded.
- **While working**: Rich loading states. Mermaid already has a great bespoke skeleton. Question-set shows "Preparing question set..." text. `render_figure` shows nothing while loading — this is a gap.
- **When done**: The artifact IS the content. No collapse, no summary needed. The card frame should feel premium — it's presenting a deliverable.
- **Actions**: Action bars (copy, download, fullscreen) are critical for artifacts. Mermaid has this. Figure has a copy-URL action. Question-set has none — the inline quiz is the interaction. Consider whether question-set and figure could benefit from a consistent action bar pattern.
- **On error**: `ToolErrorPanel` inside the card frame. Mermaid has a "request fix" button that auto-sends feedback — this is excellent. Consider whether other artifact tools could benefit from a similar "retry" affordance.

**What to improve** (vs. current):
- `render_figure` needs a loading state while pending/running — even a simple "Generating figure..." text like question-set uses.
- `MermaidToolCard` and `QuestionSetToolCard` share nearly identical structure (card + header bar + status) but share no code. Consider extracting a shared `ArtifactCard` shell that both compose. This is NOT "one shell for everything" — it's "artifacts are a category that shares a card frame, while row-tools use `BasicTool`."
- Artifact cards should have a consistent entry animation. Currently only task cards have `y: 4→0`. Artifacts appearing in the chat should also enter with a subtle slide-up or fade — they're significant output.

#### 4. Delegations — "The agent used another agent"

**Tools**: `task` (generic), `task:flashcard-author`, `task:question-set-author`

**User perception**: "The agent asked a specialist for help." The user wants to know who was delegated to, what they did, and what they produced. This is about trust and transparency.

**Interaction signature**:
- **Rendered via**: Custom `motion.div` card with shimmer gradient while running.
- **While working**: Shimmer gradient + spinner. "Running flashcard-author..." — the agent name is prominent. This is already well done.
- **When done**: Verb shift: "Using X" → "Used X". If a child session exists, the card becomes clickable to navigate. This is good — it gives the user a way to inspect what happened.
- **Subtypes**: Flashcard and question-set author subtypes fetch their artifacts after completion and present them inline with action buttons ("Review", "Open"). This is the strongest example of tool-specific enhancement in the whole system.
- **On error**: `ToolOutputPanel` with animated reveal. Already good.

**What to improve** (vs. current):
- The hardcoded loading strings ("Loading generated flashcard deck...", "Loading generated question set...") should be moved to the language system.
- The flashcard and question-set author cards are structurally identical (same header, same body pattern, same loading/error flow) but are fully duplicated in `task.tsx`. These could share a `SubagentArtifactCard` abstraction.
- Consider adding a subtle "session link" indicator — a small icon or affordance that signals "this card links to a sub-conversation" before hover.

#### 5. Interactive — "The agent is asking you something"

**Tools**: `question`

**User perception**: "The agent needs my input." This is the most user-facing category — it requires action. Currently `question` uses `BasicTool` with collapsible content, which undersells the interaction.

**Interaction signature**:
- **Rendered via**: `BasicTool` (collapsible). Auto-opens when answers exist.
- **While working**: Hidden while pending/running (filtered out in `assistantPartRenderable`). Appears only when completed.
- **When done**: Q&A pairs in bordered cards. Subtitle cleverly switches: "1 question" → "1 answered".
- **Collapse behavior**: Opens when answers exist. This is a good pattern.

**What to improve** (vs. current):
- The question tool uses `BasicTool` with collapsible rows, which makes it look like a utility tool. It's actually an interaction prompt. Consider giving it a card treatment (like artifacts) to signal "this needs your attention" — maybe a subtle highlight border or a different background.
- No affordance signals "this tool has interactive output" (I-12). Interactive tools could use a consistent visual signal — e.g., a border accent or a small interaction icon.

---

### Motion Language

Currently motion is used inconsistently: task cards have entry animations, mermaid has custom springs, `BasicTool` has only a chevron rotation, and most tools have no motion at all. Rather than forcing the same animation on everything, define a shared motion vocabulary with tool-specific opt-in.

#### Shared Motion Tokens

```ts
// Snappy — for small UI elements (chevron, status dot, toggle)
const MOTION_SNAPPY = { type: "spring", stiffness: 500, damping: 35, mass: 0.8 }

// Gentle — for content reveals (body expand, panel slide)
const MOTION_GENTLE = { type: "spring", stiffness: 300, damping: 30, mass: 1 }

// Soft — for subtle entry (card fade-in, artifact appear)
const MOTION_SOFT = { type: "spring", stiffness: 260, damping: 28, mass: 1.2 }
```

These three tokens should replace all per-tool spring configs. Currently `mermaid` has `motion.ts`, `task` has `task-motion.ts`, `HiddenSteps` has its own `SPRING_SNAPPY` and `SPRING_GENTLE`. The values are close but not identical — consolidate them.

#### Motion Usage by Category

| Event | Background | Mutations | Artifacts | Delegations | Interactive |
|---|---|---|---|---|---|
| **Card/row entry** | None (hidden steps handles) | None (keep subtle) | Fade-up `y: 6→0` | Fade-up `y: 4→0` (current) | Fade-up `y: 4→0` |
| **Status indicator** | N/A (in hidden steps) | Spinner → dot spring | Spinner → dot spring | Spinner → dot spring | Spinner → dot spring |
| **Content reveal** | `MOTION_GENTLE` height spring | `MOTION_GENTLE` height spring | `MOTION_GENTLE` height spring | `MOTION_GENTLE` (current) | `MOTION_GENTLE` height spring |
| **Error reveal** | Red text in preview | `MOTION_GENTLE` error panel | `MOTION_GENTLE` error panel | `MOTION_GENTLE` (current) | `MOTION_GENTLE` error panel |
| **Running shimmer** | Preview text scrolls | Pulsing title | Tool-specific skeleton | Shimmer gradient (current) | N/A |
| **Chevron rotate** | `MOTION_SNAPPY` | `MOTION_SNAPPY` | N/A (no collapse) | N/A (no collapse) | `MOTION_SNAPPY` |

The key principle: **motion communicates state transitions, not decoration.** Entry animations signal "something new appeared." Spinners signal "something is working." Content reveals signal "here's the result." Keep it functional.

---

### State Contract

Every tool, regardless of category, must follow this contract. The visual personality varies by category; the state behavior does not.

| Status | Required behavior |
|---|---|
| `pending` | Title visible. Status indicator shows nothing. Body may be hidden or show placeholder. |
| `running` | Status indicator shows spinner. Optional category-specific progress (shimmer, skeleton, label). |
| `completed` — with content | Tool renders its content normally. Status indicator shows completion dot. |
| `completed` — no content | `ToolEmptyState` renders. Status indicator shows completion dot. |
| `error` | Status indicator shows red dot. `ToolErrorPanel` renders with error message. Auto-expanded. Always visible. |

---

### `defaultOpen` Rules

Three rules, chosen per category. The default is "open on error."

| Rule | Behavior | Category |
|---|---|---|
| **Always expanded** | Content always visible, no chevron | Artifacts (hideDetails=true or card shells with no collapse) |
| **Expand on completion** | Collapsed while pending/running, expands when done | Mutations (the diff IS the output), Interactive (answers are the content) |
| **Open on error only** | Closed on success, auto-expands on error | Background (when rendered standalone), any utility tool |

---

---

## Foundation Fixes

These are concrete code changes that create the shared state primitives. They fix real bugs and establish the baseline that the ability design layer builds on.

### Fix 1: `ToolErrorPanel` — Consistent Error Rendering

**Problem**: Four divergent error patterns exist (I-4). Webfetch swallows errors silently. Search shows errors identically to success. Question-set uses a custom inline `<p>`. Everything else uses `ToolOutputPanel` with red styling.

**Solution**: Extract a dedicated `ToolErrorPanel` component. This is functionally what `ToolOutputPanel` already does when `status === "error"` — just make it explicit and mandatory.

```ts
type ToolErrorPanelProps = {
  error: string           // primary error message
  output?: string         // optional raw output for expandable detail
  copyLabel?: string
}
```

**Concrete code changes:**

| File | Change |
|---|---|
| `webfetch.tsx` | Add error rendering: `{state.status === "error" && showOutput ? <ToolErrorPanel ... /> : null}` |
| `search.tsx` | Distinguish error from success: wrap the error case in `ToolErrorPanel` instead of the same Markdown box |
| `question-set/saved-question-set-tool.tsx` L305-308 | Replace the custom `<p className="...border-border-critical-base/40...">` with `ToolErrorPanel` |
| `tool-output-panel.tsx` | Keep as-is for success output. `ToolErrorPanel` reuses the same styling but is a separate component with `status="error"` hardcoded |

**Rule**: Every renderer must use `ToolErrorPanel` when `state.status === "error"`. The `BasicTool` shell's `useEffect` already auto-expands on error (L52-54 of basic-tool.tsx) — this stays.

**Hidden steps integration**: The `HiddenSteps` component already shows error text in the preview (L492-498 in hidden-steps/index.tsx, with `text-icon-critical-base` styling). When the user expands, errored tools should render their full renderer which now includes `ToolErrorPanel`. No change needed to `HiddenSteps` itself — the fix is in the individual renderers.

---

### Fix 2: `ToolStatusIndicator` — Visible Running State

**Problem**: `ToolStatusBadge` (tool-header.tsx L26-42) is explicitly **invisible** during `pending` and `running` states (L27: `const visible = status !== "running" && status !== "pending"`). Meanwhile, `TaskCardHeaderContent` uses its own `LoaderCircleIcon` spinner. There's no shared running indicator.

**Solution**: Replace `ToolStatusBadge` with `ToolStatusIndicator` that actually shows something while running.

```ts
type ToolStatusIndicatorProps = {
  status: ToolStatus
}
```

| Status | What renders |
|---|---|
| `pending` | Nothing (same as today) |
| `running` | Small animated spinner (replaces invisible state) |
| `completed` | Green/blue dot with pop-in spring (same as today) |
| `error` | Red dot (same as today) |

**Concrete code changes:**

| File | Change |
|---|---|
| `tool-header.tsx` | Rename `ToolStatusBadge` → `ToolStatusIndicator`. Add a spinner branch for `running`. |
| `basic-tool.tsx` L93 | Already uses `ToolStatusBadge` — gets the spinner for free after rename. |
| `task.tsx` L157 | Replace the standalone `<LoaderCircleIcon>` with `<ToolStatusIndicator status={state.status}>` |
| `mermaid-tool-card.tsx` L37-41 | Already uses `ToolStatusBadge` — gets the spinner. The `hideStatus` prop stays for the "source available" case. |

**What this does NOT change**: The mermaid skeleton shimmer, the task shimmer gradient, and `apply_patch`'s `trailing` label are **not touched**. Those are tool-specific running affordances that exist on top of the shared indicator. The indicator is additive — it gives every tool a baseline running signal.

---

### Fix 3: `ToolEmptyState` — Acknowledge Empty Completions

**Problem**: Five tools silently show nothing on completion with no content (I-5). Only `bash` says "No output."

**Solution**: A small shared component for "completed with nothing to show."

```ts
type ToolEmptyStateProps = {
  label?: string   // defaults to "No output" or similar
}
```

**Concrete code changes:**

| File | Current empty behavior | Change |
|---|---|---|
| `read.tsx` | `loadedFiles.length > 0` renders list, else nothing | Add `{loadedFiles.length === 0 && state.status === "completed" ? <ToolEmptyState /> : null}` |
| `generic.tsx` | Only shows output on error, nothing on success | Add empty state for `completed` |
| `render-figure.tsx` | `!renderFigure` case shows nothing below title | Add empty state |
| `exa-search.tsx` | `links.length === 0 && status === "completed"` shows nothing | Add `<ToolEmptyState label="No results found" />` |
| `search.tsx` | `!showOutput && status === "completed"` shows nothing | Add empty state |

**Scope**: This only applies to tools where empty completion is genuinely ambiguous. For tools where "no output" is the expected success case (e.g., `edit` succeeding without diagnostics), no empty state is needed.

---

### Fix 4: `defaultOpen` Normalization

**Problem**: Eleven different `defaultOpen` strategies (I-2). No coherent rule.

**Solution**: Three rules, chosen per tool. The default is "open on error."

| Rule | Behavior | Used for |
|---|---|---|
| **Always expanded** (`hideDetails=true`) | Content always visible, no chevron | `read`, `webfetch`, `render_figure`, `generic` — tools with short, glanceable output |
| **Open on content** | Closed while pending/running, opens when completed with content | `question` (opens when answers exist), `python_calculator` (opens unless pending), `knowledge-graph` |
| **Open on error** (default) | Closed on success, auto-expands on error | `bash`, `edit`, `apply_patch`, `search`, `skill`, `exa-search`, buddy-custom |

Foreground card tools (`task`, `mermaid`, `question-set`) have no collapse mechanism — they're always visible. No change needed.

**Concrete code changes:**

| File | Current | Change |
|---|---|---|
| `skill.tsx` L35 | `defaultOpen={false}` — never auto-opens, even on error | Change to `defaultOpen={state.status === "error"}` |
| `buddy-custom.tsx` L45-48 | Different logic per tool name | Simplify: `learner_snapshot_read` stays closed, all others use `defaultOpen ?? state.status === "error"` |

Most tools already get "open on error" via `BasicTool`'s `useEffect` (L52-54: `if (status === "error") setOpen(true)`). The `defaultOpen` prop controls the initial state; the effect handles the runtime transition. These two mechanisms work together correctly in most cases.

---

### Fix 5: Hidden Steps Error Indicator

**Problem**: When a hidden step errors, the `HiddenSteps` trigger shows `"1 error"` in small red text next to the summary. This is easy to miss. The preview panel does show red error text, but only while the error is the active entry.

**What already works** (in hidden-steps/index.tsx):
- `entryHasVisibleError()` correctly detects errored entries (L132-134)
- `errorCount` is computed and displayed (L353-356, L436-440)
- Error text is styled with `text-icon-critical-base` in the preview (L493)
- The `suppressErrorPreview` flag lets summary-only tools opt out (used by read, search, summary-only tools)

**What to improve:**

1. **Make the error indicator more prominent.** Currently L436-440 renders a `<span>` with the error count. Consider making this a small badge or adding a warning icon, not just text. This is a styling-only change.

2. **Auto-expand on error.** When `errorCount > 0` and the run is complete (`!isBusy`), `HiddenSteps` could auto-set `isOpen` to `true` so the user sees the errored step without clicking. Currently `isOpen` defaults to `false` and only changes via user click (L346). Add an effect: `useEffect(() => { if (errorCount > 0 && !isBusy) setIsOpen(true) }, [errorCount, isBusy])`.

3. **Use `ToolErrorPanel` inside expanded hidden steps.** The individual renderers already handle error display — once they adopt `ToolErrorPanel` (Fix 1), the expanded hidden steps view gets it for free.

---

### Scope Boundaries

| Not in scope | Why |
|---|---|
| **Re-tiering tools** (moving `edit`/`apply_patch`/`python_calculator` to hidden steps) | Product/UX decision. This proposal assumes current tier assignments. |
| **i18n sweep** | Real debt (I-10), but mechanical. Separate pass. |
| **Full `ToolOutputPanel` style unification** | Three `<pre>` background variants (I-6) are mildly inconsistent but harmless. Fix during implementation if convenient. |

---

## Summary

### Foundation Fixes (fix bugs, create shared primitives)

| # | Deliverable | Files touched | Fixes |
|---|---|---|---|
| 1 | `ToolErrorPanel` component | New file + `webfetch.tsx`, `search.tsx`, `saved-question-set-tool.tsx` | I-4: 4 error patterns → 1 |
| 2 | `ToolStatusIndicator` component | `tool-header.tsx`, `basic-tool.tsx`, `task.tsx`, `mermaid-tool-card.tsx` | I-3: 12 tools gain running signal. I-7: unified status rules |
| 3 | `ToolEmptyState` component | New file + `read.tsx`, `generic.tsx`, `render-figure.tsx`, `exa-search.tsx`, `search.tsx` | I-5: silent completions |
| 4 | `defaultOpen` normalization | `skill.tsx`, `buddy-custom.tsx`, `edit.tsx`, `apply_patch.tsx` | I-2: 11 patterns → 3 rules by category |
| 5 | Hidden steps error indicator | `hidden-steps/index.tsx` | Subtle errors → prominent + auto-expand |

### Design Improvements (make it better)

| # | Improvement | Category | Impact |
|---|---|---|---|
| 6 | `ArtifactCard` shared shell for `MermaidToolCard` + `QuestionSetToolCard` | Artifacts | Two independently-built cards with identical structure → one composable card frame |
| 7 | Entry animations for artifact and interactive cards | Artifacts, Interactive | Cards enter with `MOTION_SOFT` fade-up instead of appearing instantly |
| 8 | `render_figure` loading state | Artifacts | Goes from "nothing shown while generating" to "Generating figure..." text |
| 9 | Mutations default-expand on completion | Mutations | `edit`/`write`/`apply_patch` expand to show diff when done, not just on parent signal |
| 10 | Consistent `<pre>` tokens for before/after panels | Mutations | `bg-surface-weak/40` vs `bg-background-base` → one token |
| 11 | Shared motion token file | All | Consolidate `mermaid/motion.ts`, `task-motion.ts`, `HiddenSteps` springs → `tool-motion.ts` |
| 12 | `SubagentArtifactCard` for flashcard/question-set author subtypes | Delegations | ~300 lines of duplicated task subtype code → shared abstraction |
| 13 | Missing `hiddenSteps` presenters for `webfetch`, `bash` | Background | Compact summary in expanded hidden steps instead of full renderer |
| 14 | Interactive tools get card treatment or border accent | Interactive | `question` feels like an interaction prompt, not a utility row |
| 15 | "Thinking" animation upgrade | Background | Pulsing word → subtle streaking/progress animation for the running state |

### What stays the same

- All four shell primitives (`BasicTool`, `MermaidToolCard`, `QuestionSetToolCard`, task `motion.div` card) — no forced unification.
- Every tool-specific enhancement (mermaid's dot-grid and skeleton, task's shimmer gradient, knowledge-graph's structured sections, edit's `DiagnosticList`, mermaid's "request fix" button).
- The hidden steps grouping mechanism and its current tier assignments.
- Each ability category keeps its distinct visual and behavioral identity.
