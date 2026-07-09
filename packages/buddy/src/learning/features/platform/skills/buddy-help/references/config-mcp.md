---
name: config-mcp
description: "Hand-edit Buddy MCP config: global definitions, notebook enable overrides, local/remote shapes."
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
| Global definitions | `~/.buddy/buddy.jsonc` (fallback `buddy.json` if that exists) | **Required** for full server definitions (`type` + command/url). This is what **Settings → MCPs** and **Notebook settings → MCPs** list. |
| Notebook / project | `<notebook-root>/.buddy/buddy.jsonc` (or `.json`) | **Enable override only** for product UI: thin `{ "enabled": true\|false }`. Not a second definition store for Settings. |

- Create parent `.buddy/` if missing.
- Prefer **jsonc** when creating new files.
- Notebook root = workspace folder the notebook opened (not Home/Inbox magic alone — use the open directory path).

### Critical product truth (UI empty if you miss this)

| Action | Where |
| --- | --- |
| **Add / edit / remove definition** (name, URL, command) | **Global** `~/.buddy/buddy.jsonc` only for Settings to show it |
| **On/off for this notebook** + Connect | Notebook settings lists **global names only**, then reads notebook override for enabled |

**If you write a full MCP only under `<notebook>/.buddy/buddy.jsonc` and leave global empty:**

- File write “succeeds.”
- **Settings → MCPs** stays empty (reads global only).
- **Notebook settings → MCPs** stays empty (iterates global names only).
- User cannot Connect from UI.

Always put the **full definition in global**. Use notebook file only for `enabled` override when needed.

## Enable resolution

For each MCP **name**:

1. If notebook config has `mcp.<name>` → use it (full entry or `{ "enabled": true|false }`).
2. Else global `mcp.<name>` → use global (including its `enabled`; omit/`true` = on by default when present in product terms as `enabled !== false`).

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

- Hosted OAuth: leave `oauth` unset (or object) so browser login can run; user still uses Notebook settings → **Connect** when status is Sign in required / Needs setup.
- API-key style: set `headers` and `"oauth": false`. Do **not** combine browser OAuth with an `Authorization` header (UI blocks this; avoid same conflict in files).

### Global example (define + on by default)

`~/.buddy/buddy.jsonc`:

```jsonc
{
  "mcp": {
    "shadcn": {
      "type": "local",
      "command": ["npx", "-y", "shadcn@latest", "mcp"],
      "enabled": true
    }
  }
}
```

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

Do **not** put the only full definition here. Settings will not list it.

## Agent procedure (add / enable for current notebook)

1. Identify **notebook directory** (open workspace path).
2. **Read global** `~/.buddy/buddy.jsonc` (or `.json`). Merge — never wipe unrelated keys (`permission`, `model`, `personalization`, etc.).
3. If server missing under global `mcp`: write **full** local/remote entry under **global** with `"enabled": true` (unless user wants off-by-default). Ask user for URL/command; never invent secrets.
4. Only if global default is off and this notebook should be on: open/create `<notebook>/.buddy/buddy.jsonc` and set thin `mcp.<name>.enabled: true`.
5. If global has `enabled: true` and no notebook override needed, **skip** notebook file (or leave thin enable only).
6. Tell user: reopen notebook / restart Buddy if Settings still empty after global write; then **Notebook settings → MCPs → Connect** for OAuth.
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

Then user: Settings → MCPs should list **linear**; Notebook settings → **Connect** for OAuth.

## Do / don't

| Do | Don't |
| --- | --- |
| Put **full** MCP definitions in **global** `~/.buddy/buddy.jsonc` | Write full definition **only** under notebook `.buddy` and expect Settings to show it |
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

- Product UI: `extend.md` (Settings → MCPs, notebook MCPs, Connect)
- Permissions: `trust.md`
- Fundamentals of MCP: `basics-of-agents.md` (newbies only)
