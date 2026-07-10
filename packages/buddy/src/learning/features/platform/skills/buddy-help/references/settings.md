---
name: settings
description: "Buddy Settings tabs: General, Updates, Providers, MCPs, Personalization, Memory, Advanced."
---

# Settings

Use when the user asks where a preference lives, how to open Settings, or what a Settings tab does.

Route the **user**. Never claim you navigate Settings yourself.

Deep topics stay thin here — open the sibling ref when the question is the feature:

| Topic | Open |
| --- | --- |
| Providers / API keys / ChatGPT | `providers.md` |
| MCP servers | `extend.md` (UI); `config-mcp.md` (file edit) |
| Memory | `learner-memory.md` |
| AGENTS.md / profile | `instructions.md` |
| Advanced Math / Standards packages | `extend.md` |
| App install / update channel | `setup.md` |
| Permission allow once/always | `trust.md` (not a Settings toggle) |

## Open

1. Left sidebar footer → **Settings** (defaults to **General**).
2. Notebook header context menu → **Notebook settings** (overrides only; not a Settings tab).
3. `/mcp` slash opens Settings → **MCPs**.

Settings is a full page. **Back to chat** returns to the prior chat/Bench location when recorded.

## Tabs

Tell the user: **Settings → \<tab\>**.

| Tab | What lives there |
| --- | --- |
| **General** | Appearance (System/Light/Dark, theme, fonts); follow-up **Steer** vs **Queue for later**; game-break frequency; notifications (agent, permissions, errors) |
| **Updates** | Channel **Stable** / **Preview**; check for updates. Desktop app only |
| **Providers** | Connect and manage AI providers |
| **MCPs** | Global MCP definitions |
| **Personalization** | Profile + global **AGENTS.md** |
| **Memory** | Experiment opt-in, notebook defaults, models, tuning |
| **Advanced** | Packages; log level; Read entire book; Auto-compaction; **Buddy Home**; external skill discovery |
| **Attribution** | Third-party credits (read-only) |
| **Standards** | Optional — only when Standards package is enabled |

No live tab named Notebook or Appearance (Appearance lives under **General**).

## Notebook settings (separate)

Notebook header context menu → **Notebook settings**.

Overrides **this notebook only** (Inherited / Override):

- Memory participation + auto-extract (shown only when the experiment is enabled)
- Standards toggles (if Standards installed)
- Per-MCP on/off (definitions stay under Settings → MCPs)

Autosave. Does **not** set theme, providers, or global profile.

## Global vs local

- **Settings page** = machine-wide defaults + app UI prefs.
- **Notebook settings** = one notebook’s overrides.
- Prefer the UI unless the user is already editing instruction files (e.g. `AGENTS.md`) on disk.

## Gotchas

- Appearance is under **General**, not its own nav item.
- Standards tab missing → Standards package not enabled (`extend.md`).
- Updates / package install need the **desktop** app.
- Memory experiment off → memory settings and notebook controls are hidden.
- Permission “allow always” is the live permission prompt, not a Settings preference (`trust.md`).
