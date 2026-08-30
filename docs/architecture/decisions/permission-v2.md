# ADR: Permission V2 Adoption Decision

Status: Accepted
Date: 2026-06-10
Deciders: Buddy Core Architecture

**Canonical current permission-v2 decision.** Dated full write-up (revert inventory, upstream URLs, principles 1–10): [permission-v2-adoption-decision.md](../v2-upstream/permission-v2-adoption-decision.md).

## Decision

Buddy retains the redesigned permission prompt UI, but uses OpenCode's native v1 permission replies (`once`, `always`, `reject`) until Buddy can migrate to upstream PermissionV2 end-to-end.

Buddy will not introduce intermediate custom `session` or `project` permission reply primitives on top of the v1 runtime. In particular, Buddy will not maintain custom session-rule mutations or write project approvals into `buddy.jsonc` to approximate v2 behavior.

We accept current v1 limitations temporarily:
- `always` relies on tool-provided reusable patterns.
- Grants are runtime-scoped and clear when the runtime restarts.
- The v1 model does not distinguish between chat and notebook grant scopes.

## Context & Reverted Experiment

Prior to this decision, an experiment replaced `always` with custom `session` and `project` replies:
- `session` mutated in-memory session allow rules for the active chat.
- `project` persisted allow patterns directly into the notebook's `buddy.jsonc`.

This experiment was reverted in full. Unique consequences of that revert (kept so they are not lost if only this ADR is read):

1. Writing interactive user approvals into `buddy.jsonc` violated config boundaries, polluting user configuration with runtime grants.
2. It duplicated upstream `PermissionSaved` architecture while introducing non-standard session semantics not modeled upstream.
3. The generated SDK and Hono endpoints were restored to the standard `once | always | reject` contract — including dropping a Buddy-owned `once | session | project | reject` API that had rejected `always` as a legacy reply.
4. A scoped reply service that looked up the pending v1 request before replying was removed.
5. `session` had appended allow rules to the current v1 session and approved other matching pending requests from that session.
6. `project` had written reusable allow patterns into the notebook’s `buddy.jsonc` and granted them to the current session.
7. External-directory config overlay had been changed so explicitly persisted project patterns survived Buddy’s default external-directory restrictions — that overlay change was reverted with the rest.
8. Adapter methods for listing and replying to pending v1 permission requests, and tests for session isolation / project persistence / reusable patterns / persisted external-directory rules, were restored to pre-change state.

The UI redesign (clearer diffs, contextual titles, path formatting, and structured argument presentation) was retained as presentation-only.

## Upstream PermissionV2 Architecture

OpenCode Core PermissionV2 replaces the legacy permission engine with structured request and persistence models:

### Request Model
A v2 request contains:
- `sessionID`
- `action` (`read`, `edit`, `bash`, `external_directory`)
- `resources` (concrete items requested)
- `save` (optional reusable resource patterns remembered by `always`)

### Evaluation & Precedence
- Rules follow `{ action, resource, effect }` where effect is `allow`, `deny`, or `ask`.
- The last matching rule wins.
- Configured agent denies always take precedence over saved user approvals; a wildcard saved approval cannot override a configured deny.

### Persistence & Multi-Session Evaluation via `PermissionSaved`
- `always` persists the tool's `save` resources to a dedicated database table managed by `PermissionSaved` keyed by `projectID`.
- Approvals are first-class database records, never written to project config files.
- **Cross-session re-evaluation:** After saving an `always` reply, PermissionV2 re-evaluates pending requests against the new project rules. Requests that are now allowed may be completed automatically, including requests from other active sessions in the same project.
- PermissionV2 does not model a persistent session/chat scope; requests are grouped by session only for pending prompt resolution.

## Principles for Future PermissionV2 Cutover

When upstream PermissionV2 reaches stability across the agent loop, events, and client protocols, Buddy will adopt it under these principles:

1. **End-to-end cutover:** Migrate permissions as a single coherent runtime change (session runtime, events, pending requests, and persistence). Do not mix v1 session loops with v2 saved rules.
2. **Dedicated storage:** Use upstream `PermissionSaved` for project-level approvals; never write approvals to `buddy.jsonc`.
3. **Project identity keying:** Model notebook approvals by upstream project identity, not merely by a directory string or config-file location.
4. **Policy vs. approvals:** Config files express authored policy; `PermissionSaved` records interactive decisions. Config denies always win.
5. **Tool authority:** Treat tool-provided `save` resources as authoritative for what `always` remembers.
6. **API-based management:** Build future saved-permission management around upstream list/remove APIs rather than parsing and rewriting configuration.
7. **Decoupled UI presentation:** Keep the redesigned UI decoupled from runtime implementation details. It can retain Buddy-specific titles and resource presentation while mapping actions directly to upstream replies.
8. **Session scope evaluation:** If Buddy requires chat-scoped grants, treat it as a distinct product feature evaluated against upstream primitives, not a custom hack on top of `always`. Do not add “Allow for this chat” as part of the v2 migration unless upstream adds session-scoped saved rules.
