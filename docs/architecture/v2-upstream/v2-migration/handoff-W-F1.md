# W-F1 handoff

Continue providers/auth/Codex account/catalog/images in the shared `v2-upgrade` worktree. Read `reports/w-f1-report.md` for the complete inventory, exact seams, design and verification. Re-read files before editing: other workstreams remain active. Do not change vendor, runtime/client, config internals, memory, permission routes or other gateway files under W-F1 ownership.

## Done

- Removed duplicate Buddy OAuth/refresh/request rewriting; registered `createOpenAICodexPlugin()` through the v2 plugin assembler.
- Added sanitized full provider catalog and lightweight alias RPCs in adapter gateway/provider.ts. Provider/auth/config-provider routes use v2 APIs and stable OAuth method/attempt IDs.
- Retained account email, usage and account-specific model inventory through a public credential resolver. Preserved caches/ETag/backoff and restored native static-gated account models through provider/model transforms.
- Added cross-Location single-flight for retained Buddy credential consumers; this does not guard native OpenCode callers.
- Moved image generation/editing into sanitized plugin RPCs with public credentials, cancellation, account headers and 401 reconnection status. Token-sharing credentials are excluded.
- Migrated web OAuth responses/cancellation and onboarding types to Buddy SDK. Added provider string form prompts/defaults/conditions and API-key answers to the dialog/schema.
- Deleted importer-free legacy adapter auth/provider-auth/provider/provider-live/installation/llm modules and their shared export lines.
- Added real-host provider/auth route tests, alias/method/form/credential tests, account model/image tests and a real-turn quota retry regression; updated web regressions.

## Status

| Goal | State |
|---|---|
| Provider list and config-provider projection | Implemented; real-host gateway and provider route tests pass |
| OAuth/API key flows and attempt isolation | Implemented; actual HTTP route and native integration tests pass |
| Narrow Codex plugin/account/model service | Implemented; account/model/image/quota tests pass |
| Credential single-flight | Buddy services covered; full native runtime guard pending |
| Codex images | Implemented; generate/edit/401/token-sharing tests pass |
| Legacy adapter cleanup | Six modules deleted with no remaining importers |
| Default-tools test | Auth blocker removed; separate feature/persona bootstrap cycle still fails |
| Web tests/typecheck and SDK generation | Blocked by an unowned legacy agent import and missing generated SDK |
| macOS/Windows desktop browser flow | Existing platform-neutral bridges inspected; live/browser/Windows execution unverified |

## Remaining work, in order

1. Coordinate with the bootstrap/feature/config owners to fix isolated `default-tools.test.ts`. Direct discovery fails at `shared-features.ts:28` with `memoryFeature` before initialization. Priming the existing bootstrap helper instead failed at `persona-profiles.ts:15` with `REGISTERED_BUDDY_PERSONAS` before initialization. The test was not weakened and the attempted priming was removed. Eager runtime-client imports from memory consumers are part of the graph; W-F1's retained account/image facades already defer their client imports.
2. Coordinate with agent/compatibility owners to remove the remaining `opencode/agent/agent` import in adapter/agent.ts. Run the full SDK package generation script in temporary HOME/XDG/Buddy roots and with an unreachable loopback `API_URL` to import local source rather than contacting an existing Buddy server. Do not generate a partial replacement SDK or hand-edit generated files.
3. Run `bun run --cwd packages/web test test/provider-auth.test.ts test/onboarding-flow.test.ts`, then the web package typecheck. SDK types must include auth method IDs, prompt metadata, answers, authorization attempt/method IDs and expiry. Review `ConnectProviderDialog` rendering after compilation; browser use still requires explicit user approval.
4. Decide/authorize a tracked upstream/vendor refresh guard or obtain a public upstream refresh-wrapper seam. `core/src/integration.ts:696–714` has no generic lock, and its `authorize` helper only wraps errors. Native model resolution and built-in credential-event listeners bypass `resolveIntegrationCredential`. Public method editors do not expose original authorize/refresh functions and replacements require real authorize. Do not restore Buddy's duplicate OAuth flow or monkey-patch Effect internals to conceal this limitation.
5. Optionally have the web state owner retain `ProviderAuthMethod.id` in ProviderMethodInfo and catalog normalization. The dialog already uses freshly read IDs; onboarding still uses the legacy normalized index with a fresh-list resolution wrapper.
6. Orchestrator runs root lint/typecheck and full integration smoke after all workstreams land. No dependency change is needed for W-F1.

## Traps and accepted behavior

- Never proxy `credential.list`: it contains secrets. All production Buddy RPC outputs are sanitized. Credential-list calls in the regression tests are internal fixture assertions only.
- Register either `createOpenAICodexPlugin()` or the standalone `createProviderCatalogPlugin()` on a Location, not both. Codex registers the catalog RPC itself.
- Catalog must read definitions before available lists because preparation can refresh account inventory. The temporary editor snapshot captures disabled/inactive definitions; HTTP lists alone are insufficient.
- Editor models use branded/DeepMutable values. JSON-normalize editor snapshots before decoding native Model.Info; present-but-undefined optional properties fail the native decoder. JSON-normalize RPC output too: undefined values are not JSON.
- Native OAuth connect with an unknown method dies as an upstream 500. Buddy checks safe integration metadata first and returns 404. Native method/attempt/authorization errors are classified at the route boundary.
- Native string form answers must include hidden defaults and exclude inactive conditional fields. The retained UI supports current shipped provider string forms, not hypothetical non-string third-party forms.
- A rejected image/account token marks `needs_auth` only when its credential is still active. Codex image credentials must be the legacy browser/headless method, not token-sharing.
- Account models are connection-bound. Late model responses after a switch must not replace another account's inventory. Post config/policy transforms remain authoritative.
- Native OAuth callback branding/loopback behavior is accepted as recorded in migration decisions. No new Buddy callback server or desktop-only URL handler remains.
- Existing web `reloadProviderRuntime` now calls W-F2's scoped configuration refresh `/global/dispose`, not the removed v1 global disposal.
- Public integration credential resolution has no per-call signal seam; account HTTP/catalog/image requests do. The helper guard protects retained Buddy consumers only.
- Do not touch another agent's lock/process. One additional typecheck invocation was refused by the shared lock; it was left intact.

## Verification

Final focused Buddy command, from packages/buddy:

```sh
bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts test/opencode-runtime/openai-codex-account.test.ts test/opencode-runtime/openai-codex-auth.test.ts test/opencode-runtime/openai-codex-provider.test.ts test/opencode-runtime/provider-model-resolution.test.ts test/provider-auth-routes.test.ts
```

28 tests passed, 0 failed, 118 assertions. Separate default-tools invocation failed with the bootstrap cycle above. Adapter/Buddy package typechecks have outside-ownership failures; owned filters were clean on completed runs. Web checks cannot start without generated SDK. SDK generation fails on the unowned adapter agent import. Owned oxlint and import-contract results are finalized in the report. No root lint/typecheck, install, full-suite/vendor tests, real-state access or browser execution was performed.

Final recorded results: owned-file oxlint passes without warnings; owned-path `git diff --check` passes. Completed adapter/Buddy package typechecks have no W-F1 errors after filtering. Import-contract has one remaining outside-ownership ingest-full-text test finding and no W-F1 findings. Final importer search found no references to the six deleted adapter modules.
