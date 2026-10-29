# Agent runtime: two OpenCode copies per notebook now, one copy later

Status: accepted by the owner on 2026-10-27.

## Decision

Buddy ships with two OpenCode copies per notebook: the shared copy OpenCode builds for every folder, and a chat copy that Buddy adds through the SDK's `instances` option. Every chat runs in the chat copy. This is the design for the first Beta and stays the design until the conditions in "Path to one copy" are met.

One copy per notebook remains the long-term goal.

## Background

Buddy embeds OpenCode in its backend process and changes its behaviour only through three extensions (OpenCode plugins):

- **Catalog** (`buddy.catalog`): Buddy's tools, agents, skills and commands, and the notebook's settings. Loaded in both copies.
- **ChatGPT** (`buddy.codex`): the ChatGPT account's models and sign-in. Loaded in both copies.
- **Chat rules** (`buddy.runtime`): everything the catalog adds, plus the checkpoints that run during a chat. Loaded only in the chat copy, when OpenCode builds it.

A copy is a full set of OpenCode's per-folder services held in memory: tools and settings applied, MCP connections, waiting questions and permission prompts, shells. Chat history, sign-ins, the event stream and the model connection are held once and shared.

OpenCode routes every request to one copy. A request that names a chat goes to the chat copy. A request that names only a folder goes to the shared copy.

The full description, with diagrams, is in the maintainers' architecture pages for the two-copy runtime.

## Why two copies

Buddy needs two guarantees from the runtime:

1. **Rules first.** Buddy's chat rules are in place before any chat runs, including chats OpenCode resumes at startup after an interrupted reply.
2. **Block on failure.** If the chat rules fail to load, chats are refused, and loading is tried again.

The `instances` option gives both, and OpenCode documents them (`vendor/opencode/packages/sdk/README.md`, "Session-Selected Plugins" and "Restart and Lifetime"). The chat copy can't exist without the chat rules, its recipe is installed before recovery starts, and a failed setup refuses the copy and is retried on the next request.

Two more properties follow:

3. **Settings survive a chat failure.** Settings and lists read the shared copy, which doesn't load the chat rules.
4. **Notebook model settings win in chats.** The chat rules load after the ChatGPT extension, so the notebook's settings override the account's defaults.

The second copy is a side effect. OpenCode documents `instances` for chats in one folder that need *different* extensions. Buddy's chats all need the same ones, so Buddy uses the option for its guarantees.

### Runtime guarantees

`packages/buddy/test/conformance/runtime-guarantees.test.ts` pins both guarantees through the adapter's runtime startup and the real Buddy extension:

- **Block on failure:** "block on failure: refuse a chat without a reply, then retry chat-rules setup" checks refusal, no assistant reply or model request, and a successful retry with chat rules.
- **Rules first on resume:** "rules first on resume: startup recovery runs with chat rules or fails" restarts an interrupted reply in a temporary store and checks that recovery either fails or runs with chat rules.
- **Rules first, normal start:** "rules first, normal start: the first turn in a fresh notebook runs with chat rules" checks the first model request and Buddy's captured system prompt.

## Costs, and how Beta handles them

Things that belong together are split across the two copies, and each request reaches only one of them.

| Cost | Who meets it | For Beta |
| --- | --- | --- |
| MCP server questions can't be answered: OpenCode tags them with no chat, they wait in the chat copy, and the only route to answer them reads the shared copy | Learners whose MCP server asks questions | Chats with a running call to that server show a notice with a working Stop. With older servers the question itself can stay pending in the chat copy after Stop |
| The runtime's connect and disconnect act only on the shared copy. Settings' on/off switch saves the setting instead, and that reaches every open notebook's copies | Nobody today; the app doesn't offer a runtime disconnect | Accepted |
| Settings show the shared copy's MCP status, which can differ from what chats use | MCP users | Accepted |
| Each MCP server connects twice; a local server runs as two programs | MCP users | Accepted; memory to be measured |
| A settings change in the notebook's root folder isn't pushed into the chat copy, so chats already open keep old settings | Anyone who edits settings mid-chat | Fixed: every open copy of the root folder is synced |
| Chat copies are not freed until the app quits | Long sessions across many notebooks | Accepted: each chat copy holds about 5.5–6 MiB of JavaScript heap per notebook, about the same as the shared copy (measured 2026-10-27 with empty notebooks and no MCP servers) |
| A resumed chat can start before the catalog and ChatGPT extensions are registered; the chat rules are already there, so the turn runs with them or fails | Resumed chats, rarely | Accepted |
| A prompt left waiting for an hour is closed when OpenCode frees the idle shared copy, and the turn stops | Learners who walk away from a prompt | The stopped turn says it stopped after an hour with no activity |

## Alternatives considered

- **One copy per notebook now (called A2).** Drop `instances`, run chats in the shared copy, and rebuild the guarantees in Buddy. Rejected for Beta; it is the long-term goal. See the reviews below.
- **Buddy outside the agent loop**, talking to a separate OpenCode server, as T3 Code does. Rejected by the owner: Buddy hooks into turns, tool checks and sign-in, which an out-of-process client can't do.
- **Buddy's own agent loop.** Out of scope.
- **Patching the vendored OpenCode** to register extensions before recovery. Parked. Buddy's rule is no vendor patches, so it can leave OpenCode for another runtime with only the adapter changing.

## What the reviews said

Five independent reviews on 2026-10-24 assessed merging the two copies and two one-copy designs. All agreed on the direction (one copy) and against shipping the bare merge, and three agreed the switch should not happen before Beta. Full reports are in the maintainers' private notes.

## Path to one copy

The switch happens in a later update, behind a setting, once all of these hold:

1. **Rules first without `instances`.** Either OpenCode registers extensions before it resumes chats (an upstream request), or Buddy builds the adapter on OpenCode's exported lower-level setup.
2. **Block on failure, owned by Buddy.** A guard extension loaded first, live health checks, a defined retry that doesn't rebuild the shared copy, and a stated scope for what "no turn without Buddy" covers.
3. **The extension split.** Catalog once, chat rules separately, in the order ChatGPT, then catalog, then chat rules.
4. **MCP sign-in.** A reconnect rule that never cuts off a tool call that just started on the same server.
5. **Prompt outcomes.** Closing messages that say whether the turn stopped or is carrying on.
6. **Numbers.** Memory measured for both designs.

Changing the copy count changes no stored data, so the switch needs no migration and can be undone with an ordinary update.

## Work before Beta

All done on 2026-10-27:

- Settings changes in the notebook's root folder reach the chat copy.
- MCP server questions show a notice with a working Stop.
- A turn closed by the idle sweep says why it stopped.
- The two runtime guarantees are pinned by conformance tests (see "Runtime guarantees").
- Memory measured: about 6 MiB of JavaScript heap per chat copy per notebook.
- The desktop login boundary keeps the backend login out of widget frames, book chapters and popups, proven in the real app.
