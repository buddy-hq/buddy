# Current Settings UI Map

Scope: the user-visible `/settings` experience in `packages/web`. This is a UI map, not an implementation or filesystem map.

## Shell

```text
/settings
├── Left rail
│   ├── Existing chat/project sidebar shell
│   │   ├── open notebooks
│   │   ├── notebook sessions
│   │   ├── pin / unread / archive / rename / close actions
│   │   └── open notebook / new session actions
│   ├── Back to chat button
│   ├── Settings tab navigation
│   │   ├── Appearance
│   │   ├── Instructions
│   │   ├── Notebook
│   │   ├── Providers
│   │   ├── MCPs
│   │   ├── Skills
│   │   ├── Tools
│   │   ├── Advanced
│   │   └── Attribution
│   └── Resize handle
└── Main panel
    ├── Empty state when no notebook is active
    └── Active tab content
        ├── Standard tab frame
        │   ├── optional header
        │   │   ├── title
        │   │   └── description
        │   └── centered scrollable content column
        └── Full-page tab frame
            └── used by Skills
```

## Tab Map

```text
Appearance
├── Header
│   ├── title
│   └── description
├── Theme section
│   ├── Color scheme row
│   │   └── select: system / light / dark
│   └── Theme row
│       └── select: current theme catalog
└── Desktop section (desktop only)
    ├── Advanced math runtime row
    │   ├── status label
    │   ├── installed runtime version
    │   ├── enable toggle
    │   ├── progress bar and progress message
    │   └── inline error
    ├── Check for updates row
    │   └── button
    └── Confirm remove math runtime dialog
```

```text
Instructions
├── Header
│   ├── title
│   └── description
└── Full-height AGENTS.md editor
    ├── loads existing global AGENTS.md
    ├── empty state with create action
    └── save flow with version conflict handling
```

```text
Notebook
├── Header
│   ├── title
│   └── description
└── Settings card
    ├── Default persona row
    │   └── select
    ├── Default intent row
    │   └── select: auto / learn / practice / assess
    ├── Full-text reading row
    │   └── on/off toggle
    └── Log level row
        └── select: default / info / warn / error
            └── debug also appears in dev
```

```text
Providers
├── Connected providers section
│   └── provider rows
│       ├── provider name
│       ├── source badge
│       └── Edit connection button
├── Available providers section
│   └── provider rows
│       ├── provider name
│       ├── auth method summary
│       └── Connect button
└── Connect provider dialog
```

```text
MCPs
├── Header
│   ├── title
│   └── description with enabled / total count
├── MCP list panel
│   ├── top bar
│   │   ├── list title
│   │   ├── list description
│   │   └── Add MCP button
│   ├── optional search field
│   ├── scrollable MCP list
│   │   └── MCP rows
│   │       ├── name
│   │       ├── status badge
│   │       ├── type badge
│   │       ├── url or command preview
│   │       ├── pending status text
│   │       ├── Edit details button
│   │       ├── Connect button when auth is needed
│   │       └── enable / disable switch
│   └── empty state
│       └── Add first MCP button
├── Inline error message
└── MCP editor dialog
    ├── name
    ├── type: remote / local
    ├── enabled by default switch
    ├── timeout
    ├── remote-only fields
    ├── local-only fields
    └── save / cancel actions
```

```text
Skills
├── Full-page layout
├── Toolbar
│   ├── search field
│   ├── New skill button
│   └── Refresh button
├── Installed skills section
│   ├── section header
│   ├── loading skeletons
│   ├── empty state card
│   └── skill cards
│       ├── name
│       ├── permission status badge
│       ├── description
│       ├── enable / disable switch
│       └── manage button
├── Curated library section
│   ├── section header
│   ├── empty state card
│   └── library cards
│       ├── name
│       ├── description
│       ├── summary
│       ├── curated badge
│       └── add / installed button
├── Skill detail dialog
│   ├── title and description
│   ├── source / scope / permission badges
│   ├── permission panel with action menu
│   ├── example prompt block with copy action
│   ├── skill content block with copy action
│   ├── skill folder block with copy path action
│   ├── optional remove button
│   └── close action
└── New skill dialog
    ├── name
    ├── description
    ├── example prompt
    ├── instructions content
    └── create / cancel actions
```

```text
Tools
├── Header
│   ├── title
│   └── description
├── Standards runtime section (desktop only)
│   └── runtime row
│       ├── status label
│       ├── installed dataset version
│       ├── enable toggle
│       ├── progress bar and progress message
│       └── inline error
├── Global defaults section
│   ├── bulk enable / disable row
│   └── tool rows
│       ├── Search Standards
│       ├── Get Standard
│       ├── Get Learning Components
│       ├── Get Prerequisites
│       ├── Get Next Standards
│       ├── Get Crosswalk
│       └── Query Standards SQL
│           └── each row has state label + toggle
├── Notebook overrides section
│   ├── notebook selector
│   ├── selected notebook path
│   └── per-tool override rows
│       └── each row has select: inherit / enabled / disabled
├── Inline error message
└── Confirm remove standards runtime dialog
```

```text
Advanced
├── Header
│   ├── title
│   └── description
└── Single settings card
    ├── Discover external skills label
    ├── enabled / disabled badge
    ├── descriptive help text
    ├── on / off text
    └── toggle
```

```text
Attribution
├── Header
│   ├── title
│   └── description
├── Main attributions card
│   ├── Knowledge Graph row
│   ├── Evaluators row
│   └── OpenCode row
│       └── each row has external link + license badge
└── Additional attributions section
    └── Buddy row
        └── external link + license badge
```

## Current UI Patterns

- The settings page is a two-column experience, not a standalone centered preferences screen.
- The left rail is doing double duty:
  - notebook and thread navigation
  - settings tab navigation
- Most tabs use the same pattern:
  - header
  - one or more sections
  - each section is usually a card made of stacked setting rows
- `Skills` is the outlier:
  - no standard settings header/card pattern
  - much broader, more app-like management surface
- `Providers` is also a slight outlier:
  - it skips the usual page header and starts directly with two content sections
- Several tabs include modal subflows:
  - providers
  - MCPs
  - skills
  - appearance
  - tools

## Where The UI Feels Disorganized

- The left rail mixes chat/navigation concerns with settings navigation.
- The tabs do not follow one consistent density or information pattern:
  - some are simple stacked preference rows
  - some are management consoles with search, cards, and dialogs
- `Skills` is materially larger than every other tab and reads like its own feature area.
- `Providers`, `MCPs`, and `Skills` are management surfaces, while `Appearance`, `Notebook`, and `Advanced` are classic preferences surfaces.
- Desktop runtime management appears in two different places:
  - advanced math in `Appearance`
  - standards runtime in `Tools`

## Proposed Minimal Structure

```text
Settings
├── General
│   ├── Appearance
│   │   ├── color scheme
│   │   └── theme
│   ├── Defaults
│   │   ├── default persona
│   │   ├── default intent
│   │   └── full-text reading
│   └── App
│       └── check for updates
├── Providers
├── MCPs
├── Skills
├── Instructions
├── Advanced
│   ├── advanced math runtime
│   ├── standards runtime
│   └── external skill discovery
├── Attribution
└── Optional Features
    └── Standards
        ├── appears only after standards is enabled in Advanced
        ├── global defaults
        └── notebook overrides
```
