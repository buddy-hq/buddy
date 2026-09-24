---
name: extend
description: "Extend Buddy: Skills drawer, MCP servers, Advanced math and Teaching standards packages."
---

# Extend

Use when the user asks how to add capabilities: **Skills** (right rail), **MCP** servers, or optional **Advanced math** / **Teaching standards** packages.

Not desktop app install (`setup.md`). Not AGENTS.md profile (`instructions.md`).

## Skills

Use when the user asks how skills work, how to install or block them, or how skills show up for the agent.

Not app install (`setup.md`), MCP (MCP below), optional runtimes (Packages below), or AGENTS.md (`instructions.md`).

### What a skill is

A skill is a package of workflow instructions Buddy loads on demand. Not a separate app, provider, or MCP server.

**UI:** Skills has two separate entry points: the **right workspace rail** drawer inside a notebook and **Settings → Skills** on the full Settings page. Both expose the catalog; Settings also holds external skill discovery.

### Open Skills

1. Right workspace rail → **Skills** (near Files / Notebook Instructions; separator before it), or Settings → **Skills**.
2. Browse the one catalog list: **Your skills** (already on this machine) and **Available to add** (curated skills). Settings shows the same catalog in a wider layout.

Search shows matching results from the catalog. Refresh rescans it.

Drawer unavailable while Bench is **floating** — dock chat for the rail.

### Install / update / remove

- Install curated skills from **Available to add**. Network required. Bad or mismatched downloads fail safely.
- **Update** when the catalog has a newer reviewed version (row action, detail dialog, or **Update all** when offered).
- **Remove** uninstalls that curated skill from this machine (from the skill detail dialog).
- Withdrawn catalog skills cannot be reinstalled; remove only if still present.

External skills outside this catalog are never “Install” targets here.

### Allow / block

On installed skill rows (and the detail dialog): **Active** switch (list shows **On** / **Off**).

| Switch | Effect |
| --- | --- |
| On | Skill may appear and can be used. |
| Off | Not loadable for the agent. |

- Rules are **by skill name, machine-wide** — not per notebook.
- Blocking is not the same as Remove: files can remain until Remove.
- Built-in (system) skills: block only; cannot remove.

### How skills show up

- When the user names a skill or the task matches a skill description, Buddy can load it for that turn.
- User may also invoke via slash if the catalog lists the name.
- Installed detail shows **source** (System / Curated / Custom / Detected) and **scope** (Global / Workspace).

### External discovery (optional)

Settings → **Skills** → **Discovery** → **Discover skills from .agents and .claude folders**.

- Off by default.
- When on, those skills can appear among **Your skills** as **Detected**.
- Outside the curated catalog: not approved catalog installs.

### Gotchas

- **Off ≠ uninstalled** — turn Active on to restore without reinstall if files remain.
- **Name collisions** key off skill **name** globally.
- **No reachable “New skill” control** in the current Skills UI — do not invent one.
- Some built-in skills may be hidden from Buddy’s list.
- The notebook Skills drawer is on the **right rail**, not the left sidebar. **Settings → Skills** is a separate full-page surface.

### Related

`trust.md`, `settings.md`, `chat.md`

## MCP

Use when the user asks how to add MCP servers, enable them per notebook, connect/sign in, or why tools from an MCP are missing.

External servers only. Skills: Skills above. Permission prompts: `trust.md`. Hand-edit files / agent enable via config: `config-mcp.md`.

### What it is

MCP servers give Buddy **extra tools** from outside apps (hosted URL or a local command).

- User manages **server definitions** and **which notebooks use them**.
- When a server is **Connected**, its tools show up for the agent in that notebook.
- MCP tool calls still go through the **permission** flow — not auto-silent.

### Where

| Job | UI |
| --- | --- |
| Add / edit / remove definition | **Settings → MCPs** |
| On/off for this notebook + Connect / sign-in | Notebook settings → **MCP servers**; Connect also appears in Settings → MCPs for the active notebook |
| Jump to Settings MCPs | Chat slash **`/mcp`** |

Settings → MCPs edits **global** definitions. Notebook config can also supply a notebook-specific definition; notebook settings lists those alongside global servers.

### Golden path

1. **Settings → MCPs → Add MCP.**
2. **Remote** (default): name, URL. Leave **Browser sign-in** on for hosted OAuth. Optional headers only if not using browser sign-in; do not set Authorization **and** browser sign-in together.
3. **Local**: name + command. Optional env. Command must run on this machine.
4. Leave **Enabled by default** on unless notebooks should start off.
5. Save. Notebook settings → **MCP servers** → **On** if needed.
6. **Sign in required** / **Needs setup** / not Connected → **Connect**. Complete browser auth when asked.
7. **Connected** → those server tools can appear (user may still Allow / reject).

### Status

| Label | Meaning |
| --- | --- |
| Connected | Tools available |
| Disabled | Off for this notebook (or definition off) |
| Failed | Connect/start failed — check URL, command, network |
| Sign in required | Finish OAuth / auth (Connect) |
| Needs setup | Client/auth setup still required — Connect |

### Defaults

- New remote draft: Remote, Browser sign-in on, enabled by default.
- Timeout optional — leave blank unless the provider requires it.
- Changing definitions updates open notebooks.

### Guardrails

- Tell users **Settings → MCPs** or notebook settings.
- Prefer UI nouns for users; MCP tools appear when **Connected**.
- Never claim MCP tools skip permissions.
- Never invent server names or OAuth fields the user did not configure.
- Do not send users to outside CLI auth tools — use **Connect** in Settings → MCPs or notebook settings.

### Gotchas

- **Defined but off** — notebook switch Off → no tools.
- **Enabled but not Connected** — Failed / Sign in required → no tools until Connect succeeds.
- **Local MCP** — missing binary/args/env → Failed.
- **Name and type locked after create** — remove and re-add to rename or switch type.
- **Auth vs headers** — Browser sign-in and Authorization header are mutually exclusive.

## Packages

Use when the user wants optional **Advanced math** or **Teaching standards** on this machine, or why math/standards features are missing.

Not app install (`setup.md`). Not skills (Skills above). Not MCP (MCP below).

### What they are

Two **optional local packages**. Desktop only. **Settings → Packages**.

| Package (UI) | What user gets | Unlocks (when ready) |
| --- | --- | --- |
| **Advanced math** | Local math/graph runtime | Advanced math / calculator capability |
| **Teaching standards** | Local teaching-standards database | Standards lookup capabilities |

Without the package installed and **ready**, those capabilities stay unavailable.

### Install / remove

1. Open **Settings → Packages**.
2. Flip the package switch **on** to install (progress may show).
3. Flip **off** → confirm remove → package leaves this device (reinstall anytime).

**Advanced Math on Windows:** UI shows **Coming soon** — no install switch. Use macOS for Advanced Math today.

**Web:** Packages tab can show experimental features, but local runtime package controls are desktop-only.

Prefer a new user message after install if features still look missing; do not invent “must restart Buddy” as required.

### After Standards is on

- **Settings → Standards** appears when the package is installed or the user's default way of working is **Teach**. Before install, it offers the package path.
- Global defaults: bulk **All standards tools** or per-item on/off. Defaults: **on**.
- Per-notebook controls: notebook settings → Standards; **Use global default** is available for an overridden item.

Package can stay installed while individual standards items are toggled off.

### Gotchas

- **Missing after install:** package must reach **ready**; Standards also needs global/notebook toggles on.
- Geometry teaching figures are separate from the math package.
- **Install error:** row shows error text; need network unless local assets already present.
- **App update while package enabled:** may auto-repair in background.
- Do not invent curriculum inventory lists the UI does not promise.
