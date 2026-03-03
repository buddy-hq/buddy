# Skills System

This folder owns Buddy's skills facade. The runtime still comes from vendored OpenCode; Buddy adds product-facing routes, UI data shaping, and Buddy-managed skill storage on top.

## OpenCode Core Model

- OpenCode discovers skills from global locations such as `~/.agents/skills` and `~/.claude/skills`, plus workspace-local `.agents/skills` and `.claude/skills` folders while walking up from the active directory.
- OpenCode also caches the discovered skill list inside each workspace instance. Buddy's skills screen keeps the normal cached path for fast reads, but its explicit refresh path does its own filesystem rescan so it does not have to tear down live runtimes.
- Skill permissions in core are name-based. The permission check resolves against the skill name, so the rule is effectively global for that skill name on this machine.
- A workspace-local skill with the same name as a global skill overrides the discovered content for that workspace, but it still shares the same name-based permission rule.

## Buddy Layer

- `service.ts` reads the upstream `/skill` list, merges in Buddy-managed skills stored under `~/.agents/skills/buddy-managed`, and adds placeholder library entries for the current UI.
- `routes/skills.ts` exposes the API used by the web app for listing, creating, installing, updating, and removing skills.
- `GET /api/skills?refresh=1` forces a Buddy-side filesystem rescan for local skill sources while preserving cached remote-discovery skills. This is how the UI picks up Finder edits without restarting the app or canceling live chats.
- Buddy shows `scope` as the discovery location (`global` vs `workspace`), but the permission control still follows the core name-based model. The scope label is informational; it is not a separate permission boundary.

## Current Limitation

True workspace-only enable/disable behavior is not available without upstream support in OpenCode. Buddy can present where a skill was found, but it cannot honestly provide per-workspace permission rules while core permissions remain name-based.
