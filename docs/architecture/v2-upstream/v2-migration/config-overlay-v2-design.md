# Buddy notebook configuration on OpenCode v2.0.24

Research/design only, 2026-10-08. No implementation or runtime smoke test accompanies this report.
Buddy sources below are the baseline **`a99d5c41a3`**, read with `git show`; upstream sources are the installed v2.0.24 vendor tree.
Line citations to Buddy/adapter files therefore describe the pre-migration implementation, not other agents' current edits.
Proposed behavior and deductions beyond a directly demonstrated API contract are marked **(inferred)**.

## Recommendation and constraints

Replace the mutable v1 config overlay with a Buddy-owned, immutable notebook runtime plan and Location-scoped plugin registrations.
Keep persisted Buddy configuration in its existing shape; convert only the runtime projection.
Use public domain transforms and their `reload()` methods; keep per-chat policy in session permissions.
Do not write an OpenCode config file, mutate environment variables per notebook, or create one host per notebook.
This follows `docs/architecture/v2-upstream/v2-migration/STATUS.md:30` and `STATUS.md:40`, and the revised permission decision in `LOG.md:46`.

Two limits prevent claiming complete parity from a simple `setup(ctx)` port:

- SDK plugins precede upstream's late config plugins; a Buddy transform registered during setup is not always the last writer.
- The public promise plugin has no compaction settings editor; host inline config cannot vary by Location.

Sources: `vendor/opencode/packages/core/src/plugin/supervisor.ts:138`, `vendor/opencode/packages/core/src/plugin/internal.ts:249`,
`vendor/opencode/packages/plugin/src/promise/plugin.ts:26`, `vendor/opencode/packages/server/src/options.ts:27`.
Resolve precedence explicitly as described below. Treat notebook-specific compaction as a documented integration gap, not an implicitly supported field.

## 1. What Buddy produces today

The complete top-level return shape is `packages/buddy/src/config/opencode/overlay-builder.ts:176`.
It has twelve possible keys: `permission`, `command`, `agent`, `compaction`, `model`, `small_model`, `default_agent`,
`disabled_providers`, `enabled_providers`, `provider`, `skills`, and `mcp`.
The adapter accepts more v1 fields, but the production builder does not emit instructions, plugin packages, shell, LSP, or watcher settings.
Adapter support for instruction/plugin merging is at `packages/opencode-adapter/src/config.ts:52`; it is not additional Buddy overlay production.

All input fields first pass through Buddy's store precedence:
global Buddy config → `BUDDY_CONFIG` file → project Buddy config → `BUDDY_CONFIG_CONTENT` → `BUDDY_PERMISSION` → tool/skill defaults.
Source: `packages/buddy/src/config/store/read-config.ts:35`.
The notebook file is `<configDirectory>/.buddy/buddy.jsonc`, falling back to `buddy.json`;
the config directory is the worktree unless it is a filesystem root, in which case it is the requested directory.
Source: `packages/buddy/src/config/store/config-paths.ts:18` and `:36`.

| Overlay field | Buddy source and produced value | User-visible behavior |
|---|---|---|
| `agent` | Registered personas plus registered feature subagents, merged with `config.agent`; persona visibility from `config.personas`. `config/opencode/agents.ts:105`, `:119`, `:165`. | Persona picker, configured custom agents, delegated roles, system prompts, model/request tuning, and static tool access. |
| `default_agent` | `default_persona`, then `personalization.primary_use`, then persona metadata defaults; resolved by key or unique agent name. `overlay-builder.ts:166`; `agents.ts:185`. | Default persona for a new chat; selected default appears first in the agent list (`overlay-builder.ts:123`). |
| `permission` | `config.permission`, including `tools` toggles and environment defaults, then Buddy runtime overrides. `overlay-builder.ts:75`; `store/permission-overrides.ts:14`, `:26`, `:128`. | Tool visibility/access, subagent and skill access, external file approvals, and notes read/write approvals. |
| `command` | Hardcoded `flashcard` template and description; no `command` field exists in Buddy's persisted schema. `overlay-builder.ts:35`; `contract/schema.ts:133`. | `/flashcard` delegates resource-grounded card generation to `flashcard-author`. Raw OpenCode commands remain merged alongside it. |
| `skills.paths` | Configured paths plus managed custom/library and system roots; optional home/project `.claude/skills` and `.agents/skills`. `config/opencode/skills.ts:148`, `:202`, `:228`. | Installed and configured skills available in chat; vendor roots are opt-in. Bundled feature roots feed the managed system installation. |
| `mcp` | `config.mcp` local/remote definitions or enabled-only entries. `contract/schema.ts:42`, `:144`; `overlay-builder.ts:206`. | Notebook MCP servers, enablement, transport settings, OAuth, and tool availability. Buddy replaces raw OpenCode MCP authority. |
| `provider` | `config.provider` v1 provider/model definitions. `contract/schema.ts:27`, `:143`; `overlay-builder.ts:204`. | Provider connections/catalog, custom endpoints and models, costs/limits/variants/request settings. |
| `model` | `config.model` provider/model string. `contract/schema.ts:138`; `overlay-builder.ts:193`. | Default chat model when no more specific choice exists. |
| `small_model` | `config.small_model` provider/model string. `contract/schema.ts:139`; `overlay-builder.ts:194`. | v1 auxiliary small-model selection; also consumed by Buddy model helpers. |
| `enabled_providers` | Optional string array; present empty array is distinct from absence. `contract/schema.ts:137`; `overlay-builder.ts:200`. | Restricts provider availability/catalog. |
| `disabled_providers` | Optional string array. `contract/schema.ts:136`; `overlay-builder.ts:197`. | Removes disabled providers from availability/catalog. |
| `compaction` | `auto`, `prune`, `tail_turns`, `preserve_recent_tokens`, `reserved`. `contract/schema.ts:73`; `overlay-builder.ts:192`. | Automatic compaction and context retention/budget behavior in long chats. |

In this table, shortened Buddy paths are under `packages/buddy/src/`; these are file:line citations with that prefix.

### Nested agent and permission fields

Persona factories trim `prompt`, supply description and primary mode, and derive permitted subagent names from feature wiring.
Dynamic tools start denied; feature subagents get their owned tools allowed.
Sources: `packages/buddy/src/learning/personas/wiring/create-buddy-persona-agent.ts:32`,
`packages/buddy/src/learning/agent-factories.ts:46`, `:144`, `:160`, `packages/buddy/src/learning/runtime-subagents.ts:53`.
Configured agent overrides cover model, variant, temperature, top_p, prompt, description, mode, hidden, color,
steps/maxSteps, options, legacy tools, permission, and disable; options/permissions merge rather than replacing wholesale.
Sources: `packages/buddy/src/config/opencode/agents.ts:17`; baseline adapter schema selection `packages/opencode-adapter/src/config.ts:218`.
Buddy persona overrides ignore `disable`; ordinary custom agents may be disabled (`packages/buddy/src/config/opencode/agents.ts:135`).
Persona `label`, description/surface overrides are also Buddy UI metadata; the overlay specifically applies persona hidden flags,
not every metadata override to `Agent.Info` (`packages/buddy/src/config/opencode/agents.ts:165`, `packages/buddy/src/config/orchestration/project-config-service.ts:23`).

The fixed runtime permission deltas deny `goal_*`, `learner_*`, `ingest_full_text`, `prepare_resource`, `python_*`,
`render_*`, and `teaching_*`; allow `websearch` and `codesearch` (`packages/buddy/src/config/opencode/overlay-builder.ts:19`).
External-directory additions allow truncated output, vendor temp, each skill root, and notes root/descendants.
Notes read additions allow worktree-relative root/descendants; notes edit additions ask on those paths.
Source: `packages/buddy/src/config/opencode/overlay-builder.ts:87`.
These are structured file-tool rules, not a restriction on arbitrary shell commands;
the test deliberately preserves shell allow (`packages/buddy/test/config/external-directory-permission.test.ts:91`).
Skill permission defaults turn ask into allow while retaining deny, including inherited wildcards
(`packages/buddy/src/config/store/permission-overrides.ts:42`, `:112`).

### Existing merge and refresh semantics

The adapter deep-merges object fields, replaces scalar/array values, preserves wildcard permission precedence,
expands virtual config substitutions, and applies the overlay only once per cached config object.
Sources: `packages/opencode-adapter/src/config.ts:38`, `:103`, `:129`, `:159`.
Before merging it deletes raw `mcp`, even if Buddy supplied no MCP map;
`packages/opencode-adapter/src/config.ts:73` and `packages/buddy/src/config/runtime/opencode-sync.ts:81` establish this authority.
The overlay is keyed by realpath-or-resolve directory (`packages/opencode-adapter/src/config-overlay.ts:26`).
The fingerprint includes effective Buddy config, overlay, system-skill pack fingerprint, and runtime policy revision.
On change Buddy disposes the instance, deliberately avoiding config PATCH (`packages/buddy/src/config/runtime/opencode-sync.ts:90`, `:105`).

## 2. Field-to-v2 mapping

### Personas and agents: `ctx.agent.transform`

Use `editor.update(id, callback)` to create or modify agents; missing IDs receive `Agent.Info.default(id)` first.
There is no `agent.add()`. Source: `vendor/opencode/packages/plugin/src/promise/agent.ts:6`, `vendor/opencode/packages/core/src/agent.ts:74`.
Set `editor.default(personaID)` instead of relying on object insertion order.
V2 default selection excludes hidden and subagent-only agents and puts the selected default first (`core/src/agent.ts:92`, `:124`).

| Buddy/v1 agent value | V2 runtime value/editor operation |
|---|---|
| Record key, optional legacy name | Stable `id` from record key; set `name` separately for display. Keep Buddy persona IDs unchanged. |
| `mode` | `primary`, `subagent`, or `all`; keep feature delegation roles `subagent`. |
| `prompt` | `system`; preserve configured prompt/file substitutions before projection. |
| `permission`, legacy `tools` | Ordered `permissions: {action, resource, effect}[]`; map task→subagent, bash→shell, write/patch→edit. |
| `model`, `variant` | `model: {providerID, id, variant?}`; split at first slash, retaining slashes inside model IDs. |
| `hidden`, description, color, steps | Corresponding `Agent.Info` fields; maxSteps is a compatibility alias for steps. |
| `temperature`, `top_p`, `options` | Translate request tuning; upstream v1 migration places these in `request.body`. Review provider-specific options against v2 request semantics. |
| `disable` | Remove ordinary configured agents with `editor.remove(id)`; retain Buddy's persona-disable exception. |

Sources: `vendor/opencode/packages/schema/src/agent.ts:23`, `schema/src/model.ts:18`,
`vendor/opencode/packages/core/src/v1/config/agent.ts:45`, `core/src/v1/config/migrate.ts:29`, `:36`.
The upstream v1 migration discards legacy display name and converts symbolic colors to `#aaaaaa` (`migrate.ts:51`);
Buddy should preserve its own display metadata and resolve symbolic colors through Buddy's theme contract **(inferred)**.
Keep new v2 default filesystem rules, then fold notebook policy and agent overrides in baseline-compatible order **(inferred)**.
Do not replace all permissions with only translated Buddy rules; that would erase v2 `.env` and runtime-output defaults.
Source for those defaults: `vendor/opencode/packages/schema/src/agent.ts:39`, `vendor/opencode/packages/core/src/agent.ts:59`.

### Permissions: agent baselines plus session policy

Project/global `permission` belongs in each relevant agent's `permissions`; there is no plugin-wide global-permission editor.
Upstream's config plugin itself appends global rules to all agents (`vendor/opencode/packages/core/src/config/plugin/agent.ts:83`).
Recommended fold: v2 defaults → raw OpenCode baseline → Buddy notebook permission overlay → persona/static/agent-specific rules **(inferred)**.
Preserve broad wildcard-first behavior and pattern-specific ordering; serialize rules as arrays without sorting them.
Fix the old fingerprint's key sorting where it erases permission precedence (`packages/buddy/src/config/opencode/fingerprint.ts:15`).
Equivalent key/value maps in different rule orders can yield different last-match effects **(inferred)**.

Per-chat tools/subagents/skills remain the session policy carrier decided in `LOG.md:46`:
compile `{permission, pattern, action}` to `{action, resource, effect}` and replace via `host.sessions.update({sessionID, permissions})`.
The public plugin counterpart is `ctx.session.update`; children need their delegated profile applied before their first request.
Session rules follow agent rules and last match wins (`vendor/opencode/packages/schema/src/session.ts:56`, `core/src/permission.ts:87`, `:162`).
Children inherit parent permissions at creation (`vendor/opencode/packages/core/src/session.ts:285`).
No per-prompt context-tool deletion is required for Buddy access policy.
Wholly denied actions filter tools (`vendor/opencode/packages/core/src/tool.ts:225`, `:292`).
Ask still requires the Buddy tool's permission helper; catalog inclusion alone does not authorize execution (`LOG.md:46`).

Rebuild notes patterns for v2's actual resources: internal paths are Location-relative; external file resources are absolute;
all emitted resources use forward slashes, including Windows (`vendor/opencode/packages/core/src/file-access.ts:93`).
Add appropriate absolute and relative notes read/edit patterns rather than copying only old worktree-relative patterns **(inferred)**.
Retain notes read allow/edit ask and external-directory access; test equal/ancestor/descendant roots and notebook subdirectories.
Use v2 defaults for v2 temp/output paths instead of v1 `Truncate.GLOB`; keep explicit Buddy skill/notes additions.

### Commands: `ctx.command.transform`

`editor.add({name, description, execute})` registers executable commands, not a `{template}` config object.
Source: `vendor/opencode/packages/plugin/src/promise/command.ts:13`; add replaces the same name (`core/src/command.ts:60`).
For `/flashcard`, execute expands `$ARGUMENTS` from `input.prompt.text`, then calls
`ctx.session.prompt({...input.prompt, sessionID: input.sessionID, text, delivery: input.delivery})` **(inferred)**.
This preserves files/skills/metadata and delivery, following upstream's executable template command at `core/src/config/plugin/command.ts:93`, `:129`.
Update hardcoded wording from v1 task delegation to v2 subagent delegation with the subagent workstream.
No Buddy persisted command field needs introducing; retain raw OpenCode commands and specify Buddy wins a `/flashcard` name collision.

### Skill paths and visibility: `ctx.skill.transform`

The editor accepts complete `Skill.Info`, not discovery roots: `add`, `update`, `remove`, `list`, `get`.
Source: `vendor/opencode/packages/plugin/src/promise/skill.ts:6`; `vendor/opencode/packages/schema/src/skill.ts:26`.
Keep Buddy root resolution/system installation; asynchronously scan/parse selected roots into `{id,name,path,content,description?,autoinvoke?}`.
Reuse Buddy discovery/document helpers and make the skill ID policy explicit; v2's own parser uses directory/file-derived ID,
while display name can come from frontmatter (`vendor/opencode/packages/core/src/config/plugin/skill-file.ts:39`).
Then synchronously add the prepared catalog and remove suppressed upstream skills and disabled external vendor roots **(inferred)**.
Per-chat skill permission rules provide access filtering; permanent suppression is a separate catalog transform.
The baseline hides `customize-opencode`; v2 bundled skill IDs differ, so compare catalog identity/content before selecting the replacement suppression.
Sources: `packages/buddy/src/opencode-runtime/hidden-opencode-skills.ts:1`, `vendor/opencode/packages/core/src/plugin/skill.ts:1`.
`skills.urls` is accepted in the legacy schema, but the Buddy overlay only emits paths; do not accidentally add remote URLs as migration behavior.
Upstream normalizes paths/URLs to `skills: string[]` (`vendor/opencode/packages/core/src/config/normalize.ts:232`).
Host `config.content` could supply this array only if all Locations share it; it cannot carry notebook-specific skill roots.
`ctx.skill.reload()` replays transforms; it does not reread SKILL.md files for Buddy. Rescan before calling it.
Upstream does the same refresh-before-reload (`vendor/opencode/packages/core/src/config/plugin/skill.ts:149`, `:174`).

### MCP: `ctx.mcp.transform`

Remove every prior editor entry, then `editor.set(name, serverConfig)` for Buddy's resolved definitions;
this preserves the old authoritative-empty behavior. Source: `vendor/opencode/packages/plugin/src/promise/mcp.ts:6`.
Map enabled→`disabled: !enabled`, scalar timeout→`{catalog,execution}`, OAuth camelCase→snake_case, retaining `oauth:false`,
local command/environment/cwd and remote URL/headers (`vendor/opencode/packages/core/src/v1/config/migrate.ts:80`).
Resolve enabled-only entries against complete merged Buddy definitions; `{enabled:false}` with no definition means omit,
and `{enabled:true}` with no definition should produce an actionable config diagnostic **(inferred)**.
Do not inherit raw OpenCode MCP definitions to complete these entries: old authority explicitly removes that source.
V2's normalizer drops enabled-only MCP entries with an unsupported diagnostic (`core/src/config/normalize.ts:267`).
`ctx.mcp.reload()` reconciles changed/removed servers and preserves unchanged connections;
removed server credentials intentionally survive (`vendor/opencode/packages/core/src/mcp/index.ts:525`, `:563`, `:624`).
Do not use `client.mcp.add/remove` for overlay sync: they introduce runtime overrides/tombstones (`core/src/mcp/index.ts:599`, `:635`).
Initial MCP startup can remain pending asynchronously; successful synchronization does not imply OAuth/connectivity succeeded (`mcp/index.ts:550`).

### Providers, models, and defaults

`provider`: use `ctx.integration.transform` for key/env connection methods, `ctx.provider.transform` for provider definitions,
and `ctx.model.transform` for late model overrides. Provider edits alone do not define auth methods.
Reference implementation: `vendor/opencode/packages/core/src/config/plugin/provider.ts:23`, `:54`, `:97`.
The public editors expose provider add/update/remove/models.set/models.update and model update/remove/default.set.
Sources: `vendor/opencode/packages/plugin/src/promise/provider.ts:15`, `promise/model.ts:7`, `promise/integration.ts:85`.
Custom provider update creates an empty record; custom model updates can create definitions within an available provider
(`vendor/opencode/packages/core/src/provider.ts:304`; `vendor/opencode/packages/core/src/model.ts:132`).
Translate v1 npm/api/options and model capabilities/costs/limits/variants rather than assigning v1 objects directly;
upstream supplies useful reference mappings at `core/src/v1/config/migrate.ts:107` and `:170`.
Keep provider credentials/OAuth in the separate auth/provider workstream; never put raw credentials in the plan fingerprint or report.

`enabled_providers` / `disabled_providers`: final remove-only provider transform implements Buddy allowlist/denylist;
absence means no restriction, empty enabled array means none, disabled wins an overlap **(inferred)**.
Upstream normalization instead emits `experimental.policies` with action `provider.use` (`core/src/config/normalize.ts:386`).
Do not put these in agent/session tool permissions; provider policy is a separate domain.
Respect upstream policy removals when applying late provider/model edits; never recreate a policy-removed provider.
Source: `vendor/opencode/packages/core/src/config/plugin/policy.ts:35`.

`model`: `ctx.model.transform(editor => editor.default.set(providerID, modelID))` supplies the Location fallback.
Explicit chat selections use `session.switchModel`; agent model refs retain variant. The default setter has no variant argument.
Sources: `vendor/opencode/packages/plugin/src/promise/model.ts:14`, `core/src/session/session.ts:96`.
Preserve explicit existing session choices on config refresh; changing notebook defaults should affect unresolved/new selections **(inferred)**.
Check agent-vs-session model choice in the prompt workstream; creating a v2 session does not automatically copy an agent model (`core/src/session.ts:284`).

`small_model`: no v2 global small-model slot. Upstream maps it to the `title` agent model (`core/src/config/normalize.ts:137`).
Apply that mapping with `ctx.agent.transform`; keep Buddy memory/helper small-model selection in Buddy's own model service **(inferred)**.
Do not apply it to every subagent or compaction request; compaction has its own agent model (`core/src/session/compaction.ts:214`).

`compaction`: canonical v2 config supports `auto`, `keep.tokens`, and `buffer` (`schema/src/config/compaction.ts:10`).
Upstream maps preserve_recent_tokens→keep.tokens and reserved→buffer, but marks prune and tail_turns unsupported (`core/src/config/normalize.ts:322`).
The settings transform exists only on internal `SessionCompaction.Service`; it is not in public promise `ctx`.
Source: `vendor/opencode/packages/core/src/config/plugin/compaction.ts:11`, `vendor/opencode/packages/plugin/src/promise/plugin.ts:26`.
The public compaction hook edits requests/results, not the automatic-compaction trigger or retention settings (`promise/session.ts:45`).
Recommendation: preserve all fields on read, expose a diagnostic for unsupported runtime effects, and request an upstream public
Location-scoped compaction editor. Until then notebook-specific auto/retention/buffer parity is unresolved **(inferred)**.
Host `config.content` can express a genuinely process-wide compaction default; do not collapse divergent notebook settings into it.
No vendored patch, internal service override, or second host is authorized by this research task.

## 3. Precedence and change propagation

### Avoid an early-transform precedence regression

SDK setup runs after internal pre plugins but before internal post config plugins (`core/src/plugin/supervisor.ts:138`).
Agent, command, skill, provider config plugins are post; MCP config is pre (`core/src/plugin/internal.ts:213`, `:249`).
Therefore ordinary setup transforms can lose Buddy defaults/overrides, reintroduce hidden skills, or lose `/flashcard` collisions.
Replaying them with reload does not change registration order (`vendor/opencode/packages/core/src/state.ts:178`, `:250`).

Proposed public-seam strategy **(inferred)**:
register a Location-scoped Buddy config-sync RPC in plugin setup, capturing `ctx` and the current plan controller.
Call it from Buddy's config preflight through the host client; the upstream RPC handler waits for plugin activation
before invoking the handler (`vendor/opencode/packages/server/src/handlers/rpc.ts:8`).
Install final agent/command/skill/model transforms there, once per plugin generation, after upstream config registrations.
Mark late registration order stale on `plugin.updated`; a retained SDK plugin can outlive a rebuilt post-plugin suffix.
At the next activation-gated sync, dispose/reinstall the final registrations if that order is stale **(inferred)**.
Otherwise reload the existing registrations. Cover this separately from config-value changes;
source: `vendor/opencode/packages/core/src/plugin.ts:108`, `:127`, `:175`.
`fromPromise` captures the plugin scope for registrations, including calls through retained domain methods
(`vendor/opencode/packages/plugin/src/promise/adapter.ts:240`, `:280`); test this late-registration lifecycle explicitly.
Do not use plugin.list as readiness: it just returns current inventory (`vendor/opencode/packages/core/src/plugin.ts:43`).
Do not await the external sync RPC from inside setup: it would wait for its own activation to finish.

Seed custom providers and integration methods during setup, before upstream provider policy filtering;
apply final settings/model overrides only to surviving provider records in the late pass **(inferred)**.
This avoids resurrecting policy-disabled providers while allowing Buddy's configured custom providers to participate normally.
MCP authority should register during setup after pre-config MCP; avoid letting unwanted raw MCP connections start,
then validate with an enabled raw server fixture that is a harmless task-owned process **(inferred)**.
Use late final MCP authority as needed for externally registered servers, but document that external plugins can have setup side effects.
Never claim that catalog removal undoes a server process already started by arbitrary external code.

### Routine notebook updates

1. Preserve `withConfigSync` as the route preflight (`packages/buddy/src/http/route-helpers.ts:39`).
2. Read/validate effective Buddy config, resolve project/root context without booting OpenCode recursively, prepare agents/skills/MCP/providers asynchronously.
3. Build a new immutable runtime plan and ordered-rule fingerprint; include referenced file content and skill catalog/pack revision **(inferred)**.
4. Use a per-canonical-notebook queue; publish a complete snapshot before replay, and await every affected active Location controller.
5. Through the sync RPC, install late registrations if this generation is new; otherwise call the affected domain reloads.
6. Reload integration→provider→model when those depend on each other; agents/skills/commands as affected; MCP only when server config changes.
7. Acknowledge the new applied revision only after synchronization succeeds; block dependent Buddy routes on failure and retry that revision.

Transforms are synchronous `(editor) => void`; no filesystem reads, awaits, or installation inside them
(`vendor/opencode/packages/plugin/src/promise/registration.ts:21`).
Reload invalidates state, rebuilds from a fresh base with every registered transform, and notifies consumers;
registration disposal also invalidates, so re-registering every edit is unnecessary and can change precedence.
Sources: `vendor/opencode/packages/core/src/state.ts:134`, `:172`, `:224`.
Multi-domain reload is not an atomic public transaction; gate Buddy's dependent requests until it completes **(inferred)**.
Already-running model requests retain their current request snapshot; propose changes take effect at the next request/step,
not by aborting active chats. Test mid-run changes separately, especially MCP replacement **(inferred)**.

Cold Locations rebuild from the latest plan; plugin cleanup aborts subscriptions and unregisters controllers/registrations.
Key controllers by canonical directory plus workspace placement/generation, rather than one controller per string directory **(inferred)**.
V2 Location identity also contains workspaceID (`vendor/opencode/packages/core/src/location-service-map.ts:38`).
Global Buddy config or shared skill mutations fan out only to active affected controllers and advance the shared revision.
Replace disposeAll callers at `packages/buddy/src/config/store/write-config.ts:159`,
`learning/skill-management/service/mutations.ts:41`, `library.ts:363`, and `system-installer.ts:299`.
For external edits, reset Buddy's global cache before recomputing; it currently stays memoized until explicitly reset (`store/global-cache.ts:5`).
Watch Buddy config/referenced skill files or rescan at preflight; upstream config discovery does not discover buddy.jsonc (`core/src/config/discovery.ts:11`).
Prevent installer/library reconciliation from recursively awaiting its own config-sync queue **(inferred)**.

### Alternatives that do not solve notebook refresh

`client.location.reload()` is available, but invalidates/reboots **all cached Locations**, not only the supplied directory;
source: `vendor/opencode/packages/server/src/handlers/location.ts:22`, `core/src/location-service-map.ts:20`.
Reserve it for explicit recovery; routine edits need domain reloads and no new host.
Re-registering an SDK plugin through `host.plugin(plugin)` updates the host-global store and every booted Location's generation
(`vendor/opencode/packages/core/src/plugin/sdk.ts:11`, `:35`); it is also too broad for one notebook edit.
`ctx.tool.reload()` refreshes only tool transforms, not agents/config/skills/providers; it is not a config refresh operation.
Host config options are creation-time strings/booleans shared by Locations; `config.content` is highest-priority inline input,
not a directory callback (`server/src/options.ts:27`, `sdk/src/internal/host.ts:28`, `core/src/config.ts:194`).
Keep host `config.directory` at Buddy's controlled runtime config root; retain read-only existing project discovery by default **(inferred)**.
`config.project:false` disables upward project discovery; it does not disable global config or all external compatibility roots
(`core/src/config/discovery.ts:33`, `:71`). Do not use it as an unexplained isolation shortcut.

## 4. Persisted compatibility without rewriting user files

Buddy should own the persisted schemas for the supported v1-shaped sections, not import the latest runtime schema as its file contract **(inferred)**.
Freeze accepted agent/provider/MCP/skills/permission shapes under `config/contract/legacy-opencode.ts`, retaining Buddy's Zod surface.
Continue JSONC parsing, duplicate-property validation, file/env substitutions, unknown-key tolerance on persisted reads,
strict API patch validation, root-key restrictions, and existing project/global precedence.
Sources: `packages/buddy/src/config/contract/document.ts:78`, `:129`, `packages/buddy/src/config/contract/compatibility.ts:94`.

Important existing write: the baseline reader adds `$schema` to files missing it (`contract/document.ts:136`).
Remove that read-time write for this upgrade's no-rewrite guarantee; keep schema metadata in memory, and insert it only on an explicit config write **(inferred)**.
Verify exact file bytes and modification time after read, sync, catalog reads, and first prompt, including files with no `$schema`.
User-requested Buddy config PATCH still edits the Buddy file through existing comment-preserving document operations;
runtime normalization must never invoke that write path.

V2 still contains legacy config schemas, but they live at `@opencode/core/v1/config/*`, **not** `@opencode/schema/v1/config/*`.
`schema/src/v1/*` contains legacy session/permission/etc. schemas; normalizer imports config schemas from core
(`vendor/opencode/packages/core/src/config/normalize.ts:21`).
Buddy can technically access the normalizer through an adapter facade: core exposes wildcard subpaths
(`vendor/opencode/packages/core/package.json:29`). This would be core coupling, not a promise plugin config API.
Use upstream normalizer/migrator as a parity reference or an optional bounded adapter implementation;
do not make persisted acceptance depend on its evolving permissive behavior **(inferred)**.

Reasons not to blindly normalize the whole Buddy document:

- It ignores unknown keys, can drop invalid leaves, and emits diagnostics rather than Buddy's existing validation errors (`core/src/config/normalize.ts:44`, `:57`).
- It drops enabled-only MCP entries (`:267`) and unsupported compaction prune/tail_turns (`:332`).
- It maps small_model only to title (`:137`), provider lists to managed policies (`:386`), and symbolic agent color to gray (`core/src/v1/config/migrate.ts:51`).
- Buddy fields such as personas/personalization/tools and schema refinements must retain their own product semantics (`packages/buddy/src/config/contract/schema.ts:98`, `:133`).

Project only selected runtime sections after Buddy validation; preserve missing-vs-empty values and ordered permissions.
Resolve variables once at each original document's source directory; avoid a second substitution pass against the notebook directory
that could change literal prompt content **(inferred)**. Existing adapter virtual substitution is at `packages/opencode-adapter/src/config.ts:129`.
Expose compatibility diagnostics with paths through Buddy config APIs; preserve unsupported values in the persisted representation.

## 5. Implementation in two work packages

### Package A: file contract and notebook runtime plan (Buddy config owner)

Own `packages/buddy/src/config/contract/{schema,document,compatibility}.ts`, new `legacy-opencode.ts`,
`config/opencode/{agents,models,skills,fingerprint,overlay-builder}.ts`, new `runtime/notebook-runtime-plan.ts`,
`store/{read-config,global-cache,config-paths}.ts`, and config unit/compatibility tests.
Add `normalizeLegacyAgent`, `normalizeLegacyProvider`, `normalizeLegacyMcp`, `translateLegacyPermissions`,
`buildNotebookRuntimePlan({config,directory,projectDirectory,skillRevision})`, and `fingerprintNotebookRuntimePlan(plan)` **(inferred)**.
Rename/remove overlay-builder after callers move; make the plan contain prepared domain values and diagnostics, not a v1 Config.Info blob.
Preserve legacy schemas, remove read-time `$schema` write, and use Buddy/project gateway root information without Instance.provide.
Replace notes worktree-relative-only patterns with actual v2 resources; retain semantics and ordered rules.
Test persisted JSONC substitutions, unknown future keys, alias fields, provider IDs/options, MCP OAuth/timeout/disabled-only,
absent/empty provider lists, unsupported compaction diagnostics, rule-order fingerprints, and zero file rewrites.

### Package B: plugin integration, refresh, and consumer replacement (runtime owner)

Own new `packages/buddy/src/opencode-runtime/plugins/notebook-config.ts`, new `opencode-runtime/notebook-config-controller.ts`,
`config/runtime/opencode-sync.ts`, `config/orchestration/project-config-service.ts`, `config/store/write-config.ts`,
`http/route-helpers.ts`, skill-management discovery/library/mutations/system-installer, and agent reference lookup.
Coordinate the plugin skeleton import/setup with its current owner; do not replace their tools/permission hooks.
Only the adapter owns `@opencode/*` imports/re-exports and RPC/client schema plumbing (`STATUS.md:40`).
Add `registerNotebookConfig(ctx, dependencies)`, `syncNotebookRuntimeConfig(directory)`,
`invalidateNotebookRuntimeConfig(directory)`, `refreshActiveNotebookSkillCatalogs()`, and a Location-scoped `buddy.config.sync` RPC **(inferred)**.
RPC takes a revision, not the whole config or secrets; the plugin calls Buddy config services for the prepared plan.
Have every agent/provider/command/skill/MCP-dependent Buddy route await this sync, including first-use catalog routes.
Move agent list/reference calls to directory-scoped host APIs; references should resolve stable agent ID separately from display name
(`packages/buddy/src/config/orchestration/project-config-service.ts:43`, `learning/prompt/workspace-file-references.ts:949`).
Replace skill discovery's parallel fresh/cached v1 config traversal with the same prepared catalog plus v2 skill list
(`packages/buddy/src/learning/skill-management/service/discovery.ts:91`, `:158`).
Replace dispose/disposeAll with affected-domain invalidation and lifecycle cleanup; preserve project mutation rollback/re-sync
(`packages/buddy/src/config/orchestration/project-config-service.ts:119`).

Delete `packages/opencode-adapter/src/config.ts` and `config-overlay.ts` once all schema and overlay consumers move.
Delete `agent.ts` and `skill-live.ts`/legacy `skill.ts` once public-client replacements cover their consumers;
delete `provider-live.ts` and config-hook portions of `plugin-live.ts` with the provider/plugin owners.
Delete old withConfigOverlay calls and ensureConfigServicePatched startup wiring; Instance wrappers disappear only after all workstreams migrate.
These deletions follow the ownership decision at `STATUS.md:43`; do not delete shared adapter wrappers while another workstream still needs them.

Rewrite `opencode-overlay-isolation.test.ts` against one isolated in-process host and two explicit Locations;
cover same-process refresh without restart, removal of prior contributions, aliases, generation cleanup, cold boot,
raw command retention, same-name collisions, raw MCP authority even when Buddy MCP is absent, and provider policy non-resurrection.
Rewrite `agent-default.test.ts` with actual v2 selections/catalog and explicit session choices.
Rewrite `external-directory-permission.test.ts` against real v2 permission resources/evaluation; cover macOS and Windows paths.
Strengthen `pollution-regression.test.ts` to assert no config.json/opencode.json/opencode.jsonc/.opencode generation,
unchanged existing Buddy/raw config bytes, and a valid prompt path instead of its current provider-only preflight flow (`:35`).
Replace the test-only v1 config-hook case with coexistence of an independent provider transform (`opencode-overlay-isolation.test.ts:269`).
Add focused lifecycle/reload tests for late scoped registrations and failed updates; no test should depend on a user's real home/state.
Acceptance includes explicit compaction-gap diagnostics until its public seam is resolved; do not call this full behavioral parity yet.
Run focused package scripts, then root `bun lint`, then `bun typecheck` sequentially for implementation; no formatter during research.

## 6. Product questions and proposed defaults

1. Existing raw OpenCode files: continue reading unrelated commands/agents/provider settings, with Buddy-owned fields winning collisions;
   Buddy MCP remains authoritative. This matches `packages/buddy/test/config/opencode-overlay-isolation.test.ts:171` **(inferred)**.
2. Config changes during a chat: preserve explicit selected persona/model; refresh policy/catalog for subsequent requests,
   do not abort the active model call. Disclose the eventual boundary if MCP transport is replaced **(inferred)**.
3. Small model scope: migrate title selection, retain Buddy helper-model behavior, leave compaction/subagent models independently configurable **(inferred)**.
4. Unsupported compaction controls: retain bytes/accepted fields, report unapplied effects, and require a public upstream seam before promising parity;
   do not silently reinterpret prune/tail_turns or force one global notebook policy **(inferred)**.
5. Hidden vs disabled agents and skills: hidden personas stay stored but are excluded from default/picker selection;
   disabled custom agents are removed; per-chat denials stay session permissions; vendor skill roots remain opt-in **(inferred)**.
6. Enabled-only MCP without a complete definition: disabled means absent, enabled means a clear config error;
   never import a raw OpenCode server implicitly to satisfy it **(inferred)**.

All defaults above are proposed design choices, not newly recorded migration decisions.
