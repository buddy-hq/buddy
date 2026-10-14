# W-F1 — providers, auth, Codex account, catalog and images

Status: implementation landed in the shared worktree; integration verification remains blocked as described below. No commit, install, vendor edit, real account request, browser automation or real Buddy-state access was performed. Re-read the active files and wave-1 review after resuming. The additional review findings assigned to W-C2/W-F2 and the independent permission/memory fix agent were left to those owners.

## Design

V2 owns browser/device OAuth, token storage/migration, refresh HTTP and Codex request routing. Buddy's duplicate authorization server, token exchange, refresh endpoint and request loader are removed. `buddy.codex` is a v2 `Plugin.define` plugin registered alongside `buddy.runtime`; it retains account email/usage, account-specific model inventory, image generation/editing, sanitized tracing and the code-specific quota retry veto.

Credentials stay inside the plugin. `createOpenAICodexCredentialResolver` obtains the active connection through `ctx.integration.connection.active`, resolves it through the public credential seam, checks reported `needs_auth` status, and accepts only `chatgpt-browser` / `chatgpt-headless`. It rechecks the active credential ID after resolution. Token-sharing OAuth and API keys cannot authorize the legacy Codex image endpoint. Account and image 401 responses report `needs_auth` only if the rejected credential is still active. Identity responses are checked against the current account/access token before returning an email.

The adapter catalog joins sanitized plugin definitions with available provider/model/integration lists. The `buddy.providers` RPC captures inactive provider definitions and disabled models through the public provider/model editors, after post configuration and policy transforms. It never exports provider settings, model settings, headers, credential values or endpoint URLs. The lightweight `integrations` RPC resolves aliases without fetching the full catalog or refreshing account models. This also works for disconnected aliases.

Buddy keeps `{all, default, connected}` and `/config/providers` keeps `{providers, default}`. Disconnected providers retain their model inventory. Available providers expose enabled models to the existing picker; the full plugin catalog still contains disabled definitions and the model projection adds `enabled`. Defaults prefer the native selected model for its provider, otherwise the latest released enabled nondeprecated model. Native model arrays/variants/modalities/cost tiers are projected to Buddy's existing schemas. Model/provider OpenAPI component names remain `Model` and `Provider`.

OAuth starts take an explicit `methodID`; completion/cancellation target the returned `attemptID`. The web authorization wrapper can use a stable method ID and still accepts the existing picker index, resolving that index against a fresh sanitized method list. Each dialog/onboarding attempt retains its own returned IDs, including late-start cancellation after an abort. Native string authentication forms are projected to text/select prompts, including required fields, hidden defaults and visibility conditions. The dialog reads current method definitions and sends active answers for OAuth and API-key forms. Current shipped provider forms use string fields; non-string forms from future third-party plugins are not projected.

`createProviderRoutes` and `createAuthRoutes` accept a host supplier, allowing route tests to use the actual v2 host without module mocks. Provider errors preserve native 400/404 classifications. OAuth method presence is checked before connecting: native v2 dies with a 500 for an unknown OAuth method, so Buddy returns 404 before reaching that defect. Account-route calls use the same supplied host through `createOpenAICodexAccountClient`.

The account model plugin binds inventory to the credential connection that produced it, restores upstream-gated account-approved models and limits/variants, and leaves post configuration/policy transforms authoritative. Cached inventories are prepared before the catalog snapshot. Catalog fetches have a five-second signal and ordinary service requests have a five-second timeout; the public integration credential resolver itself has no per-call timeout seam.

Images retain `gpt-image-2`, generation/edit endpoint selection, JSON image arrays, bearer/account headers and cancellation. The production image facade calls the plugin image RPC in the sandbox/bootstrap location; the existing caller does not supply a directory, and credentials are global.

## Inventory

Created:

- `packages/opencode-adapter/src/gateway/provider.ts`
- `packages/opencode-adapter/src/gateway/integration.ts`
- `packages/buddy/test/provider-auth-routes.test.ts`
- This report and `docs/architecture/v2-upstream/v2-migration/handoff-W-F1.md`.

Changed:

- `packages/buddy/src/routes/provider.ts`
- `packages/buddy/src/routes/auth.ts`
- `packages/buddy/src/routes/config.ts` — provider endpoint/imports only; other config endpoints retain the Buddy services.
- `packages/buddy/src/opencode-runtime/plugins/openai-codex-auth.ts`
- `packages/buddy/src/opencode-runtime/plugins/openai-codex-credentials.ts`
- `packages/buddy/src/opencode-runtime/plugins/openai-codex-account.ts`
- `packages/buddy/src/opencode-runtime/plugins/openai-codex-provider.ts`
- `packages/buddy/src/opencode-runtime/plugins/openai-auth-trace.ts`
- `packages/buddy/src/opencode-runtime/plugins/index.ts` — Codex import/entry only.
- `packages/buddy/src/learning/features/image-generation/service/codex-images.ts`
- `packages/buddy/test/opencode-runtime/openai-codex-account.test.ts`
- `packages/buddy/test/opencode-runtime/openai-codex-auth.test.ts`
- `packages/buddy/test/opencode-runtime/openai-codex-provider.test.ts`
- `packages/buddy/test/opencode-runtime/provider-model-resolution.test.ts`
- `packages/web/src/lib/provider-auth.ts`
- `packages/web/src/lib/onboarding-flow.ts`
- `packages/web/src/components/connect-provider-dialog.tsx`
- `packages/web/src/components/settings/settings-providers.tsx`
- `packages/web/src/components/directory-chat/session-context-usage.tsx`
- `packages/web/test/provider-auth.test.ts`
- `packages/web/test/onboarding-flow.test.ts`
- `packages/opencode-adapter/src/index.ts` — removed obsolete module re-export lines only.
- `packages/opencode-adapter/package.json` — removed obsolete module export lines only; `gateway/*` already exists.

Deleted, after checking importers throughout packages including tests/web:

- `packages/opencode-adapter/src/auth.ts`
- `packages/opencode-adapter/src/provider-auth.ts`
- `packages/opencode-adapter/src/provider.ts`
- `packages/opencode-adapter/src/provider-live.ts`
- `packages/opencode-adapter/src/installation.ts`
- `packages/opencode-adapter/src/llm.ts`

No remaining importers of those six modules were found. `provider-icon.ts` remains: its imports already reference the v2 UI paths. `default-tools.test.ts` retains its existing feature-catalog assertions; its obsolete auth import blocker is removed, but it now hits the separate bootstrap cycle below.

## Seams

- `createOpenAICodexPlugin(options?: {fetch?: AccountFetch; now?: () => number}): Plugin.Plugin`, in `openai-codex-auth.ts`. `AccountFetch` is the account service's injected fetch signature. The production plugin assembler already registers it. W-E must preserve the Codex entry when adding plugins.
- `registerProviderCatalog(ctx: PluginContext, prepare?: () => Promise<void>)`: registers sanitized `buddy.providers` methods. Production registers it inside `buddy.codex`; `createProviderCatalogPlugin()` is available for hosts/tests without Codex services. Do not register both on the same Location.
- `listProviderCatalog(client: ProviderCatalogClient, directory: string): Promise<z.infer<typeof providerListSchema>>`, where `ProviderCatalogClient = Pick<OpenCodeClient, "provider" | "model" | "integration" | "rpc">`.
- `readProviderIntegrations(client: Pick<ProviderCatalogClient, "rpc">, directory: string): Promise<Record<string, string>>` resolves provider ID → integration ID, including inactive aliases.
- `listProviderAuth(client, directory)` returns safe OAuth/API method metadata and string prompts. `startProviderOAuth(client, directory, providerID, {methodID, answers?})` returns `{url, instructions, method, methodID, attemptID, expiresAt}`. `completeProviderOAuth(client, directory, providerID, {attemptID, methodID?, code?}, signal?)` polls completion. `cancelProviderOAuth(client, directory, providerID, attemptID)` cancels only that attempt.
- `setProviderKey(client, directory, providerID, key, answers?)` and `removeProviderCredentials(client, directory, providerID)` resolve aliases through the public catalog seam. Removal deletes all stored credential connections for that integration, preserving v1 disconnect semantics. No secret credential-list route was introduced.
- `resolveIntegrationCredential(ctx: PluginContext, connection: ConnectionInfo): Promise<Credential.Value | undefined>` shares refresh resolution by credential ID across Buddy consumers and Locations. It is an internal server helper, not a web API.
- `createOpenAICodexAccountClient(getClient: () => Promise<Pick<OpenCodeHost, "rpc">>)` returns `readIdentity(directory)`, `readModelAvailability(directory)`, `refreshModelAvailability(directory)` and `readUsage(directory, refresh?)`. The existing `openAICodexAccountService` name remains as the production facade.
- `createProviderRoutes(input?: {getClient: () => Promise<OpenCodeHost>})` and `createAuthRoutes(input?: {getClient: () => Promise<OpenCodeHost>})` preserve the production `ProviderRoutes`/`AuthRoutes` exports.
- RPC `buddy.providers`: `catalog({}) → {providers}`; `integrations({}) → Record<string,string>`.
- RPC `buddy.codex`: `identity({}) → OpenAIAccountIdentityResponse`; `models({refresh:boolean}) → OpenAIModelAvailabilityResponse`; `usage({refresh:boolean}) → OpenAIUsageResponse`; `image({prompt:string,imageDataUrls:string[]}) → {base64:string,operation:"generate"|"edit"}`. RPC context cancellation reaches the image request. None returns credentials.
- SDK generation must incorporate `ProviderAuthMethod.id`, prompt fields, authorization `methodID`/`attemptID`/`expiresAt`, API-key `answers`, and OAuth request bodies. The current web state normalizer outside W-F1 still keeps only method type/label (`state/chat-types.ts`, `state/chat-actions.ts`). Retaining IDs there would let onboarding selection carry the stable ID directly; the current wrapper refreshes the method list before resolving its legacy index.

## Decisions for the user and remaining integration work

**Full runtime refresh single-flight remains unresolved.** V2 `core/src/integration.ts:696–714` reads an expiring credential, calls refresh and persists it without a generic lock. Its `authorize` helper at 397 only wraps errors. Built-in OpenAI/ChatGPT listeners and native ModelResolver calls bypass Buddy's helper. The public method editor exposes metadata, not the original authorize/refresh implementations; replacing a method requires a real authorize implementation. A refresh-only wrapper cannot be implemented through that seam while also deleting Buddy's duplicate OAuth implementation. The behavior-preserving work here keeps a guard for all retained Buddy services. A tracked upstream/vendor integration patch or a new public upstream seam is needed for a guard covering native requests and listeners; vendor edits were not authorized. This is a concrete remaining concurrency risk, not a claim that the guard goal is complete.

SDK generation is blocked by `packages/opencode-adapter/src/agent.ts` importing `opencode/agent/agent`. This is outside W-F1. Once its owners migrate remaining agent/compatibility consumers, regenerate the complete Buddy SDK and run the web checks. Do not fabricate a provider-only replacement SDK.

The isolated `default-tools.test.ts` fails during import with `Cannot access 'memoryFeature' before initialization` in `learning/personas/shared-features.ts:28`. Priming the existing bootstrap helper instead produced `REGISTERED_BUDDY_PERSONAS` before initialization in `persona-profiles.ts:15`, so that attempted test-only priming was removed. The cycle runs through feature/memory consumers that eagerly import `opencode-runtime/client`, the runtime plugin/config graph and personas. Fix the bootstrap/eager-client imports with their owners; W-F1's account/image facades already defer client imports. Do not delete/relax the feature-catalog test to conceal this failure. No permission route, session gateway or memory source was edited here.

Native OAuth callback branding and loopback behavior are adopted as decided. Desktop provider browser openings use the existing renderer platform → preload IPC → Electron `shell.openExternal` bridge on both macOS and Windows. Native Node HTTP loopback code is platform-neutral. Actual Windows/browser/live-account flows remain unverified. No new dependency is required.

## Verification

All Buddy commands ran from `packages/buddy` with the sandbox preload. Final focused command:

```sh
bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts test/opencode-runtime/openai-codex-account.test.ts test/opencode-runtime/openai-codex-auth.test.ts test/opencode-runtime/openai-codex-provider.test.ts test/opencode-runtime/provider-model-resolution.test.ts test/provider-auth-routes.test.ts
```

Covers service cache/ETag/backoff/account behavior; concurrent attempts and form answers; disconnected aliases; secret omission; credential removal; refresh single-flight across real notebook Locations; native model gating restoration; image generation/edit/401 handling; token-sharing exclusion; a real session-turn quota retry veto; and actual HTTP route validation/status/attempt targeting. Final result is recorded below after the last run.

`bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts test/opencode-runtime/default-tools.test.ts`: fails with the unowned bootstrap cycle described above.

`bun run --cwd packages/opencode-adapter typecheck`, then `bun run --cwd packages/buddy typecheck`: package-wide failures remain outside W-F1; owned file filtering was clean. A subsequent Buddy invocation was refused by the shared typecheck lock while another agent was running; the lock/process was not modified. Final rerun status is recorded below.

`bun run --cwd packages/web typecheck`: stops before TypeScript because `src/gen/sdk.gen.ts` is absent.

`bun run --cwd packages/web test test/provider-auth.test.ts test/onboarding-flow.test.ts`: cannot load `@buddy/sdk` because `./gen/types.gen.js` is absent; the runner terminates its sibling process. New web regressions are therefore present but unverified.

SDK generation used the package's `generate` script under `script/run-test-command.ts` with a temporary-root launcher, isolated HOME/XDG/Buddy roots, disabled external fetch flags and `API_URL=http://127.0.0.1:1/doc` to force importing the local backend. It fails on the unowned legacy agent import above. The temporary launcher is `/tmp/wf1-generate-sdk.ts`; no generated SDK sources were hand-edited.

Owned-file oxlint using the root `.oxlintrc.json` was run; final result is recorded below. `bun ./script/check-import-contract.ts` reports no W-F1 findings; the remaining finding was `packages/buddy/test/learning/ingest-full-text-plugin.test.ts` importing `@opencode-ai/plugin` (outside ownership). Root lint/typecheck, full suites, vendor tests and browser automation were not run, per the workstream brief.

Final recorded results (2026-10-08): **28 focused Buddy tests passed, 0 failed, 118 assertions** across the five files above. **Owned-file oxlint passed without warnings**, including the shared adapter index; **owned-path `git diff --check` passed**. Completed adapter and Buddy package typechecks exited 2 with migration errors outside W-F1; filtering all W-F1 sources/tests and the new gateways found **no errors**. The later Buddy rerun succeeded in acquiring the shared lock after the other agent finished. The import-contract check still has the single outside-ownership ingest-full-text test finding, with **no W-F1 findings**. Final importer search still found no references to the six deleted adapter modules. Web tests/typecheck, full SDK generation, the isolated default-tools bootstrap, native refresh concurrency, live OAuth and desktop/browser/Windows behavior remain unverified or unresolved as explicitly described above.
