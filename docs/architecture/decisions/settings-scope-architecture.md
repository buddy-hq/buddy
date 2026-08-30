# Settings Scope Architecture & Tab Taxonomy

## Status

**Product rule (in force):** settings are **global-first**. Notebook behavior is an explicit override, not the default meaning of `/settings`.

**Target (not shipped as types or layout):** a `scope` field on each tab (`global` | `notebook` | `mixed` | `info`) and a three-tier mixed-tab contract. There is **no** `SettingsScopeClass` (or equivalent) in `packages/web/src/components/settings/settings-tabs.tsx`. Tabs use `id`, `layout`, optional `reveal`, not scope metadata. Proposed hooks `useGlobalSettings()` / `useNotebookSettings()` / `useMixedSettings()` do not exist.

Related: [OpenCode Decoupling](../decoupling/about.md). Open UI bugs: [known issues](../../reviews/knownissues.md) (e.g. OBS-003 vault open from Settings).

---

## 1. Product rule

- A tab is global unless it **explicitly** supports notebook customization.
- Notebook-specific behavior is framed as an override on global defaults.
- Informational pages are `info`, not configuration.
- `/settings` is a global-first shell. Notebook selection and empty states appear only where the active tab needs a notebook.

---

## 2. Target taxonomy (unshipped)

Intended primary class for every tab:

```ts
type TSettingsScopeClass = "global" | "notebook" | "mixed" | "info"
```

| Class | Meaning | Without a notebook |
|---|---|---|
| `global` | Machine-wide prefs and runtime | Fully usable |
| `notebook` | Workspace-only resources | Empty state: select a notebook |
| `mixed` | Global defaults + optional notebook overrides + optional effective preview | Globals work; overrides wait for a notebook |
| `info` | Read-only app/legal metadata | Fully usable |

Target mixed-tab **layout** (reference pattern from the end-state plan: Learner Memory, then Standards):

```text
1. Global defaults
2. Notebook customization (inherit / enabled / disabled)
3. Effective behavior (resolved runtime for the active notebook)
```

Tab definitions should eventually declare `scope`, whether notebook selection is relevant, and whether notebook-empty UI is shown, so the shell can badge and copy from metadata instead of special cases.

Target backend: global keys in global app config; notebook keys in notebook config; do not fake ownership with merged payloads plus frontend splitting.

---

## 3. Shipped tabs (`settings-tabs.tsx`)

`SettingsTab`: `general`, `appearance`, `notifications`, `personalization`, `providers`, `skills`, `mcps`, `packages`, `about`, plus reveal tabs `standards` and `memory`.

Capability tabs use `reveal`: Standards if standards are enabled or `primaryUse === "teach"`; Memory if the learner-memory experimental flag is on. Hidden capability deep links fall back to **Packages** (`CAPABILITY_FALLBACK_SETTINGS_TAB`), which holds the switches.

Retired `?tab=` aliases (must resolve to a **core** tab): `chat` / `notebook` → `general`; `tools` / `teaching` / `learnerMemory` / `advanced` / `labs` → `packages`; `updates` / `attribution` → `about`.

| Tab id | Current behavior vs target class |
|---|---|
| `general` | Global. Includes log level via `patchGlobalConfig({ logLevel })`. |
| `appearance` | Global first-class tab (not a leftover unused panel). |
| `notifications` | Global. |
| `personalization` | Global (persona / instructions-style prefs; there is no `Global Instructions` tab id). |
| `providers` | Framed global. Catalog reload still walks `openProjects` directories — remaining coupling. Credentials should stay machine-global; notebook may still affect **model resolution**. |
| `skills` | Mixed in practice: global “discover external skills” + directory-scoped catalog (`SkillsCatalogSurface`). Not three-tier layout. |
| `mcps` | Notebook-oriented (selected notebook servers). |
| `packages` | Global capability switchboard (runtimes / experimental packages). Replaces retired `advanced`. |
| `about` | Info (licenses/attribution content lives here; `attribution` is an alias). |
| `standards` | Reveal tab. **Shipped UI is global tool defaults only** (`patchGlobalConfig`). Target remains mixed (per-notebook inherit/enabled/disabled + effective preview) — **not implemented**. |
| `memory` | Experimental reveal. **Shipped UI is global defaults** (`useGlobalLearnerMemorySettings` / `GlobalDefaultsSection`). Target remains mixed — **not implemented**. |

There is no `advanced`, `Global Instructions`, `Advanced Runtime`, or standalone `Licenses` tab in the registry.

---

## 4. Historical coupling lessons (closed unless noted)

These were real mismatches between UI framing and storage. Do not re-open them as current Settings defects.

| Lesson | What went wrong | Where it landed |
|---|---|---|
| Discover external skills | Toggle looked global (`Advanced`) but persisted as project skills settings | `skills.settings.patch` writes **global** `skills_external_vendor_roots_enabled` (`packages/buddy/src/routes/skills.ts`). Catalog install/mutations remain directory-scoped. |
| Advanced + notebook log level | One tab mixed machine runtime installs with notebook diagnostics | `advanced` retired → `packages`. Log level is **global** on General. |
| Attribution as a settings tab | Info content sat beside configuration | Aliased to `about`. |
| Appearance overlap | Plan-era `AppearanceSettings` looked unused vs General | Appearance is a shipped core tab. |
| Instructions split | Plan left “settings owns only global AGENTS.md” vs dual surfaces **open** | Personalization / global agents markdown panels — not a second Instructions tab. |

**Still watch:** Providers catalog/auth paths that key off notebook directories while the tab reads as machine-global (`settings-providers.tsx` `openProjects` reload).

---

## 5. Target follow-through (not a claim of current code)

When a tab actually has notebook overrides, use the three-tier contract. Promote `scope` on `SettingsTabDefinition`. Align backend contracts with that scope so agents do not need to reverse-engineer ownership. Success: a reader can tell global vs notebook vs mixed vs info without reading implementation, global tabs work with no notebook, notebook-only tabs have a clear required state.
