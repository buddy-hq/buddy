# Launch Positioning

Working document for the launch refactor of `packages/site`. Keep it short. Update the status
table as work lands; append to the decision log instead of rewriting history.

## 1. What Buddy is (author's own words)

From the positioning thread, 2026-08-03:

- Positioned as a **learning companion**, not yet a single sharp use case. That ambiguity is
  accepted for launch, not papered over.
- The origin story: learning the old way (note-takers, Notion) was not working. Coding agents
  (Claude Code) helped, but lacked the integrations learning needs — a reader, most of all.
- So Buddy is **an agent-first base for everything learning**: notes, learning tools (games,
  simulations), and research material in one place.
- A lot of what ships today is experimental and will be stripped back once real usage says
  what the core is.

Video copy (`packages/videos/src/launchCopy.ts`, demo-video worktree) already commits to a
tighter line, and it should be the site's line too:

> **An AI Agent for the Curious.** — Feynman cold open, "the pleasure of finding a thing out."

Video beat order, which is effectively the approved narrative:
Feynman → agent + whiteboard → **books** → **notes (Obsidian)** → simulation/game → **research**
→ bring your own model ("50+", ChatGPT hero) → feature wall → free desktop app, Mac + Windows.

## 2. Segments, and which one we're launching to

| # | Segment | Status at launch |
|---|---------|------------------|
| 1 | Students | **Not now.** Blocked on no web/phone build; cloud agents are expensive. |
| 2 | Obsidian / Notion / Miro / tldraw / Kindle users | **This is the launch target.** |
| 3 | School teachers | Test after launch. |
| 4 | Homeschoolers | Later experiment. |

**Consequence:** the launch site speaks to segment 2 only. Teachers keep a page, not the
front door. Nothing on the landing page should be written for a student or a teacher.

## 3. The three launch pillars

Everything on the landing page must serve one of these. If it doesn't, it is experimental
surface area and gets cut or demoted.

1. **Feynman** — why you'd want this at all. Curiosity for its own sake, the pleasure of
   finding things out. Owns the hero and the closing.
2. **Obsidian** — the tool-crowd handshake. Your vault, your files, wikilinks, plain markdown.
   This is what makes segment 2 recognise themselves. Currently buried as feature #5.
3. **Research** — the reason to switch. Reader + whiteboard + web + subagents in one place, on
   your machine, over your own material. Currently has no home on the page at all.

## 4. Claims and guardrails

- Free. No pricing page, no subscription, no account.
- Local-first: files on your machine, only model calls leave.
- Bring your own AI: ChatGPT login, API keys, Ollama, free models included, 50+ providers.
- A real agent (Claude Code / Codex breed), not a chatbot wrapper.
- **Never** say open source. Buddy is not open source (see `packages/site/AGENTS.md`).

## 5. Gap: what the site says now vs. what launch needs

The landing page today (`AudienceLanding.astro`) renders:
Header → Hero → LearnerLives → FeatureSteps (READ / DRAW / PLAY / REMEMBER / CONNECT) →
Answers → Install → Footer.

| Gap | Detail |
|---|---|
| Obsidian is last | "CONNECT · Buddy speaks Obsidian" is feature 5 of 5. For segment 2 it is the headline. |
| Research is missing | No section. The video gives it a whole beat; the site has nothing. |
| Bring-your-own is unrendered | `bringYourOwn` and `capabilities` exist in `site.ts`, but `BringYourOwn.astro` / capability layouts are not in the page. The 50+ provider story survives only as FAQ answer #4. |
| Audience toggle costs the front door | Learner/educator toggle in the header splits attention across two segments when only one is being launched to. |
| "For everything you'll ever learn" | Breadth-first section (chess, sourdough, French, cardiology) right under the hero. Charming, but it argues breadth to an audience that needs to see depth in *their* tools. |

Copy itself is in good shape. This is a **sequencing and emphasis** problem, not a rewrite.

## 6. Visual audit (measured, not vibes)

Screenshots taken against the running dev server at `localhost:4321`.

### 6a. It is too dark

Measured token values in `src/styles/global.css`:

| Token | Value | Renders as |
|---|---|---|
| `--background` | `oklch(0.145 0 0)` | ≈ `#0a0a0a` |
| `--color-mock-panel` | `oklch(0.13 0.004 285)` | ≈ `#080808` |
| `--color-mock-bg` | `oklch(0.09 0.002 285)` | ≈ `#020202` — effectively pure black |
| `--card` | `oklch(0.205 0 0)` at **45% alpha** | collapses back toward the page |

The product mocks — the single most important thing on the page, the only proof the app
exists — are painted **darker than the page they sit on**, at near pure black. There is no
surface ladder: page, section, card, and panel all land within ~0.1 L of each other, so
nothing reads as raised, and screenshots of a dark app disappear into a dark page.

Target: lift the floor to roughly `L 0.19–0.22` and give each level a real step
(≈ +0.035 L per level), so mocks sit *above* the page instead of below it.

### 6b. Everything has an orange tint

Counted across `src/**/*.{astro,css}`:

- **365** references to `--color-accent-primary` / `-secondary`
- **234** raw `rgba(255, 107, 0, …)` literals
- **116** hardcoded `#ff6b00`

Two compounding problems:

1. **Leakage.** ~350 hardcoded orange literals bypass the token layer entirely, so the accent
   cannot be changed centrally — it has to be hunted down.
2. **Glow abuse.** `--color-accent-primary-glow` and friends are radial-gradient washes at
   12–15% laid over section after section. Against a near-black ground, a warm 15% wash is
   the *only* chroma on screen, so the page reads brown. Worst offenders: the REMEMBER
   section and the flashcard tiles, where the wash swallows the mock underneath.

Orange is not the problem; orange as ambient light is. Target: accent appears on the CTA, on
eyebrows, and on at most one focal element per section. Zero full-section glows. Neutral
surfaces stay neutral (C ≤ 0.008).

### 6c. One accent or two?

The product has already answered this, and the site never got the memo.

`packages/web/src/components/onboarding/cinematic/` ships a **two-colour** system. Its nebula
is authored in pinks and magentas, then run through `hue-rotate(295deg) saturate(1.3)`, so
what actually renders is violet and blue:

| Authored | Renders as | Hue |
|---|---|---|
| `rgba(255, 0, 85, …)` | `#8a0dff` | 271° violet |
| `rgba(186, 104, 200, …)` | `#4c85ec` | 219° blue |
| `rgba(236, 72, 153, …)` | `#855aff` | 256° indigo |
| core `rgba(255, 64, 129, …)` | `#a64aff` | 271° violet |

Over that violet ground sits the Ember brand orange — `#FF6A2C`, `#FF8A4C`, `#FF9256`
(`THEMES.nocturne` in `cinematic/constants.ts`). So the app runs **violet as ambient, orange
as brand**. The app icon is a third data point: orange, black, white, and a warm cream page —
no violet at all.

The site, by contrast, runs a **one-colour** system where the single colour is doing both
jobs — accent *and* ambient — which is exactly why it reads as tinted rather than branded.

Two accents are worth having only if each one owns a job a reader can name. The proposal on
the table:

- **Orange = action.** Anything you can click. CTA, download, install.
- **Violet = agent.** Things Buddy did: its mark on the whiteboard, the active row, the
  highlight it left in your text, section eyebrows.

**Settled: one accent.** The violet directions were built and rejected — a violet ground read
as too blue, and the orange = action / violet = agent split needed that ground to work. The
site stays a one-accent system on a cool neutral. Violet remains the onboarding's own
atmosphere inside the app; it does not travel to the marketing site.

The live question is no longer *how many* accents but *how loud* the one accent is — which is
what Slate, Bone, and Copper each answer differently.

## 7. Plan

Iterative, prototyped in the site's own devtools easel before anything touches the real page.

| # | Step | Status |
|---|---|---|
| 1 | This document | Done |
| 2 | Devtools + Easel for `packages/site` at `/devtools` | Done |
| 3 | Narrow to the Ink family | Done |
| 4 | Theme contract (`src/styles/theme.ts`) + live switcher on the site | Done |
| 5 | Port components onto tokens; kill glows; rebuild the mock ladder | In progress |
| 6 | Pick the theme | Blocked on 5 |
| 7 | Resequence the page around Feynman / Obsidian / Research | Not started |
| 8 | Render bring-your-own + capabilities on the landing page | Not started |
| 9 | Decide the fate of the audience toggle | Not started |
| 10 | Delete the dead galleries (`archive/`, `pages/layouts*`, `components/layouts/*`) | Not started |

### Switching themes

`src/styles/theme.ts` is the single source of truth. `ThemeStyles.astro` emits `:root` plus a
`[data-theme="…"]` block per theme into `<head>`; `ThemeSwitcher.astro` is a floating control
rendered only under `import.meta.env.DEV`, bottom-right of the landing page. The pick is kept
in localStorage, not the URL, so it carries across `/`, `/teachers`, and `/devtools` with no
cross-page state to reason about.

The easel renders `THEMES` directly, so the prototype and the real site cannot drift.

### The Easel

`/devtools` in the site dev server. Same idea as the easel in `packages/web`: a prototype
picker, a subtitle, and a stage. Prototypes are single files in `src/devtools/easel/`,
registered in `src/devtools/registry.ts`. They are throwaway — never tested, never reviewed.

Live prototype — **Surfaces**: one slice of page (eyebrow, headline, CTA, product mock, a
paper reading card) rendered in each palette.

**Ink is the chosen family.** Its variants vary the accent's hue, the accent's count, and the
base's depth — never the accent's intensity.

| | Direction | Ground | Accent |
|---|---|---|---|
| — | Now | near-black + orange wash | one, doing both jobs |
| B | Ink | cool neutral, L 0.21 C 0.014 @ 264 | orange C 0.19 |
| C | Ink · Signal | **identical to B** | orange **C 0.205** — hotter than the live site |
| D | Ink · Duo | identical to B | **orange + teal** (`#2dd4bf`), both full chroma |
| E | Ink · Midnight | **L 0.192 C 0.026** — deeper, richer | orange C 0.205 |
| F | Panda | neutral | orange, CTA only — kept as reference |
| G | Vellum | cool chrome, **cream doc pane** | orange — kept as reference |

**Rule learned: do not desaturate.** Slate, Bone, and Copper all lowered chroma or raised
lightness to make the orange "calmer" and all three read as pale — the wrong kind of quiet.
The cool base is what stops orange becoming a tint; the orange itself does not have to be
timid. Vary hue, count, and depth instead.

Dropped after review: **Graphite** (pure neutral — Panda covers it), **Ember** (warm ground),
**Nocturne** (violet ground — read as too blue), **Two Accents** (needed Nocturne's ground),
**Slate** / **Bone** / **Copper** (all pale).

## 8. Theme refactor: what it takes

Goal: picking a palette in the easel re-themes the real landing page. Scope is only what
`index.astro` and `teachers.astro` actually reach — the `archive/`, `pages/layouts*`, and
`components/layouts/*` galleries are not on the page and are out of scope.

There is no brand palette to preserve. The orange in the code today is not a brand decision,
it is just what got typed. Nothing in the existing colour carries authority, so this is an
overhaul: components end up with **no colour of their own**, and the theme supplies all of it.

### 8a. Two kinds of colour, and only one is themed

- **Structural** — page, surfaces, borders, text, accent. Every one of these becomes a token
  and is owned by the theme. Components stop containing colour entirely.
- **Depicted** — book covers, the chess board, syntax highlighting, the panda, the quiz's
  green tick and red cross. This is *illustration inside a screenshot*, not theme. It stays
  literal in its own frozen palette and does not move when the theme moves. Trying to
  tokenize the panda is how this becomes unfinishable.

The one structural pattern worth calling out: the surface ladder is currently faked with
translucent white (`rgba(255,255,255,0.02–0.15)`). Over a near-black ground that barely lifts
anything, which is *why* the page reads flat. These become **opaque surface tokens**, not
tokenized alpha — same fix as "lift the floor," and the single highest-value change here.

### 8b. Centralise

- **`src/styles/theme.ts`** — themes as typed data, one entry per palette, the same shape the
  easel already uses. Single source of truth.
- **Semantic tokens, not colour names.** Components reference roles — `--surface-raised`,
  `--border-weak`, `--accent-fill`, `--text-weak` — never `--orange-500`. A theme with a
  different accent hue must not break call sites.
- **Emit `[data-theme="…"]` blocks** from `theme.ts` into global CSS. Astro's scoped styles
  scope *selectors*, not custom properties, so inherited vars cross the scope boundary
  untouched. Switching is `document.documentElement.dataset.theme = id` — no rebuild, no FOUC,
  works on a static page.
- **The easel imports `theme.ts` too**, so prototype and production cannot drift.

### 8c. Order of work

1. Land the token contract and `theme.ts`. Nothing renders differently yet.
2. Strip and re-dress `components/WorkspaceMock.css`. One file, more colour in it than
   everything else combined — do it first and the page is most of the way there.
3. The section components: Hero, FeatureSteps, InstallSection, LearnerLivesSection, Header,
   WhySection, and the feature mocks and artifacts.
4. Split the illustration palette out so it stops being confused with theme.
5. Wire the switcher; point the easel at the real tokens.
6. Delete the dead galleries — `archive/`, `pages/layouts*`, `components/layouts/*`. They are
   not on the page, and leaving them means re-reading them every time we grep for colour.

### 8d. Traps

- `FeatureSteps.astro` sets colour with `!important`. Those win against tokens, so they go
  first or the swap silently does nothing.
- Re-tokenizing alpha instead of moving to opaque surfaces keeps the page flat. The problem
  was never the colour of the scrims, it is that scrims can't build a ladder.

## 9. Decision log

- **2026-08-04** — Launch to segment 2 (Obsidian/Notion/Miro/tldraw/Kindle crowd). Students
  wait on a web build; teachers get tested after launch.
- **2026-08-04** — Three pillars fixed: Feynman, Obsidian, Research.
- **2026-08-04** — Dark mode stays, but the floor comes up and section-wide orange glows go.
- **2026-08-04** — **Ink is the family**: cool neutral ground, warm accent. Ember and the
  warm-ground family are out. Now is out.
- **2026-08-04** — **One accent, not two.** The violet ground read as too blue, and the
  orange = action / violet = agent split depended on it. Violet stays inside the app's
  onboarding and does not come to the site.
- **2026-08-04** — **Never desaturate to calm something down.** Softened orange, bone CTA,
  and copper all read pale. Saturation is not what makes the current site look tinted — the
  near-black ground is. Vary hue, accent count, or base depth instead.
- **2026-08-04** — Open: Ink as-is, Signal (hotter orange), Duo (orange + teal), or Midnight
  (deeper, more saturated base).
- **2026-08-04** — **`ink-signal` is the default.** Ink stays the family; Signal's hotter
  orange is the shipped accent. The other three stay switchable for comparison.
- **2026-08-04** — **`--text-*` is a size scale, never a colour.** A colour token named
  `--text-base` collided with the fluid type scale in `global.css`; `color:` resolved to a
  `clamp()`, fell back to black, and put black text on black across the whole site. Colour
  text tokens are `--fg-strong / base / weak / weaker` and must stay that way.
- **2026-08-04** — **Ladder rungs are ~0.045 L apart.** At ~0.03 the eye reads two adjacent
  surfaces as one grey, which is why the page looked flat despite having a ladder.
- **2026-08-04** — **Elevation comes from the surface ladder, not shadow.** `--shadow-raised`
  and `--shadow-overlay` are deliberately near-invisible. The `0 30px 60px rgba(0,0,0,0.85)`
  drops on the teacher artifacts (some tinted orange) were the "brutal shadows" — all gone.
- **2026-08-04** — **One aurora violet** replaces the scattered blues, teals and purples
  across the mocks (Obsidian tile, diagram branches, music tile, lesson segments). Use
  `--aurora-base` on dark, `--aurora-ink` on paper — the light variant has no contrast on a
  worksheet.
- **2026-08-04** — **Product shots get their own family.** `--chrome-*` is to mocks what
  `--paper-*` is to reading surfaces: one material used by the hero window (both audiences),
  the reader, the whiteboard and the game. Two rules: the mock ground (`--chrome-panel`)
  sits a clear step BELOW `--surface-page`, and it carries the page's hue. A mock lighter
  than the page reads as another section of website; darker reads as a screen embedded in
  one. `--board-*` is a rung of this family, not a family of its own.
- **2026-08-04** — **Mocks never reference `--surface-*`.** Those are page tokens. Inside a
  product shot they are what made the mock look like more website.
- **2026-08-04** — The audience toggle lives in the **footer**, not the header — launch
  targets one segment, so it is not navigation.
- **2026-08-04** — Depicted colour that deliberately stays literal: correctness greens,
  error reds, highlighter inks, macOS traffic lights, book covers, the Obsidian brand mark,
  the green→amber→red gauge scales, and the support/core/extension three-tier encoding on
  the differentiation artifacts (three levels need three distinguishable hues — that is data,
  not decoration).
