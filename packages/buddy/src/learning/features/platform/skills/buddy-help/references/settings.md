---
name: settings
description: "Buddy Settings tabs: General, Appearance, Browser, AI Providers, Skills, MCPs, Packages, Shortcuts, About; conditional Standards and Memory."
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
| Notes library | `notes.md` |
| Browser, profiles, link opening | `browser.md` |
| AGENTS.md / profile | `instructions.md` |
| Advanced math / Teaching standards packages | `extend.md` |
| App install / update channel | `setup.md` |
| Permission allow once/always | `trust.md` (not a Settings toggle) |

## Open

1. Left sidebar footer → **Settings** (defaults to **General**).
2. Left sidebar notebook context menu → **Notebook settings** (overrides only; not a Settings tab).
3. `/mcp` slash opens Settings → **MCPs**.

Settings is a full page. **Back to chat** returns to the prior chat/Bench location when recorded.

## Tabs

Tell the user: **Settings → \<tab\>**.

Core tabs (Browser appears on desktop):

| Tab | What lives there |
| --- | --- |
| **General** | **Show Try these** starter prompts; Follow-up **Steer** vs **Queue for later**; game-break frequency; concise responses; default way Buddy works; Read entire book; Auto-compaction; **Buddy Home**; **Notes library**; external-file opening; log level |
| **Appearance** | System/Light/Dark, a light theme and a dark theme (light pages in the reader use the light theme), chat and document typography |
| **Notifications** | Agent, permissions, errors |
| **Personalization** | Profile + global **AGENTS.md** |
| **Browser** (desktop) | Search engine, zoom, appearance, link opening, profiles (`browser.md`) |
| **AI Providers** | Connect and manage AI providers |
| **Skills** | Skills catalog; external skill discovery |
| **MCPs** | Global MCP definitions; per-server on/off by default |
| **Packages** | Optional package installs on desktop; **Memory** experiment opt-in |
| **Shortcuts** | Built-in keyboard shortcuts |
| **About** | Version; channel **Stable** / **Preview**; **Check now** (desktop only); attribution and licenses |

Revealed once the matching capability is on — each is independent:

| Tab | Appears when |
| --- | --- |
| **Standards** | Standards package installed, or the user's default way of working is **Teach** |
| **Memory** | Memory experiment enabled under **Packages** |

No live tab named Notebook, Advanced, Updates, or Attribution. Old `?tab=` links for those still
resolve: `advanced` / `labs` / `tools` / `teaching` / `learnerMemory` land on **Packages**,
`updates` / `attribution` on **About**, `chat` / `notebook` on **General**.

### Shortcuts

**Settings → Shortcuts** lists Buddy's built-in keys under Chats, Composer, Navigation, and Bench. Customization is not available yet. Common entries:

- Chats: **Cmd/Ctrl+N** new chat, **Cmd/Ctrl+Shift+[** / **]** previous / next chat.
- Navigation: **Cmd/Ctrl+L** chat input, **Cmd/Ctrl+Shift+F** Search (Bench New tab page), **Cmd/Ctrl+P** Quick open (the New tab search in a popup), **Cmd/Ctrl+B** sidebar.
- Bench: **Cmd/Ctrl+Option/Alt+B** toggle Bench, **Cmd/Ctrl+1–8** go to that tab, **Cmd/Ctrl+9** last tab; desktop **Cmd/Ctrl+T** New tab and **Cmd/Ctrl+W** close tab (on Mac, with no tab on screen, Cmd+W closes the window).

Number keys switch Bench tabs, not chats. The Note mode shortcut works while the composer is focused.

## Notebook settings (separate)

Left sidebar notebook context menu → **Notebook settings**.

Controls for **this notebook only**:

- Memory participation + auto-extract (shown only when the experiment is enabled)
- Standards toggles (if Standards installed)
- Per-MCP on/off; global definitions live under Settings → MCPs, while notebook-only definitions can also appear here

Autosave. Does **not** set theme, providers, or global profile.

## Global vs local

- **Settings page** = machine-wide defaults + app UI prefs.
- **Notebook settings** = one notebook’s overrides.
- Prefer the UI unless the user is already editing instruction files (e.g. `AGENTS.md`) on disk.

## Gotchas

- Appearance is its own tab; so are Notifications and Packages.
- Standards tab missing → Standards package not installed and the user is not a teacher (`extend.md`).
- Updates live under **About**; updates / package install need the **desktop** app.
- Memory experiment off → the Memory tab, its settings, and notebook controls are hidden.
- Permission “allow always” is the live permission prompt, not a Settings preference (`trust.md`).
