# React Best Practices

**Version 1.0.0**  
Framework-agnostic React guidance for agents and LLM-assisted development.

## Scope

Use this skill to optimize React applications for:
- lower latency and reduced async waterfalls
- fewer unnecessary rerenders
- lower render and JavaScript hot-path overhead
- more predictable behavior under load

This skill intentionally excludes framework-specific recommendations tied to a single hosting platform or runtime framework.

## Priority Order

1. Eliminate async waterfalls.
2. Reduce shipped and executed code.
3. Optimize server and client data flow.
4. Reduce rerender and render work.
5. Apply JS micro-optimizations in hot paths.

## Rule Index

### 1. Eliminating Waterfalls (`async-*`)

- `async-defer-await.md` — defer await until it is needed in control flow.
- `async-dependencies.md` — parallelize partially dependent tasks.
- `async-parallel.md` — run independent operations with `Promise.all`.
- `async-suspense-boundaries.md` — structure suspense boundaries for progressive rendering.

### 2. Bundle Size Optimization (`bundle-*`)

- `bundle-barrel-imports.md` — avoid barrel imports that expand module load.
- `bundle-conditional.md` — load modules only when feature paths are active.
- `bundle-preload.md` — preload likely-next assets by user intent.

### 3. Server-Side Performance (`server-*`)

- `server-cache-lru.md` — add bounded cross-request caching where safe.
- `server-cache-react.md` — use `React.cache()` for per-request deduplication.

### 4. Client-Side Data Fetching (`client-*`)

- `client-event-listeners.md` — deduplicate global listener subscriptions.
- `client-localstorage-schema.md` — version and minimize local storage payloads.
- `client-passive-event-listeners.md` — use passive listeners for scroll/touch paths.

### 5. Re-render Optimization (`rerender-*`)

- `rerender-defer-reads.md` — defer state reads to the actual usage site.
- `rerender-dependencies.md` — narrow effect dependencies to stable primitives.
- `rerender-derived-state-no-effect.md` — derive state during render when possible.
- `rerender-derived-state.md` — subscribe to derived booleans over raw structures.
- `rerender-functional-setstate.md` — use functional `setState` for safe async updates.
- `rerender-lazy-state-init.md` — lazy-initialize expensive state values.
- `rerender-memo-with-default-value.md` — hoist default non-primitive values.
- `rerender-memo.md` — extract expensive rendering into memoized components.
- `rerender-move-effect-to-event.md` — move user-triggered logic to event handlers.
- `rerender-no-inline-components.md` — avoid declaring components inside components.
- `rerender-simple-expression-in-memo.md` — avoid memoizing simple primitive expressions.
- `rerender-split-combined-hooks.md` — split hook computations by dependency set.
- `rerender-transitions.md` — use transitions for non-urgent UI updates.
- `rerender-use-deferred-value.md` — defer expensive derived renders.
- `rerender-use-ref-transient-values.md` — use refs for transient high-frequency values.

### 6. Rendering Performance (`rendering-*`)

- `rendering-activity.md` — keep hidden trees cheap when toggling visibility.
- `rendering-animate-svg-wrapper.md` — animate wrappers instead of complex SVG roots.
- `rendering-conditional-render.md` — use explicit conditional rendering forms.
- `rendering-content-visibility.md` — apply `content-visibility` on long content.
- `rendering-hoist-jsx.md` — hoist static JSX and constants.
- `rendering-hydration-no-flicker.md` — avoid flicker during hydration handoff.
- `rendering-hydration-suppress-warning.md` — suppress only expected hydration mismatches.
- `rendering-resource-hints.md` — use preload/prefetch/prerender hints deliberately.
- `rendering-script-defer-async.md` — mark scripts as `defer` or `async`.
- `rendering-svg-precision.md` — reduce SVG precision to cut payload size.
- `rendering-usetransition-loading.md` — favor transitions over manual loading toggles.

### 7. JavaScript Performance (`js-*`)

- `js-batch-dom-css.md` — batch DOM/CSS writes to avoid layout thrash.
- `js-cache-function-results.md` — cache repeated function outputs.
- `js-cache-property-access.md` — cache deep property access in hot loops.
- `js-cache-storage.md` — minimize repeated storage API reads.
- `js-combine-iterations.md` — combine array passes when profiling justifies it.
- `js-early-exit.md` — return early to skip unnecessary work.
- `js-flatmap-filter.md` — combine map/filter paths with `flatMap` where appropriate.
- `js-hoist-regexp.md` — hoist regex creation out of loops.
- `js-index-maps.md` — use indexed maps for repeated keyed lookups.
- `js-length-check-first.md` — short-circuit expensive compares with length checks.
- `js-min-max-loop.md` — use linear scans for min/max in hot paths.
- `js-request-idle-callback.md` — defer non-critical tasks to idle periods.
- `js-set-map-lookups.md` — prefer `Set`/`Map` for repeated membership checks.
- `js-tosorted-immutable.md` — use immutable sorting when mutation is unsafe.

### 8. Advanced Patterns (`advanced-*`)

- `advanced-event-handler-refs.md` — route unstable handlers through refs.
- `advanced-init-once.md` — initialize shared app resources once.
- `advanced-use-latest.md` — keep latest values accessible from stable callbacks.

## Excluded Rules

The following rules are intentionally excluded from this skill:
- `async-api-routes.md`
- `bundle-defer-third-party.md`
- `bundle-dynamic-imports.md`
- `client-swr-dedup.md`
- `server-after-nonblocking.md`
- `server-auth-actions.md`
- `server-hoist-static-io.md`
- `server-dedup-props.md`
- `server-parallel-fetching.md`
- `server-parallel-nested-fetching.md`
- `server-serialization.md`
