# W-D permission handoff

Buddy-owned PermissionV2 contracts, gateway, backend policies/routes, and permission UI are implemented. The real v2 host is exercised through Buddy's actual permission routes in a configured test sandbox. Full application compilation remains blocked by migration dependencies owned by other workstreams.

## Contract and rules

`packages/transcript-contract/src/permission.ts` uses Effect Schema without OpenCode imports. It defines PermissionRequest, PermissionReplyInput, SavedPermission, and the existing permission.asked/permission.replied event names. Request provenance is `{messageID, callID}`; saved-rule timestamps are flat `created`/`updated`. The PermissionRequest OpenAPI identifier is verified through the route's generated document.

`packages/transcript-contract/src/permission-rules.ts` owns PermissionRule/PermissionRuleset and the evaluator. The persisted `{permission, pattern, action}` vocabulary remains readable and maps to native `{action, resource, effect}` at the adapter gateway. User config is not rewritten by this migration. Rule order stays significant; comparison never sorts. The evaluator matches v2 wildcard behavior, including trailing ` *`, backslash normalization, dotAll, and explicit Windows case-insensitivity.

| Legacy action | Native action |
| --- | --- |
| task | subagent |
| bash | shell |
| write, patch, apply_patch, multiedit | edit |
| list_mcp_resources | opencode_list_mcp_resources |
| read_mcp_resource | opencode_read_mcp_resource |
| MCP server_tool and other Buddy action IDs | unchanged |

Session updates serialize per client/session, re-read native permissions, retain unmanaged rules, and skip unchanged replacements. Managed whole-tool denies come last. Generated non-deny rules precede preserved scoped session restrictions. Broad grants that would mask an authored deny are omitted so the native authored policy still evaluates the request. Dynamic grants and delegated child policies use the same owned evaluation path.

The adapter permission.ts and wildcard.ts remain thin facades over that shared implementation: unowned subagent-tool-forwarding.ts and config/store/permission-overrides.ts still import their values. Their v1 runtime imports and duplicated evaluation implementations are gone. No owned source file was deleted.

## Experience

The dock displays a friendly v2 action title, all requested resources, an optional runtime explanation, and save-pattern scope for this notebook's project. Allow once sends once; Always allow sends always; Deny sends reject; Deny with feedback sends reject plus the user's trimmed nonempty message. Feedback input resets when the request changes. A failed reply remains actionable.

The parent chat lists requests owned by all descendant sessions. Every server.connected event re-lists pending requests. Every permission event also reconciles against the authoritative list, and request-generation fencing prevents an older response from restoring answered requests. Each permission.replied removes its request, including cascaded sibling replies. Replies carry the owning child's sessionID. General settings contains a minimal remembered-approval list with remove, scoped to the current location's project.

## Plugin integration

Call `buildDelegatedChildSessionPermissions` from `packages/buddy/src/learning/agent-execution/permissions/delegated-permissions.ts` during the child's `session.hook("prompt")`, before its first model request. It is also re-exported from runtime-session-permissions.ts, but the delegated-permissions.ts module avoids the feature-registry import graph.

Pass:

- `parentRuntime`: the parent's resolved Buddy runtime, including access maps.
- `existing`: `toBuddyPermissionRules(child.permissions ?? [])`.
- `configured`: `await readAuthoredPermissionRules(directory, child.agent)`.
- `denyTools`: any child-role restrictions already used by that subagent.
- `platform`: `process.platform === "win32" ? "win32" : "posix"`.

The function returns the native ruleset. Apply it with `ctx.session.update({ sessionID: child.id, permissions })` before execution. The plugin was not edited. Parent permission changes do not automatically change already-created children; this follows the documented native copy-at-creation behavior.

W-A should use `toSessionPermissionRules(permissionRulesFromConfig(...))` when compiling legacy config permission objects to native agent rules. The config/agent factory bodies remain outside W-D ownership.

W-C1 already forwards the precise gateway event mapping. Its tool contract currently exposes only an error string: message.ts ToolState.error is Schema.String and gateway/message.ts keeps state.error.message while discarding the typed error. Permission-denied rendering therefore retains the expressly allowed prefix fallback. W-C1 must preserve permission.rejected on tool failures before the web detector and transcript tool-presentation detector can use that typed signal.

Two unused v1 web declarations are outside W-D's file ownership and need removal/porting by the orchestrator before SDK regeneration: `packages/web/src/lib/permission-dock-headline.ts` and `PermissionRequestEventSchema` in `packages/web/src/lib/directory-chat/chat-event-schemas.ts`. The new dock/hook no longer imports them.

## Verification

55 focused tests pass: 15 contract, 3 gateway, 11 Buddy, 26 web. Coverage includes wildcard behavior, legacy renames, event mapping, order-sensitive update comparisons, concurrent session updates, delegated child permissions, actual host dynamic grant/release, authored denies, child pending listing, once/always replies, saved approval removal, feedback rejection, OpenAPI naming, dock feedback, Windows path display, and cascaded/reconnected pending state.

From packages/transcript-contract:

```sh
bun ../../script/run-test-command.ts -- bun test --preload ../../script/test-preload.ts test/permission.test.ts
```

From packages/opencode-adapter:

```sh
bun ../../script/run-test-command.ts -- bun test --preload ../../script/test-preload.ts test/permission-gateway.test.ts
```

From packages/buddy:

```sh
bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts test/learning/runtime-session-permissions.test.ts test/learning/dynamic-tool-permission-toggle.test.ts test/permission/delegated-permissions.test.ts test/permission/v2-routes.test.ts
```

The route test was also re-run after adding the explicit empty Buddy-route list assertion following a reply: 3 passed.

From the repository root:

```sh
bun run --cwd packages/web test test/permission-dock.test.tsx test/permission-dock-headline.test.ts test/permission-dock-locations.test.ts test/permission-dock-path-display.test.ts test/permission-sync-state.test.ts
xargs bun ./node_modules/oxlint/bin/oxlint --config ./.oxlintrc.json < /tmp/buddy-wd-files.txt
```

Oxlint and scoped git diff --check passed. `/tmp/buddy-wd-files.txt` is the exact source/test lint manifest and changed-file inventory; shared package.json also received the two permission exports.

Sequential package typechecks from the root:

```sh
bun run --cwd packages/buddy typecheck
bun run --cwd packages/transcript-contract typecheck
bun run --cwd packages/opencode-adapter typecheck
bun run --cwd packages/web typecheck
```

Contract typecheck passed. Backend and adapter typechecks failed on remaining migration modules, with no permission implementation/test diagnostics. The import-only subagent forwarding file still has unported v1 logic/type errors. Web's package typecheck stopped before TypeScript because the Buddy SDK is not generated. Logs are `/tmp/buddy-wd-{backend,contract,adapter,web}-typecheck.txt` and `/tmp/buddy-wd-lint.txt`.

The existing focused external-file regression remains blocked on an unowned v1 dependency:

```sh
bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts test/learning/external-file-tool-permissions.test.ts
```

It cannot load `opencode/project/instance-context` from adapter/instance.ts. Its test source was left intact; the failure precedes test execution. No full-app or browser verification was performed, no generated files were edited, and all host state/database/config paths used TEST_SANDBOX roots. No real Buddy state was read or mutated. No commits or formatting commands were run.
