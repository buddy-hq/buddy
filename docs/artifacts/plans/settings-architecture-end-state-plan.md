# Settings Architecture End-State Plan

Status: proposal  
Scope: `packages/web/src/components/settings/**`, `packages/web/src/routes/settings.tsx`, related settings state/config ownership.

## Goal

Make Buddy settings globally understandable at a glance.

The settings product should be global-first by default, with notebook customization shown only where a feature explicitly supports notebook overrides.

## Product Rule

Default rule:

- settings are global unless a tab explicitly supports notebook customization
- notebook-specific behavior is presented as an override on top of global defaults
- non-config informational pages are treated as info, not settings

## Scope Classes

Every settings tab should declare one primary scope:

- `global`: machine-wide Buddy behavior and machine-local runtime state
- `notebook`: per-notebook customization only
- `mixed`: global defaults plus notebook customization and optional effective-behavior preview
- `info`: informational pages that do not configure behavior

## Shell Model

- `/settings` should be a global-first settings surface.
- Notebook context should be optional workbench state, not the default meaning of the page.
- The shell should only surface notebook selection and notebook-specific empty states where the active tab supports notebook customization.

## Target Tab Ownership

- `General`: `global`
  - theme
  - color scheme
  - app update controls
- `Providers`: `global`
  - provider connections and provider management should read as machine-global
- `Instructions`: explicit decision required
  - either rename to `Global Instructions`
  - or split into `Global Instructions` and `Notebook Instructions`
- `Learner Memory`: `mixed`
  - global defaults
  - notebook participation
  - effective behavior preview
- `Standards`: `mixed`
  - global defaults
  - notebook overrides
- `MCPs`: `notebook`
  - configured for the selected notebook only
- `Skills`: likely `notebook`
  - unless a separate global library/settings surface is intentionally exposed
- `Advanced`: `global` only, or split
  - runtime installs and machine-wide discovery belong here
  - notebook log level should move elsewhere if it remains notebook-specific
- `Attribution`: `info`
  - ideally move to `About` or `Licenses`

## Mixed Tab Contract

Mixed tabs are allowed only when they follow one structure:

1. global defaults
2. notebook customization
3. effective behavior or preview

`Learner Memory` is the reference pattern. `Standards` is close and should follow the same structure as closely as practical.

## Tab Metadata

Promote scope into the tab definition.

Suggested shape:

```ts
type SettingsTabScope = "global" | "notebook" | "mixed" | "info"
```

Each tab definition should declare:

- `scope`
- whether notebook selection is relevant
- whether notebook-empty fallback UI should be shown

The shell should use that metadata to render:

- scope badges
- notebook selection affordances
- notebook-empty states
- tab framing copy

## State Layer End-State

Replace broad mixed-scope hooks with ownership-specific hooks.

Preferred direction:

- `useGlobalSettingsWorkbench(...)`
- `useNotebookSettings(...)`
- `useMixedSettings(...)` only when truly necessary

The state hook layer should mirror product ownership instead of hiding mixed scope behind notebook-oriented naming.

## Backend Ownership Direction

Frontend scope is already becoming clearer than backend ownership.

End-state backend direction:

- truly global-owned settings should be structurally global
- notebook-owned settings should be structurally notebook-owned
- avoid relying on merged config semantics plus frontend cleanup when ownership is a product rule

Learner memory is the clearest example: if some keys are globally owned by design, that should eventually be expressed by backend contract or service boundaries, not only by UI patch cleanup.

## Open Decisions

### Instructions

Pick one:

1. settings owns only global instructions, with notebook instructions staying elsewhere under an explicit notebook label
2. settings exposes both global and notebook instruction surfaces

### Advanced

Pick one:

1. keep `Advanced` global-only
2. split notebook diagnostics out into a notebook-specific diagnostics or developer surface

### Providers

Pick one:

1. fully remove notebook coupling from provider settings if it is not fundamentally required
2. keep notebook-sensitive runtime/model resolution, but separate it from provider connection ownership

## Implementation Phases

### Phase 1

Finish the shell contract.

- add scope metadata to tab definitions
- let the settings shell render scope framing from tab metadata
- ensure global tabs work cleanly with no selected notebook

### Phase 2

Normalize tab ownership.

- keep `General` global-only
- keep `Providers` global-only in product framing
- keep `MCPs` notebook-only
- keep `Learner Memory` and `Standards` as first-class mixed tabs
- decide and implement the `Instructions` model
- move or reclassify `Attribution`

### Phase 3

Shrink or split `Advanced`.

- keep machine-global runtime/system controls in `Advanced`
- move notebook-only diagnostics out if needed

### Phase 4

Refactor the state layer to match ownership.

- introduce scope-specific hooks
- reduce reliance on one mixed bundle for unrelated settings domains

### Phase 5

Tighten backend ownership where product rules demand it.

- reduce ambiguity between global and notebook config ownership
- remove frontend-only enforcement where backend contracts should own the rule

## Success Criteria

- a user can tell whether a setting is global, notebook-specific, mixed, or informational without reading implementation details
- global tabs function correctly without a selected notebook
- mixed tabs follow one shared structure
- notebook-only tabs show a clear notebook-required state
- state hooks and backend ownership match the product model closely enough that agents do not need deep code inspection to answer scope questions correctly

## Current Settings Split

This is the current implementation split, not the target split.

- Global settings
  - General
    - appearance
      - color scheme
      - theme
    - behavior defaults
      - default persona
      - full-text reading
      - auto-compaction
    - app
      - check for updates
  - Providers
    - connected providers
    - recommended providers
    - all providers
    - note: this tab is framed as global, but current provider catalog/auth flows still route through the selected notebook directory
  - Instructions
    - global `AGENTS.md`
  - Learner Memory
    - global memory system
      - global learner memory master switch
    - global model defaults
      - extraction model
      - consolidation model
    - global extraction tuning
      - minimum user messages
      - startup idle threshold
      - attention threshold
      - approval confidence
      - extraction delay
      - per-session call cap
      - daily call cap
      - default context limit
      - startup concurrency
      - consolidation input cap
      - stage-one retention days
  - Advanced
    - runtime components
      - advanced math runtime install/remove
      - standards runtime install/remove
    - skill discovery behavior
      - discover external skills
    - note: `discover external skills` is currently persisted as per-project skills settings even though the tab frames it as global
- Notebook settings
  - MCPs
    - MCP server configuration for the selected notebook
  - Skills
    - installed skills for the selected notebook context
    - library skill install into the selected notebook context
    - custom skill creation in the selected notebook context
    - skill permission changes in the selected notebook context
    - skill removal in the selected notebook context
    - note: skills settings and mutations are directory-scoped today
- Mixed settings
  - Learner Memory
    - current notebook customization
      - learner memory enabled for the selected notebook
      - automatic extraction enabled for the selected notebook
    - effective behavior
      - learner memories Buddy can currently use for the selected notebook
  - Standards
    - global defaults
      - all standards tools enabled/disabled
      - per-tool global default toggles
        - `search_standards`
        - `get_standard`
        - `get_learning_components`
        - `get_prerequisites`
        - `get_next_standards`
        - `get_crosswalk`
        - `query_standards_sql`
    - notebook overrides
      - selected notebook override target
      - per-tool notebook override mode
        - inherit
        - enabled
        - disabled
  - Advanced
    - notebook customization
      - notebook log level
- Others
  - Attribution
    - licenses
    - attribution links
    - app information only
  - Legacy / currently unused in the main tab registry
    - Appearance
      - contains global appearance and desktop/runtime controls
      - appears to be older overlapping settings UI, not the active tab implementation

## Refactor Phases

Lowest risk to highest risk.

- Phase 1: labeling and classification only
  - add/finish explicit tab scope metadata
  - keep all current behavior the same
  - make every tab header clearly say `Global`, `Notebook`, `Mixed`, or `Info`
  - mark `AppearanceSettings` as legacy or remove its remaining references if unused
- Phase 2: shell and navigation cleanup
  - make the settings shell global-first in wording and layout
  - ensure global tabs do not visually depend on notebook context
  - rename `Instructions` to `Global Instructions` unless/until notebook instructions move into settings
  - move `Attribution` toward `About` / `Licenses` / `Info`
- Phase 3: frontend-only tab cleanup
  - keep `General` global-only
  - move notebook log level out of `Advanced` into a notebook-specific area
  - make mixed tabs follow one shared structure
    - global defaults
    - notebook customization
    - effective behavior
- Phase 4: frontend ownership alignment
  - fix tabs that are framed as global but still use notebook-coupled plumbing
  - decide the real scope of `Providers`
  - decide the real scope of `discover external skills`
  - make no-notebook behavior fully valid for all global tabs
- Phase 5: state-layer refactor
  - split broad mixed hooks into scope-specific hooks
    - global settings hooks
    - notebook settings hooks
    - mixed settings hooks where truly needed
  - reduce scope ambiguity in query bundles and cache keys
- Phase 6: backend ownership refactor
  - make truly global-owned settings structurally global in backend contracts
  - make notebook-owned settings structurally notebook-owned
  - reduce reliance on merged config plus frontend cleanup for ownership rules
  - especially tighten learner-memory ownership where product rules already require it
