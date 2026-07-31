# Skills System

This folder owns Buddy's skills facade. The runtime still comes from vendored OpenCode; Buddy adds product-facing routes, UI data shaping, and Buddy-managed skill storage on top.

## OpenCode Core Model

- OpenCode discovers skills from global locations such as `~/.agents/skills` and `~/.claude/skills`, plus workspace-local `.agents/skills` and `.claude/skills` folders while walking up from the active directory.
- OpenCode also caches the discovered skill list inside each workspace instance. Buddy's skills screen keeps the normal cached path for fast reads, but its explicit refresh path does its own filesystem rescan so it does not have to tear down live runtimes.
- Skill permissions in core are name-based. The permission check resolves against the skill name, so the rule is effectively global for that skill name on this machine.
- A workspace-local skill with the same name as a global skill overrides the discovered content for that workspace, but it still shares the same name-based permission rule.

## Buddy Layer

- `service/catalog.ts` reads the upstream skill list, merges Buddy-managed skills, and joins installed state with the signed curated-library catalog.
- `routes/skills.ts` exposes the API used by the web app for listing, creating, installing, updating, and removing skills.
- `GET /api/skills?refresh=1` forces a Buddy-side filesystem rescan for local skill sources while preserving cached remote-discovery skills. This is how the UI picks up Finder edits without restarting the app or canceling live chats.
- The same explicit refresh checks the signed library catalog and compatible system-skill pack. The backend also refreshes these artifacts periodically without blocking startup.
- Every app retains bundled catalog and system-skill fallbacks. Remote artifacts are accepted only after signature, schema, revision, integrity, and compatibility validation.
- Catalog icon metadata is part of the signed catalog. The artifact publisher uploads content-addressed WebP assets directly to the fixed `skill-artifacts` GitHub Release; it does not use GitHub Actions artifacts or create a release per app version.
- Catalog icons are fetched by the backend on demand, verified against the signed SHA-256, cached under Buddy's skill-artifact cache, and served to the authenticated renderer through a digest-versioned API URL. Built-in system-skill icons remain packaged for offline use.
- Buddy shows `scope` as the discovery location (`global` vs `workspace`), but the permission control still follows the core name-based model. The scope label is informational; it is not a separate permission boundary.

## Current Limitation

True workspace-only enable/disable behavior is not available without upstream support in OpenCode. Buddy can present where a skill was found, but it cannot honestly provide per-workspace permission rules while core permissions remain name-based.
