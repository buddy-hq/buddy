---
name: config-mcp
description: "Hand-edit Buddy MCP config: global and notebook definitions, enable overrides, local/remote shapes."
---

# Config MCP

Use when the task is to **enable or add MCP via config files** (not UI walkthrough alone). UI path still: `extend.md`.

Goal for the agent: make a named MCP **enabled for a notebook** by editing Buddy config. Configured ≠ Connected (OAuth/connect may still be needed).

## Authority

- **Buddy-owned config only.** Edit `buddy.jsonc` / `buddy.json` under Buddy paths below.
- **Do not** rely on repo-root or project `opencode.jsonc` MCP alone. Buddy treats MCP as **authoritative from Buddy config** — OpenCode-only entries do not show in Buddy MCP status/tools.
- Prefer UI for users who should not touch files (`extend.md`). This ref is for agents/power users editing files.

## Files

| Scope | Path | Role |
| --- | --- | --- |
| Global definitions | Default packaged path: `~/.buddy/buddy.jsonc` (or existing `buddy.json`) | Full definitions here appear in **Settings → MCPs** and notebook settings. |
| Notebook / project | `<notebook-root>/.buddy/buddy.jsonc` (or existing `.json`) | Per-notebook enable overrides **or** full notebook-only definitions; these appear in notebook settings. |

- Create parent `.buddy/` if missing.
- Prefer **jsonc** when creating new files.
- Notebook root = workspace folder the notebook opened (not Home/Inbox magic alone — use the open directory path).
- Dev builds and configured runtimes can relocate the global config. Check the running Buddy environment's `BUDDY_GLOBAL_CONFIG_DIR` before assuming `~/.buddy` is live.

### Where definitions appear

| Action | Where |
| --- | --- |
| **Show or edit a definition in Settings → MCPs** | Put its full definition in the live **global** Buddy config. |
| **Use a server only in this notebook** | A full definition may live in the notebook config; **Notebook settings → MCP servers** lists it. |
| **Override global on/off for one notebook** | Put a thin `{ "enabled": true\|false }` entry in notebook config. |

**Settings → MCPs** lists global definitions. Notebook settings combines global definitions, notebook definitions, and live server status. Put definitions in global config when the user expects to manage them from Settings.

## Enable resolution

For each MCP **name**:

1. Start with global `mcp.<name>` when present.
2. Merge notebook `mcp.<name>` over it. A thin `enabled` entry changes only that field; a full notebook entry can define a new server.
3. Omitted or `true` `enabled` means on by default; `false` means off.

To **enable for this notebook only** when already defined globally:

```jsonc
{
  "mcp": {
    "SERVER_NAME": {
      "enabled": true
    }
  }
}
```

Write that under `<notebook-root>/.buddy/buddy.jsonc`. Merge with existing keys; do not wipe unrelated config.

To **disable** for this notebook:

```jsonc
{
  "mcp": {
    "SERVER_NAME": {
      "enabled": false
    }
  }
}
```

## Full definition shapes

Buddy accepts OpenCode-compatible MCP entries under top-level `mcp` map. Keys = **server names** (stable ids).

### Local

```jsonc
{
  "mcp": {
    "shadcn": {
      "type": "local",
      "command": ["npx", "-y", "shadcn@latest", "mcp"],
      "enabled": true
      // "environment": { "FOO": "bar" },
      // "timeout": 30000
    }
  }
}
```

- `command`: argv array. First element = executable; rest = args.
- `environment`: optional string map.
- `timeout`: optional positive ms.

### Remote

```jsonc
{
  "mcp": {
    "docs": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "enabled": true
      // "headers": { "Authorization": "Bearer …" },
      // "oauth": false
      // or "oauth": { "clientId": "…", "clientSecret": "…", "scope": "…" }
    }
  }
}
```

- Hosted OAuth: leave `oauth` unset (or object) so Browser sign-in can run; use **Connect** in Settings → MCPs or Notebook settings → MCP servers when status is Sign in required / Needs setup.
- API-key style: set `headers` and `"oauth": false`. Do **not** combine browser OAuth with an `Authorization` header (UI blocks this; avoid same conflict in files).

### Notebook-only enable (definition already global)

`<notebook-root>/.buddy/buddy.jsonc`:

```jsonc
{
  "mcp": {
    "shadcn": {
      "enabled": true
    }
  }
}
```

For a notebook-only server, use a full local or remote definition here. It will appear in notebook settings, but not the global Settings → MCPs list.

## Agent procedure (add / enable for current notebook)

1. Identify **notebook directory** (open workspace path).
2. Resolve and read the live global Buddy config (packaged default `~/.buddy/buddy.jsonc`; check `BUDDY_GLOBAL_CONFIG_DIR`). Merge — never wipe unrelated keys (`permission`, `model`, `personalization`, etc.).
3. If server missing under global `mcp`, write a **full** entry there when it should be globally managed, or in the notebook config when it belongs only to this notebook. Ask for URL/command; never invent secrets.
4. Only if global default is off and this notebook should be on: open/create `<notebook>/.buddy/buddy.jsonc` and set thin `mcp.<name>.enabled: true`.
5. If global has `enabled: true` and no notebook override needed, **skip** notebook file (or leave thin enable only).
6. Recheck the UI/status after the write. If Settings → MCPs remains empty, verify the live global config path; notebook-only definitions appear in Notebook settings → MCP servers. Use **Connect** there or in Settings → MCPs for OAuth.
7. Tools only when status is **Connected**. Permission dock may still ask (`trust.md`).

## Linear remote example (global)

`~/.buddy/buddy.jsonc` (merge into existing object):

```jsonc
{
  // …existing keys…
  "mcp": {
    "linear": {
      "type": "remote",
      "url": "https://mcp.linear.app/mcp",
      "enabled": true
    }
  }
}
```

Then user: Settings → MCPs should list **linear**; use **Connect** there or in notebook settings for OAuth.

## Do / don't

| Do | Don't |
| --- | --- |
| Put globally managed definitions in the live global Buddy config | Expect a notebook-only definition to show in global Settings → MCPs |
| Merge into existing global JSON/JSONC | Replace entire global config with only `mcp` |
| Thin `{ "enabled": true }` in notebook when overriding default | Expect `opencode.jsonc` alone to feed Buddy MCP |
| Use `type: "local"` + `command` array / `type: "remote"` + `url` | Fake server names or tokens |
| Point users to Connect for OAuth | Claim tools work before **Connected** |

## Status after config

| State | Meaning |
| --- | --- |
| Enabled in config | Notebook may load the server |
| Connected | Tools available to the agent |
| Disabled / Failed / Sign in required / Needs setup | No usable tools yet |

## Related

- Product UI: `extend.md` (Settings → MCPs, notebook MCP servers, Connect)
- Permissions: `trust.md`
- Fundamentals of MCP: `basics-of-agents.md` (newbies only)
