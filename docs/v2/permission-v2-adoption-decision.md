# Permission v2 adoption decision

Date: 2026-06-10

## Decision

Buddy will keep the redesigned permission prompt UI, but will use OpenCode's
native permission replies until Buddy can migrate to the upstream v2 permission
runtime end to end.

For the current v1 runtime, Buddy exposes the native replies:

- `once`
- `always`
- `reject`

Buddy will not add temporary first-class `session` and `project` replies on top
of the v1 runtime. In particular, Buddy will not maintain custom session-rule
mutation or project-config persistence solely to approximate the v2 model.

The current native behavior is known to be limited:

- `always` uses the reusable patterns supplied by the tool request.
- The v1 grant is runtime-scoped and is lost when the OpenCode runtime restarts.
- The v1 model does not provide distinct chat and notebook grant primitives.

We accept those limitations temporarily rather than introduce a second
permission model that would be removed during the v2 migration.

## Reverted implementation

Before this decision, the in-progress change replaced the native `always` reply
with Buddy-owned `session` and `project` replies. That backend implementation
was reverted in full.

The reverted behavior included:

- changing Buddy's permission reply API from `once | always | reject` to
  `once | session | project | reject`;
- adding a scoped reply service that looked up the pending v1 request before
  replying;
- implementing `session` by appending allow rules to the current v1 session and
  approving other matching pending requests from that session;
- implementing `project` by writing reusable allow patterns into the notebook's
  `buddy.jsonc`, then also granting them to the current session;
- changing the external-directory config overlay so explicitly persisted
  project patterns survived Buddy's default external-directory restrictions;
- adding adapter methods for directly listing and replying to pending v1
  permission requests;
- adding backend tests for session isolation, project persistence, reusable
  pattern validation, and persisted external-directory rules;
- removing `always` from the Buddy API and rejecting it as a legacy reply.

The affected backend, adapter, generated SDK, and backend-test files were
restored to their pre-change state rather than retaining a compatibility layer.
The generated SDK once again exposes `once | always | reject`.

The reverted implementation was functional work, not the intended long-term
permission architecture. Its project persistence duplicated the direction of
upstream `PermissionSaved`, while its session persistence introduced a
Buddy-specific primitive that PermissionV2 does not currently model.

## Retained implementation

The permission prompt redesign was kept. It remains presentation-only and
includes:

- contextual titles for read, edit, command, and external-directory requests;
- clearer file, folder, and command details;
- improved long-path display and path copying;
- the card layout, icons, tooltips, and focused UI tests.

Its buttons now invoke only the native `reject`, `always`, and `once` replies.

## Upstream findings

The Buddy vendor sync at commit `668ad1adb09139ede5994b8a6ee2daec024af60e`
contains OpenCode `1.16.2`. It includes both the active v1 permission runtime and
the new Core PermissionV2 implementation.

As of the upstream `dev` branch on 2026-06-10:

1. The existing OpenCode agent loop still acquires the legacy
   `Permission.Service`, merges agent and session v1 rules, and emits legacy
   permission requests.
2. The OpenCode GUI still consumes `permission.asked` and replies through
   `client.permission.respond`.
3. The OpenCode TUI still consumes the legacy permission request and reply
   paths.
4. PermissionV2 is active inside the new Core v2 session and tool runtime. It
   emits `permission.v2.asked` and uses `action`, `resources`, and optional
   `save` fields.
5. PermissionV2's `always` reply stores saved allow rules by project ID through
   `PermissionSaved`. It is therefore persistent project-scoped state, not a
   session-scoped grant.
6. PermissionV2 does not currently expose a first-class reusable
   session/chat-scoped approval.

Relevant upstream sources:

- [Legacy session tool permission path](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/tools.ts)
- [Current application permission context](https://github.com/anomalyco/opencode/blob/dev/packages/app/src/context/permission.tsx)
- [Core PermissionV2 service](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/permission.ts)
- [Core saved permission service](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/permission/saved.ts)
- [PermissionV2 foundation PR](https://github.com/anomalyco/opencode/pull/30287)
- [V2 tool permission enforcement PR](https://github.com/anomalyco/opencode/pull/31061)

## Upstream PermissionV2 design

PermissionV2 changes both the permission vocabulary and the ownership of saved
decisions.

### Request model

A v2 permission request contains:

- a `sessionID`;
- an `action`, such as `read`, `edit`, `bash`, or `external_directory`;
- one or more concrete `resources` being requested;
- optional `save` resources that may be remembered by an `always` reply;
- optional tool-call source and metadata.

This replaces the v1 `permission`, `patterns`, and `always` request shape. The
same distinction remains conceptually: `resources` describe the current
operation, while `save` describes the reusable approval the tool considers
appropriate.

### Rule evaluation

Configured v2 rules are ordered `{ action, resource, effect }` entries, where
the effect is `allow`, `deny`, or `ask`. The last matching rule wins.

Permission evaluation has two inputs:

1. configured agent rules;
2. saved allow rules for the active project.

Configured denies are evaluated before saved approvals. A saved wildcard must
not override a configured deny.

The v2 permission service resolves configured rules from the session's agent.
Unlike the active v1 runtime, it does not merge a mutable session permission
ruleset into each request.

### Reply semantics

The v2 wire replies remain:

- `once`: approve only the pending request;
- `always`: approve the request and, when `save` resources are present, persist
  those resources as project-scoped allow rules;
- `reject`: reject the request and other pending requests in that session.

`always` therefore means "save the tool-provided reusable resources for this
project." It does not mean "allow every future use of this tool," and it is not
session-scoped.

After saving an `always` reply, PermissionV2 reevaluates pending requests against
the new project rules. Requests that are now allowed may be completed
automatically, including requests from other sessions in the same project.

### Persistence and ownership

Saved permissions are first-class database records owned by
`PermissionSaved`. Each record contains:

- `projectID`;
- `action`;
- `resource`.

They are not written into the user's project config. Authored configuration and
interactive saved approvals remain separate inputs to permission evaluation.
Saved approvals also have explicit list and remove operations, which permits a
future management UI without rewriting project configuration.

The permission service is location-scoped. It derives the active project from
the location service and loads saved approvals for that project. This fits
Buddy's notebook/project boundary more naturally than the current v1 runtime
grant, but it only fits once Buddy's active session and tool execution path also
uses the v2 location and permission services.

### Missing session scope

PermissionV2 has pending requests grouped by session, but it does not persist
reusable allow rules by session. Session identity determines which operation is
waiting and which requests are rejected together; it is not a saved-rule
ownership scope.

Adding "Allow for this chat" would therefore still be a Buddy-owned permission
primitive unless upstream adds session-scoped saved rules. It should not be
presented as a different label for upstream `always`.

## Migration status and timeline

Upstream is actively building the v2 runtime, but there is no published
permission migration date, release milestone, or committed GUI/TUI cutover
timeline.

The upstream v2 TODO says the project is working toward a v2 launch, while also
listing substantial remaining agent-loop, recovery, compaction, plugin, config,
and event work:

- [OpenCode v2 TODO](https://github.com/anomalyco/opencode/blob/dev/specs/v2/todo.md)

The `refactor/tui-v2-api` branch is evidence of intended client migration. It
adds reads for v2 pending permissions and project-saved permissions, but as of
2026-06-10:

- it has no associated pull request;
- it is behind the current `dev` branch;
- its permission prompt still uses the legacy request and reply component.

Older permission migration branches are stale and are not reliable indicators
of an upcoming merge.

## Effect on future Buddy decisions

Buddy should adopt PermissionV2 only when the active Buddy agent execution path,
permission events, pending-request reads, replies, agents, locations, and saved
rules can use the same upstream runtime coherently.

The upstream design changes future decisions as follows:

1. Do not implement notebook approvals by editing `buddy.jsonc`. Once v2 is
   adopted, interactive notebook approvals belong in `PermissionSaved`.
2. Keep authored policy separate from user approvals. Config rules express
   policy; saved rules express interactive decisions.
3. Treat the tool-provided `save` resources as the authority for what
   `always` remembers. The UI may explain those resources, but should not infer
   broader patterns from the current request.
4. Preserve upstream deny precedence. Neither UI shortcuts nor saved approvals
   should bypass configured denies.
5. Model notebook approvals by upstream project identity, not merely by a
   directory string or config-file location.
6. Do not add "Allow for this chat" as part of the v2 migration. That is a
   separate product feature requiring its own ownership, persistence,
   revocation, pending-request reevaluation, and restart semantics.
7. If Buddy later requires chat-scoped grants, first check whether upstream has
   added the primitive. If not, evaluate it independently rather than treating
   it as compatibility work.
8. Build future saved-permission management around upstream list/remove APIs
   rather than parsing and rewriting configuration.
9. Keep the redesigned UI decoupled from runtime implementation details. It can
   retain Buddy-specific titles and resource presentation while mapping actions
   directly to upstream replies.
10. Migrate permissions as an end-to-end runtime change, not by importing
    PermissionV2 into the current v1 loop. Mixing v1 sessions with v2 saved
    rules would create two evaluators with different agents, events, persistence,
    and pending-request behavior.

Until then, permission behavior stays native to the vendored v1 runtime and UI
work remains presentation-only.
