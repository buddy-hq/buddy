# Wave 2A independent review

Reviewed finished W-G1, W-F1, and the fx-review1 permission-containment/memory-archive fixes against baseline `a99d5c41a3`, their reports/handoffs, the migration decisions, and the vendored v2 client/protocol/schema/plugin implementation. Concurrent W-C2, W-F2, W-E1, and W-T work was excluded. Documented deferrals, including native/Buddy refresh single-flight and the blocked full SDK generation, are not findings; finding 2 identifies a caller change required by the new route contract when generation becomes possible.

Validation: **81 focused Buddy tests passed across 16 files**, and scoped oxlint checks passed. Sandboxed probes exercised actual Hono config/provider routes, real v2 notebook transforms and catalogs with the production Codex plugin, native credential refresh followed by a delayed image rejection, and a temporary SDK generated from the scoped auth/provider OpenAPI with the repository's generator configuration. No root lint/typecheck/test, browser verification, live OAuth, real user-state access, or source edits were performed. Only this report was written.

Findings: **2 P1, 3 P2, 0 P3**.

### 1. [P1] Config responses expose resolved API keys and MCP secrets to the web client

**Locations:** `packages/buddy/src/routes/config.ts:156`, `packages/buddy/src/routes/config.ts:183`, `packages/buddy/src/routes/config.ts:215`, and `packages/buddy/src/routes/config.ts:248`; substitution occurs at `packages/buddy/src/config/contract/document.ts:82`.

**Failure scenario:** A notebook config stores a provider API key as `{env:REVIEW_FIXTURE_KEY}` and an MCP server has an authorization header or OAuth client secret. `GET /config/raw` and `GET /config` return the resolved configuration directly, including all three secret values. The merged read also incorporates global configuration (`config/store/read-config.ts:39`). Config mutation responses return the same unredacted shape, so editing an unrelated setting can expose existing credentials across the server-to-renderer boundary.

**Evidence:** Actual Hono requests in a temporary notebook returned HTTP 200 for both read endpoints. Each response contained the resolved fixture API key, the fixture `Authorization: Bearer ...` header, and the fixture `oauth.clientSecret`. `/raw` therefore exposes environment-resolved secrets as well as literal file contents. No response projection intervenes between the config loaders and `c.json()`. This is the pre-existing route exposure explicitly acknowledged in the W-G1 report's security handoff; it remains unaddressed in the finished wave.

**Suggested fix:** Introduce a web-safe config projection for every config read/write response, omitting credential-bearing provider options, MCP credentials, and authorization headers, including inherited global values. Keep secrets and substitution expressions server-side; preserve them when clients patch other fields. Add route tests with literal, environment-substituted, and inherited credentials that assert they never appear in responses.

**Confidence:** CONFIRMED by actual config-route responses and tracing the substitution/merge paths.

### 2. [P1] The API-key dialog uses a body parameter the regenerated SDK no longer accepts

**Locations:** `packages/web/src/components/connect-provider-dialog.tsx:285`, `packages/buddy/src/routes/auth.ts:35`, and `packages/sdk/scripts/generate.ts:233`.

**Failure scenario:** A user connects any API-key provider after generating the SDK from the migrated routes. The dialog still calls `auth.set({ providerID, auth: { type: "api", key, answers } })`. The route now describes an inline object rather than the previous named Auth schema. With `paramsStructure: "flat"`, the generator exposes `type`, `key`, and `answers` directly on the parameters object. It does not read `parameters.auth`. The current call consequently supplies no request body, and the route's required JSON/key validation rejects the connection. Web typechecking with that SDK also rejects the obsolete `auth` property.

**Evidence:** Generated an auth/provider-only SDK into the test sandbox from the actual Hono OpenAPI, using the repository's installed generator and SDK settings. The generated `set()` maps body arguments from `parameters.type`, `parameters.key`, and `parameters.answers`. Calling that generated method with the dialog's exact parameter shape produced an empty HTTP body. Baseline `routes/auth.ts` used `OpenCodeAuth.Info`, which generated the named `auth` parameter. Existing auth-route tests send the correct JSON body directly and do not exercise this SDK/web seam.

**Suggested fix:** Change the caller to the flattened `{ providerID, type: "api", key, answers }` contract, or give the route body a stable named Auth schema that deliberately preserves the existing generated parameter. Once integration permits full SDK generation, regenerate it and verify the actual dialog request contains the key and conditional answers. This caller mismatch can be fixed independently of the recorded generator blocker.

**Confidence:** CONFIRMED by isolated SDK generation and capturing the generated client's outgoing request.

### 3. [P2] A delayed rejection of an old token invalidates successfully refreshed Codex credentials

**Locations:** `packages/buddy/src/opencode-runtime/plugins/openai-codex-auth.ts:17`, `packages/buddy/src/opencode-runtime/plugins/openai-codex-credentials.ts:25`, and `packages/buddy/src/learning/features/image-generation/service/codex-images.ts:71`.

**Failure scenario:** An image request captures OAuth access token A. While its HTTP response is pending, native credential resolution successfully refreshes that credential to token B. V2 persists B under the same credential ID (`vendor/opencode/packages/core/src/integration.ts:712`). The old request then returns 401. `onRejected()` compares only the active credential ID with the ID captured by the request and marks the now-valid connection `needs_auth`. Subsequent Buddy credential resolution throws before using token B, and usage/images require reconnection despite the successful refresh.

**Evidence:** A real v2 host with a fixture OAuth refresh implementation paused the actual Codex image RPC's fake HTTP response, refreshed through the native public connection resolver, and then released the old request with HTTP 401. The credential's refreshed value retained its ID; afterward its connection status was `needs_auth`, and the usage RPC returned `{ status: "reconnect_required" }`. No live account or network request was used. This requires only one successful refresh and a delayed response; it is independent of the deferred concurrent-refresh single-flight issue.

**Suggested fix:** Bind rejection to the credential value/version used by the request. Before setting `needs_auth`, verify both the active credential ID and its current access token/version still match the rejected auth snapshot. Preserve a newer successful refresh. Apply equivalent protection to rejection paths that can persist connection status, and test refresh-between-request-and-401 ordering.

**Confidence:** CONFIRMED by the actual plugin/image RPC, native credential refresh, and subsequent status/usage reads.

### 4. [P2] The catalog restores models removed by notebook whitelist/blacklist transforms

**Locations:** `packages/opencode-adapter/src/gateway/provider.ts:56`, `packages/opencode-adapter/src/gateway/provider.ts:93`, and `packages/buddy/src/config/runtime/notebook-config-plugin.ts:123`; the picker consumes the result at `packages/web/src/state/chat-actions.ts:842`.

**Failure scenario:** A connected custom provider defines models `keep` and `removed`, with notebook `whitelist: ["keep"]`. The notebook model transform correctly removes `removed` from v2's available models. The catalog enumerates the provider's original input models and falls back to the original `source` whenever `editor.get()` returns undefined. That fallback restores the removed model with its original enabled state. Joining native available models only adds/overwrites entries; it never removes this restored entry. The web picker offers a model that the runtime cannot resolve, and the catalog can select it as a fallback default when its release date wins.

**Evidence:** On a real notebook host with the production Codex plugin and after explicit notebook synchronization, native `model.list()` returned only `["keep"]`, while `listProviderCatalog()` returned `["keep", "removed"]` for the connected provider. The public model-editor contract explicitly describes `editor.provider` as immutable inputs before model transforms (`vendor/opencode/packages/plugin/src/promise/model.ts:18`); native removal deletes only the transformed model map (`core/src/model.ts:150`). The web normalizer excludes deprecated models but retains this enabled restored model.

**Suggested fix:** For available providers, snapshot transformed candidates from `editor.list(providerID)` and use the native enabled-model list for selectable models/defaults. Use original provider-input templates only for inactive-provider discovery, without interpreting a removed available model as an inactive template. Cover notebook whitelist, blacklist, and an independent model-removal transform in catalog tests.

**Confidence:** CONFIRMED by comparing native and Buddy catalogs on the same synchronized host and reading the v2 editor contract.

### 5. [P2] Cold provider routes skip the sync needed to make notebook policy authoritative

**Locations:** `packages/buddy/src/routes/provider.ts:63`, `packages/buddy/src/routes/provider.ts:88`, and `packages/buddy/src/routes/auth.ts:42`; transform ordering is repaired only at `packages/buddy/src/config/runtime/notebook-config-plugin.ts:193` through `packages/buddy/src/config/runtime/opencode-sync.ts:41`.

**Failure scenario:** The first provider request opens a notebook whose `.buddy/buddy.jsonc` disables provider `fixture`, while a raw `opencode.json` enables that provider. The route obtains the host and reads its catalog without calling `syncNotebookRuntimeConfig()`. The notebook plugin initially registers its policy transforms during setup; later raw post-configuration transforms override that policy. The notebook plugin deliberately starts with `staleOrder = true` and only re-registers after post configuration when its sync RPC runs. Since the provider route never invokes it, the first catalog reports the disabled provider as connected and selectable. External notebook edits can likewise remain stale until another operation performs config sync.

**Evidence:** Actual `createProviderRoutes()` requests against a real notebook host with the production Codex plugin returned HTTP 200 with `fixture` both connected and present in the catalog before sync. Calling `syncNotebookRuntimeConfig()` and repeating the same request removed it from both collections. Catalog preparation waits for activation/account inventory but does not perform notebook sync. The baseline fetch wrapper applied `withConfigOverlay()` for scoped native requests; the new host client has no equivalent automatic preflight. Focused notebook collision tests always synchronize first, masking the route omission.

**Suggested fix:** Await `syncNotebookRuntimeConfig(client, resolvedDirectory)` before provider/catalog and configuration-dependent auth operations, using the route's injected client and retaining bootstrap-directory behavior. Map config validation failures appropriately. Add a cold-route test with conflicting raw/Buddy provider policy and a subsequent external-config edit; neither should require a prior agent listing or chat turn to observe notebook policy.

**Confidence:** CONFIRMED by before/after requests through the actual provider route and tracing initial/late transform ordering.

Verified correct seams:

- After preflight, notebook transforms preserve Buddy precedence, unrelated raw commands, authoritative-empty MCP, explicit session model choices, and updates/removals across isolated notebooks, aliases, and nested contexts without replacing sessions. Focused tests cover those behaviors.
- Config reads leave user files unchanged; explicit JSONC writes preserve comments, unknown fields, and source substitutions. Parse errors report locations without echoing document contents. Skill discovery/mutations and upstream visibility tests pass under temporary roots.
- Provider/catalog and Codex RPC projections omit credential values, provider/model settings, headers, and endpoint URLs. Disconnected aliases retain their integration mapping; native OAuth operations use stable method/attempt IDs, and focused tests cover independent completion and cancellation. These sanitized projections do not fix finding 1's separate config routes.
- Production plugin construction registers both `buddy.runtime` and `buddy.codex`. Account-model inventories are bound to their producing credential connection; identity rechecks current auth before returning email. Token-sharing OAuth and API keys cannot authorize the legacy Codex image endpoint, image cancellation reaches the request, and code-only quota errors stop retrying a real v2 turn.
- The fx-review1 permission fix uses canonical session-directory containment independently of project-ID equality and checks descendants. Focused route tests reject cross-notebook access even with shared global project IDs. Memory startup now shares the archive predicate and excludes Buddy-metadata archives.
- Reviewed test helpers use configured temporary runtime/config/state roots. Scoped oxlint checks found no violations in the inspected finished implementation files.
