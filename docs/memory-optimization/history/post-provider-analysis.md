# Post-Provider Memory Analysis

**Created:** Tue Jun 23 2026
**Purpose:** Summarize what the provider optimization fixed, what remains, and where the next optimization should focus.

## Provider Result

The provider optimization was completed and measured with the rebuilt Windows production sidecar.

Before the fix, from `log/memory-main-measurement-current-script.json`:

| Probe | Private | Working set | Notes |
|---|---:|---:|---|
| First `/api/provider` | 781.0 MB | 565.9 MB | Default provider payload was 3,896,029 bytes. |
| Peak | 935.6 MB | 650.5 MB | Full provider/model runtime path ratcheted memory. |
| Final after 30s settle | 858.4 MB | 574.0 MB | Idle memory stayed in the bad 500-900 MB range. |

After the provider split plus cheap health/auth paths, from `log/current-provider-split-health-auth-light.json`:

| Probe | Private | Working set | Notes |
|---|---:|---:|---|
| Ready after healthz poll | 468.9 MB | 293.0 MB | Startup floor before provider requests. |
| `/api/provider` | 465.6 MB | 293.3 MB | Default provider payload is 16,472 bytes. |
| `/api/provider/auth` | 443.7 MB | 292.8 MB | Lightweight auth listing does not boot runtime. |
| Final after 30s settle | 437.7 MB | 292.0 MB | The provider ratchet is gone in this probe shape. |

Net result:

- Settled working set dropped from about 574.0 MB to about 292.0 MB.
- Settled private memory dropped from about 858.4 MB to about 437.7 MB.
- Default `/api/provider` response dropped from 3,896,029 bytes to 16,472 bytes.
- The 800-900 MB idle backend behavior is no longer reproduced by the provider probe.

## Plan Adherence Review

The provider optimization followed the broad demand-splitting plan, but it did not perfectly satisfy every strict anti-duplication constraint.

What was faithful:

- Default `/api/provider` is metadata-only and returns zero model objects.
- Model-bearing provider demand is explicit through `models=usable`.
- The explicit usable-model path still uses the OpenCode provider runtime/helpers instead of locally transforming model objects.
- OAuth authorize/callback still go through the OpenCode client/runtime path.
- Disconnected ChatGPT model/usage endpoints short-circuit cheaply and avoid booting the account service.

What is a gray area or divergence:

- `packages/opencode-adapter/src/provider-catalog.ts` hand-scans `models.json` for provider `id`, `name`, and `env` metadata. This is related to the provider optimization, not unrelated work. It does not parse model objects or implement connected-provider model behavior, so it avoids the worst forbidden path. Still, it is a handwritten catalog parser and should be reviewed as a maintenance risk.
- `packages/buddy/src/routes/provider.ts` manually reads only provider-related config fields from `buddy.jsonc`, `buddy.json`, `BUDDY_CONFIG`, and `BUDDY_CONFIG_CONTENT`. This avoids loading the full config/runtime stack on the passive provider path, but it duplicates a subset of config semantics.
- `ProviderCatalog.authMethods()` currently returns a hand-maintained built-in auth-method map for several providers. This is the clearest divergence from the plan's strict requirement that OAuth/plugin auth methods come from canonical OpenCode provider auth hooks. Actual OAuth execution still uses the runtime path, but the listing metadata can drift or miss plugin-provided methods.

Reviewer conclusion:

- The measured provider memory fix is real.
- The model-materialization rule was mostly honored.
- The provider auth-method listing is not fully plan-faithful.
- The metadata/config parsing shortcuts are bounded and intentional, but should either be accepted as a lightweight metadata contract or replaced with a generated/vendor-backed metadata helper.

Recommended cleanup options:

1. Replace the handwritten `models.json` scanner with a generated provider metadata index or a vendor/adapter helper that exposes metadata without model materialization.
2. Replace the hand-written auth-method map with a lazy, scoped canonical auth-method endpoint, preferably `GET /api/provider/:providerID/auth`, so opening one connection dialog pays only for that provider.
3. Replace the manual provider config summary parser with a small shared config-summary helper at the adapter/runtime boundary, so Buddy does not keep its own interpretation of provider config shape.

## Remaining Memory

The remaining memory is mostly present before provider/model work happens.

From `log/current-healthz-only.json`:

| Probe | Private | Working set |
|---|---:|---:|
| Ready after healthz poll | 458.7 MB | 293.1 MB |
| Final after 30s settle | 426.4 MB | 284.7 MB |

From `log/current-healthz-only-no-models-cache.json`:

| Probe | Private | Working set |
|---|---:|---:|
| Ready after healthz poll | 480.7 MB | 293.3 MB |
| Final after 30s settle | 449.1 MB | 285.6 MB |

This means the copied real `models.json` cache is not the source of the remaining floor. The backend is already near 285 MB working set when only `/api/healthz` is touched.

## Endpoint Matrix

From `log/current-safe-read-endpoint-matrix.json`, a batch of safe read-only endpoints showed small additional memory after startup:

| Point | Private | Working set |
|---|---:|---:|
| Ready after healthz poll | 464.0 MB | 296.4 MB |
| Peak after safe read endpoints | 501.5 MB | 311.2 MB |
| Final after 30s settle | 470.1 MB | 301.8 MB |

The read handlers add roughly 10-15 MB working set over the startup floor. That is not the old provider failure mode.

Full safe read endpoint sequence:

| Endpoint | Status | Body bytes | Private | Working set |
|---|---:|---:|---:|---:|
| startup sample | 0 | 0 | 464.0 MB | 296.4 MB |
| `/api/healthz` | 200 | 16 | 463.4 MB | 295.6 MB |
| `/api/health` | 200 | 44 | 458.8 MB | 295.5 MB |
| `/api/global/config` | 200 | 92 | 449.9 MB | 293.5 MB |
| `/api/global/notebook-home/access` | 200 | 72 | 451.3 MB | 292.9 MB |
| `/api/global/notebook-home` | 200 | 254 | 451.2 MB | 292.8 MB |
| `/api/global/notebooks` | 200 | 151 | 451.7 MB | 293.3 MB |
| `/api/global/agents-md` | 200 | 89 | 449.2 MB | 293.4 MB |
| `/api/open-projects` | 200 | 18 | 484.0 MB | 295.4 MB |
| `/api/open-projects/recovery` | 200 | 32 | 484.4 MB | 295.9 MB |
| `/api/provider` | 200 | 16,472 | 499.5 MB | 306.0 MB |
| `/api/provider/auth` | 200 | 1,695 | 496.9 MB | 304.1 MB |
| `/api/provider/openai/models` | 200 | 26 | 494.8 MB | 302.1 MB |
| `/api/provider/openai/usage` | 200 | 26 | 491.8 MB | 301.9 MB |
| `/api/local-runtimes/advanced-math` | 200 | 190 | 489.7 MB | 301.8 MB |
| `/api/local-runtimes/standards` | 200 | 55 | 489.9 MB | 301.8 MB |
| `/api/project` | 200 | 2 | 501.5 MB | 311.2 MB |
| final settle | 0 | 0 | 470.1 MB | 301.8 MB |

## Import Attribution

Dev import probes are not final production proof, but they explain where the startup floor is likely coming from.

Largest observed import deltas:

| Import | Approx RSS delta |
|---|---:|
| `packages/buddy/src/routes/index.ts` | 312 MB |
| `packages/buddy/src/index.ts` | 311 MB |
| `packages/buddy/src/http/index.ts` | 286 MB |
| `packages/buddy/src/http/route-helpers.ts` | 292 MB |
| `packages/buddy/src/session/index.ts` | 313 MB |
| `packages/buddy/src/project/index.ts` | 229 MB |
| `packages/buddy/src/opencode-runtime/env.ts` | 64 MB |

Route-level import probes showed that many non-provider routes pull in the same heavy shared graph. The provider route is now lower than most of the route graph after the split.

Route-module import ranking from the same diagnostic pass:

| Route/module import | Approx RSS delta |
|---|---:|
| `packages/buddy/src/routes/object-mermaid.ts` | 324.1 MB |
| `packages/buddy/src/routes/teaching.ts` | 320.3 MB |
| `packages/buddy/src/routes/open-projects.ts` | 318.5 MB |
| `packages/buddy/src/routes/session.ts` | 317.7 MB |
| `packages/buddy/src/routes/learner.ts` | 314.7 MB |
| `packages/buddy/src/routes/object-whiteboard.ts` | 309.7 MB |
| `packages/buddy/src/routes/object-freeform-figure.ts` | 305.4 MB |
| `packages/buddy/src/routes/local-runtimes.ts` | 303.3 MB |
| `packages/buddy/src/routes/object-media-presentation.ts` | 302.7 MB |
| `packages/buddy/src/routes/skills.ts` | 302.5 MB |
| `packages/buddy/src/routes/auth.ts` | 302.1 MB |
| `packages/buddy/src/routes/objects.ts` | 300.9 MB |
| `packages/buddy/src/routes/global.ts` | 299.3 MB |
| `packages/buddy/src/routes/object-html-widget.ts` | 298.7 MB |
| `packages/buddy/src/routes/bench.ts` | 298.6 MB |
| `packages/buddy/src/routes/object-question-set.ts` | 298.3 MB |
| `packages/buddy/src/routes/agents-md.ts` | 297.8 MB |
| `packages/buddy/src/routes/compatibility.ts` | 296.1 MB |
| `packages/buddy/src/routes/mcp.ts` | 295.0 MB |
| `packages/buddy/src/routes/question.ts` | 294.9 MB |
| `packages/buddy/src/routes/permission.ts` | 294.2 MB |
| `packages/buddy/src/routes/object-flashcard-deck.ts` | 291.3 MB |
| `packages/buddy/src/routes/config.ts` | 288.7 MB |
| `packages/buddy/src/routes/object-resource.ts` | 285.9 MB |
| `packages/buddy/src/routes/object-figure.ts` | 285.0 MB |
| `packages/buddy/src/routes/project.ts` | 284.7 MB |
| `packages/buddy/src/routes/provider.ts` | 221.2 MB |
| `packages/buddy/src/routes/skills.schemas.ts` | 20.6 MB |
| `packages/buddy/src/routes/skills.constants.ts` | 1.4 MB |

This shape strongly suggests a shared dependency graph rather than one bad endpoint. Most route modules pay nearly the same cost because they import common helpers and barrels that reach runtime-adjacent modules.

Submodule import probes narrowed that shared graph further:

| Import | Approx RSS delta |
|---|---:|
| `packages/buddy/src/session/index.ts` | 313.1 MB |
| `packages/buddy/src/http/route-helpers.ts` | 292.3 MB |
| `packages/buddy/src/project/index.ts` | 229.2 MB |
| `packages/buddy/src/http/session.ts` | 220.5 MB |
| `packages/buddy/src/http/directory.ts` | 219.5 MB |
| `packages/buddy/src/http/effect-schema.ts` | 67.8 MB |
| `packages/buddy/src/objects/index.ts` | 34.7 MB |
| `packages/buddy/src/http/openapi.ts` | 22.6 MB |
| `packages/buddy/src/http/error-normalization.ts` | 2.1 MB |
| `packages/buddy/src/http/sdk-response.ts` | 1.7 MB |
| `packages/buddy/src/http/http.ts` | 1.4 MB |
| `packages/buddy/src/http/request-json.ts` | 1.3 MB |

## Current Conclusion

The provider memory optimization worked. The remaining resident memory is mostly an eager startup/import problem:

1. Eager route graph and `routes/index.ts`.
2. Broad `../http` barrel imports, especially `route-helpers.ts`.
3. `../session` and `../project` barrels pulling runtime-adjacent code into startup.
4. Endpoint execution itself is secondary for safe read-only routes.

Do not restart by changing provider again. The next optimization should focus on import splitting or safe lazy route loading while preserving Buddy's error normalization behavior.

## Guardrail

The earlier lazy Hono sub-app attempt broke malformed JSON error normalization by bypassing the parent `app.onError` path. Any future lazy route strategy must preserve:

```json
{ "error": "Invalid JSON body" }
```

for malformed JSON regressions covered by:

- `packages/buddy/test/session/route-regressions.test.ts`
- `packages/buddy/test/permission/routes.test.ts`
