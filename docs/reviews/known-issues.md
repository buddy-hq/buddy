# Known issues

Review date: 2026-08-01

## Obsidian connection updates are not atomic

Priority: P2; fix before merge.

The frontend changes `obsidian_vault.connected` through the general config endpoint and then makes a
separate request for the effective Obsidian profile. If the config update succeeds but the profile
request fails, or vault detection changes between those requests, the persisted connection state and
the result shown to the user disagree.

For example, a failed profile request leaves the connection dialog open with an error even though the
config flag may already be enabled. Choosing **Not now** at that point opens a notebook whose agent
can receive the Obsidian capability despite the failed connection result. Disconnecting has the
inverse failure mode: the backend can be disconnected while the UI retains a connected profile.

Recommended fix: expose one backend operation that validates detection, updates the connection, and
returns the effective profile as one transaction. If that is not possible, compensate by restoring
the previous config value whenever verification fails.

Affected code:

- `packages/web/src/state/obsidian-vault-query.ts`
- `packages/web/src/lib/use-open-existing-notebook.ts`
- `packages/buddy/src/routes/obsidian.ts`

## Obsidian feature access and the profile disagree about connection state

Priority: P2; fix before merge.

The profile and link-resolution API define a connected vault as one that is both detected and marked
connected in project config. Feature access checks only the persisted config flag. If a connected
vault's `.obsidian` directory is removed or renamed, Buddy's UI and link API report that the notebook
is disconnected while the agent still receives the Obsidian skill.

The same inconsistency can be produced by setting the config flag directly on a regular notebook.
The sidebar then provides no disconnect action because its effective profile is disconnected, but
the hidden feature flag remains enabled.

Recommended fix: establish one authoritative definition of connection and apply it to profile
responses, API authorization, feature availability, and sidebar presentation. Either gate feature
capabilities with the effective detection-and-consent predicate or make explicit consent authoritative
everywhere and treat detection as independent metadata.

Affected code:

- `packages/buddy/src/learning/features/obsidian-vault/feature.ts`
- `packages/buddy/src/routes/obsidian.ts`
- `packages/web/src/components/layout/chat-left-sidebar/directory-list.tsx`

## Opening a vault from Settings bypasses the connection prompt

Priority: P2; fix before merge.

The shared `useOpenExistingNotebook` flow is used by the chat entry page and the directory workspace
controller, but Settings still opens folders by calling `openProject` and `activateChatDirectory`
directly. Selecting an Obsidian vault from Settings therefore activates it as a regular notebook
without offering the new connection choice.

Once opened this way, there is no visible connect action for that notebook. The user must invoke
**Open existing folder** from another surface and select the same directory again to reach the
connection dialog.

Recommended fix: make detection and connection prompting part of one shared folder-opening workflow
used by every entry point, or move the policy below the route components so new callers cannot bypass
it.

Affected code:

- `packages/web/src/lib/use-open-existing-notebook.ts`
- `packages/web/src/routes/settings.tsx`
- `packages/web/src/routes/chat.tsx`
- `packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts`
