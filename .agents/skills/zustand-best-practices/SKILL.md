---
name: zustand-best-practices
description: Reference guide for Zustand state management best practices. Use this skill when working with Zustand stores — creating, updating, structuring, typing, testing, or optimizing them.
license: MIT
metadata:
  author: buddy
  version: "1.0.0"
---

# Zustand Best Practices

Reference guide for Zustand state management based on the official docs learn section.

All paths below are relative to `~/code/zustand/docs/learn/`.

---

## Start here

**`getting-started/introduction.md`** (~500 tokens)
> The classic quick-start. Covers installation, the basic `create` API, and hook-based subscriptions. No TypeScript.
- What is Zustand (small, hooks-first, handles concurrency pitfalls)
- Installation (`npm install zustand`)
- Creating a store (`create((set) => ({...}))`)
- Binding components (selectors, no providers needed)

**`getting-started/comparison.md`** (~2,500 tokens)
> Side-by-side code comparisons with Redux, Valtio, Jotai, and Recoil. Compares state models and render optimization strategies.
- Redux
  - State model comparison (with and without reducers)
  - Render optimization comparison (selectors)
- Valtio
  - Immutable vs mutable state model
  - Selectors vs property-access optimization
- Jotai
  - Single store vs primitive atoms
  - Selectors vs atom dependency
- Recoil
  - Single store vs atom keys
  - Selectors vs atom dependency
- Npm downloads trend link

**`guides/tutorial-tic-tac-toe.md`** (~10,500 tokens)
> A full hands-on tutorial building a tic-tac-toe game. Teaches lifting state, immutable updates, time-travel, and removing redundant state. Uses the `combine` middleware.
- What you're building (final code preview)
- Building the board (`Square`, `Board` components)
- Lifting state up (moving state to parent, `combine` middleware)
- Taking turns (`xIsNext` state)
- Declaring a winner or draw (helper functions)
- Adding time travel (`history`, `currentMove`)
- Showing past moves (rendering jump buttons)
- Final cleanup (deriving `xIsNext` from `currentMove` instead of storing it)

---

## Core concepts

**`guides/updating-state.md`** (~840 tokens)
> How `set` merges state and strategies for deeply nested updates. Covers manual spreading and helper libraries.
- Flat updates (`set` shallow merge)
- Deeply nested object
  - Normal approach (spread operator)
  - With Immer (`produce`)
  - With optics-ts
  - With Ramda
  - Demo link

**`guides/practice-with-no-store-actions.md`** (~250 tokens)
> Two ways to structure actions: inside the store (recommended) or outside at module level.
- Recommended: colocate actions and state in `create`
- Alternative: module-level actions using `.setState()`
  - Advantages: no hook needed, code splitting

**`guides/slices-pattern.md`** (~750 tokens)
> How to split a large store into smaller, composable slice creators and merge them. Shows cross-slice actions and middleware placement.
- Slicing into smaller stores (`createFishSlice`, `createBearSlice`)
- Combining into one bounded store
- Usage in a React component
- Updating multiple stores at once (cross-slice actions with `get()`)
- Adding middlewares (apply only at combined level)
- Usage with TypeScript (links to advanced guide)

**`guides/immutable-state-and-merging.md`** (~350 tokens)
> Explains Zustand's shallow merging behavior and how to handle nested objects or disable merging entirely.
- `set` merges state at one level only
- Nested objects require explicit spreading
- Replace flag (`set(newState, true)` to disable merging)

**`guides/maps-and-sets-usage.md`** (~490 tokens)
> How to correctly store and update `Map` and `Set` in Zustand by creating new instances on every update.
- Map (read, update single entry, delete, multiple entries, clear)
- Set (read, add, delete, toggle, clear)
- Why new instances are required (reference equality)
- Pitfall: TypeScript `never[]` on empty collections

---

## Performance and rendering

**`guides/prevent-rerenders-with-use-shallow.md`** (~420 tokens)
> Solving extra re-renders when selecting objects/arrays from the store using shallow comparison.
- Selectors and `Object.is` comparison
- The problem: object/array selectors re-render unnecessarily
- Solution: `useShallow` from `zustand/react/shallow`
- Example with `Object.keys(state)`

**`guides/connect-to-state-with-url-hash.md`** (~1,200 tokens)
> Syncing store state with the URL (hash or query params) using a custom `StateStorage` and the `persist` middleware.
- Connect state with URL hash (`URLSearchParams` + `location.hash`)
- Persist and connect with URL query params
  - Hybrid storage (URL first, fallback to `localStorage`)
  - `buildShareableUrl` helper
- Demos

**`guides/event-handler-in-pre-react-18.md`** (~210 tokens)
> A fix for zombie-child issues when calling store updates outside React event handlers in React 17 and earlier.
- Problem: unbatched updates outside event handlers
- Fix: wrap in `unstable_batchedUpdates`
- Link to GitHub issue

---

## TypeScript path

**`guides/beginner-typescript.md`** (~2,700 tokens)
> A practical introduction to typing stores, actions, selectors, middleware, and async logic.
- Creating a typed store (`create<State>()(...)`)
- Using the store in components
- Resetting the store (`typeof initialState` pattern)
- Extracting types (`ExtractState`)
- Selectors (multiple with `useShallow`, derived state)
- Middlewares (`combine`, `devtools`, `persist`)
- Async actions (typed API responses)
- `createWithEqualityFn`
- Multiple stores

**`guides/advanced-typescript.md`** (~4,900 tokens)
> Deep dive into TypeScript internals: why inference fails, middleware typing, custom middleware authoring, and complex patterns.
- Basic usage
  - Curried syntax `create<T>()(...)`
  - Why inference fails (invariance explanation)
  - Why currying? (TypeScript partial generic workaround)
  - `combine` as alternative
  - `ExtractState`
- Using middlewares
  - Stacking and ordering (`devtools` outermost)
  - Pitfall of extracted middleware variables
- Authoring middlewares
  - Dynamic `replace` flag workaround
- Common recipes
  - Middleware that doesn't change store type (logger)
  - Middleware that changes store type (higher-kinded mutator)
  - `create` without currying (not recommended)
  - Slices pattern with full types
  - Bounded `useStore` for vanilla stores
  - `createBoundedUseStore` helper
- Middleware mutators reference table

**`guides/auto-generating-selectors.md`** (~850 tokens)
> A utility pattern to auto-generate `store.use.key()` hooks so you never write selectors manually.
- The selector boilerplate problem
- `createSelectors` function for React stores
- `createSelectors` function for vanilla stores
- Live demo
- Third-party libraries

---

## Frameworks and platforms

**`guides/nextjs.md`** (~2,200 tokens)
> Full Next.js integration using a store factory + React Context to avoid global module state and hydration issues.
- Challenges (per-request store, SSR, SPA routing, server caching)
- Recommendations (no global stores, RSC shouldn't use stores)
- Creating a store per request (`createStore` factory)
- Providing the store (Context provider + `useStore`)
- Pages Router setup (`_app.tsx`)
- App Router setup (`layout.tsx`)
- Optional per-route providers

**`guides/ssr-and-hydration.md`** (~1,200 tokens)
> A general primer on SSR and hydration mechanics in React, with implications for Zustand state matching between server and client.
- Server-side Rendering (SSR)
  - Express + `react-dom/server` + `renderToPipeableStream`
- Hydration
  - `hydrateRoot`
  - Common hydration mismatch causes
  - Links to docs

**`guides/initialize-state-with-props.md`** (~1,000 tokens)
> Pattern for creating per-instance stores initialized from React props, using vanilla `createStore` + Context.
- Dependency injection with `createStore`
- Creating a context
- Basic component usage (provider + consumer)
- Common patterns
  - Wrapping the provider (passing props)
  - Custom hook wrapper
  - Optional `useShallow`
  - Optional custom equality function (`useStoreWithEqualityFn`)
- Complete example

---

## Testing and quality

**`guides/testing.md`** (~5,300 tokens)
> Comprehensive guide to testing Zustand with Jest/Vitest, including auto-reset mocks and examples for components and store logic.
- Setting up a test environment
  - Test runners (Jest, Vitest)
  - UI/network tools (RTL, MSW)
- Setting up Zustand for testing
  - Shared store creator
  - Jest mock (`__mocks__/zustand.ts`)
  - Vitest mock
- Testing components (with and without Context)
- Testing stores (direct `getState()` assertions)
- References and demos

**`guides/flux-inspired-practice.md`** (~690 tokens)
> Zustand's recommended conventions for larger apps, plus how to implement Redux-style reducers if desired.
- Recommended patterns
  - Single store (or slices)
  - Always use `set` / `setState`
  - Colocate store actions
- Redux-like patterns
  - Manual dispatch + reducer
  - Using the `redux` middleware
  - Wrapper functions for side effects

**`guides/how-to-reset-state.md`** (~240 tokens)
> Patterns for resetting a single store or all stores back to their initial state.
- Reset single store (`store.getInitialState()`)
- Reset multiple stores at once (wrapped `create` registry)
- Demos

---

## Reference

All paths below are relative to `~/code/zustand/docs/reference/`.

### APIs

**`apis/create.md`** (~3,900 tokens)
> API reference for `create`. Creates a React hook with store API utilities attached.
- Types (signature)
- Reference (`create(stateCreatorFn)`)
- Usage
  - Updating state based on previous state (updater functions)
  - Updating primitives in state (`replace` flag)
  - Updating objects in state (shallow merge vs replace)
  - Updating arrays in state (immutable operations)
  - Updating state with no store actions
  - Subscribing to state updates
- Troubleshooting
  - "I've updated the state, but the screen doesn't update" (mutation pitfall)

**`apis/create-store.md`** (~3,800 tokens)
> API reference for `createStore`. Creates a vanilla store without React bindings.
- Types (signature)
- Reference (`createStore(stateCreatorFn)`)
- Usage
  - Updating state based on previous state
  - Updating primitives in state
  - Updating objects in state
  - Updating arrays in state
  - Subscribing to state updates
- Troubleshooting
  - Mutation pitfall with form inputs

**`apis/create-with-equality-fn.md`** (~4,300 tokens)
> API reference for `createWithEqualityFn`. Like `create` but supports a custom equality function for finer re-render control.
- Types (signature)
- Reference (`createWithEqualityFn(stateCreatorFn, equalityFn)`)
- Usage
  - Updating state based on previous state
  - Updating primitives, objects, arrays
  - Updating state with no store actions
  - Subscribing to state updates
- Troubleshooting
  - Mutation pitfall

**`apis/shallow.md`** (~1,800 tokens)
> API reference for `shallow`. A utility for shallow comparison of objects, arrays, Sets, and Maps.
- Types (signature)
- Reference (`shallow(a, b)`)
- Usage
  - Comparing primitives
  - Comparing objects
  - Comparing Sets
  - Comparing Maps
- Troubleshooting
  - Comparing objects returns false even if identical (nested object limitation)
  - Comparing objects with different prototypes

---

### Hooks

**`hooks/use-store.md`** (~5,600 tokens)
> API reference for `useStore`. React hook for subscribing to a vanilla store.
- Types (signature)
- Reference (`useStore(store, selectorFn)`)
- Usage
  - Using a global vanilla store in React
  - Using dynamic global vanilla stores in React (factory + Map registry)
  - Using scoped (non-global) vanilla store in React (Context + Provider)
  - Using dynamic scoped vanilla stores in React
- Troubleshooting

**`hooks/use-store-with-equality-fn.md`** (~5,900 tokens)
> API reference for `useStoreWithEqualityFn`. Like `useStore` but with custom equality function support.
- Types (signature)
- Reference (`useStoreWithEqualityFn(store, selectorFn, equalityFn)`)
- Usage
  - Using a global vanilla store in React
  - Using dynamic global vanilla stores in React
  - Using scoped (non-global) vanilla store in React
  - Using dynamic scoped vanilla stores in React
- Troubleshooting

**`hooks/use-shallow.md`** (~1,500 tokens)
> API reference for `useShallow`. React hook that memoizes a selector using shallow comparison.
- Types (signature)
- Reference (`useShallow(selectorFn)`)
- Usage
  - Writing a memoized selector (bear family meals example)
- Troubleshooting

---

### Middlewares

**`middlewares/persist.md`** (~6,900 tokens)
> API reference for `persist` middleware. Persist and rehydrate state across reloads.
- Types (signature, mutator)
- Reference (`persist(stateCreatorFn, persistOptions)`)
  - Options: `name`, `storage`, `partialize`, `onRehydrateStorage`, `version`, `migrate`, `merge`, `skipHydration`
- Usage
  - Persisting a state
  - Persisting a state partially
  - Persisting with custom storage (URL search params example)
  - Persisting through versioning and migrations
  - Persisting with nested objects (custom merge function)
  - Persisting and hydrating manually (`skipHydration`)
- Troubleshooting

**`middlewares/devtools.md`** (~2,200 tokens)
> API reference for `devtools` middleware. Connect store to Redux DevTools for time-travel debugging.
- Types (signature, mutator)
- Reference (`devtools(stateCreatorFn, devtoolsOptions)`)
  - Options: `name`, `enabled`, `anonymousActionType`, `store`, `actionsDenylist`
- Usage
  - Debugging a store
  - Debugging a slices pattern based store
  - Filtering actions with `actionsDenylist`
  - Cleanup (`store.devtools.cleanup()`)
- Troubleshooting
  - Only one store is displayed
  - Action names labeled as 'anonymous'

**`middlewares/immer.md`** (~1,500 tokens)
> API reference for `immer` middleware. Perform immutable updates with mutable syntax.
- Types (signature, mutator)
- Reference (`immer(stateCreatorFn)`)
- Usage
  - Updating state without boilerplate code
- Troubleshooting
  - "My subscriptions aren't being called" (Immer rules / `[immerable]`)

**`middlewares/redux.md`** (~1,000 tokens)
> API reference for `redux` middleware. Use reducer + dispatch pattern like Redux.
- Types (signature, mutator)
- Reference (`redux(reducerFn, initialState)`)
- Usage
  - Updating state through actions and reducers
- Troubleshooting

**`middlewares/subscribe-with-selector.md`** (~740 tokens)
> API reference for `subscribeWithSelector` middleware. Subscribe to specific slices with selector support.
- Types (signature, mutator)
- Reference (`subscribeWithSelector(stateCreatorFn)`)
- Usage
  - Subscribing to partial state updates
- Troubleshooting

**`middlewares/combine.md`** (~690 tokens)
> API reference for `combine` middleware. Merge initial state with additional state creator for automatic type inference.
- Types (signature)
- Reference (`combine(initialState, additionalStateCreatorFn)`)
- Usage
  - Creating a store with inferred types
- Troubleshooting

---

### Integrations

**`integrations/persisting-store-data.md`** (~5,100 tokens)
> In-depth guide to the `persist` middleware and storage adapters.
- Simple example (localStorage / sessionStorage)
- TypeScript simple example
- Options
  - `name`, `storage`, `partialize`, `onRehydrateStorage`, `version`, `migrate`, `merge`, `skipHydration`
- API
  - `getOptions`, `setOptions`, `clearStorage`, `rehydrate`, `hasHydrated`, `onHydrate`, `onFinishHydration`, `createJSONStorage`
- Hydration and asynchronous storages
  - SSR considerations, custom `useStore` hook for Next.js
- FAQ
  - How to check if store has been hydrated
  - How to use custom storage engine (IndexedDB, superjson)
  - How to rehydrate on storage event
  - TypeScript usage
  - Map and Set persistence

**`integrations/immer-middleware.md`** (~770 tokens)
> Detailed guide to the `immer` middleware.
- Installation (`npm install immer`)
- Usage
  - Updating simple states
  - Updating complex states (nested objects, Records)
- Gotchas
  - Subscriptions not being called (class objects need `[immerable]`)
- Demos

**`integrations/third-party-libraries.md`** (~2,500 tokens)
> Community libraries that extend Zustand's feature set.
- List of third-party libraries (auto-selectors, devtools, computed states, multiplayer, undo/redo, query params, form libraries, cross-tab sync, Vue/Solid/Angular adapters, etc.)

---

### Migrations

**`migrations/migrating-to-v4.md`** (~2,000 tokens)
> Upgrade guide from Zustand v3 to v4. Only TypeScript/JSDoc users need to migrate.
- `create` (currying change: `create<T>()(...)`)
- `StateCreator` (mutator parameters)
- `PartialState` (simplified to `Partial<T>`)
- `useStore` (type parameter changes)
- `UseBoundStore` (store type instead of state type)
- `UseContextStore` / `createContext` (deprecated)
- `combine`, `devtools`, `subscribeWithSelector` (inferred generics)
- `persist` (partialized state type aligned to runtime)
- `redux` (annotate action parameter instead)

**`migrations/migrating-to-v5.md`** (~1,500 tokens)
> Upgrade guide from Zustand v4 to v5.
- Changes in v5 (drop default exports, React 18 minimum, stricter types, persist behavioral change)
- Custom equality functions → `createWithEqualityFn` or `useShallow`
- Stable selector outputs required (infinite loop prevention)
- Stricter `setState` replace flag types
- Persist middleware no longer stores initial state at creation

---

### Previous versions

**`previous-versions/zustand-v3-create-context.md`** (~790 tokens)
> Docs for the deprecated `createContext` export from `zustand/context` (v3 only).
- `createContext` usage
- Real component examples
- Initialization from props
- Migration to v4 API (manual Context + `useStore`)

---

## Antipatterns

Obvious antipatterns the Zustand docs explicitly warn against.

### 1. State Mutation (The #1 Pitfall)

**Don't mutate state directly — always create new references.**

- **Objects/Arrays:** The docs repeatedly show broken form examples where `onChange` handlers do `person.firstName = e.target.value` instead of `setPerson({ ...person, firstName: value })`. The `set` function performs shallow merge by default, but mutations bypass it entirely and don't trigger re-renders.
- **Maps/Sets:** Never call `.set()`, `.add()`, `.delete()` directly on a Map/Set in state. Always create new instances: `new Map(oldMap).set(key, value)`.
- **Arrays:** Avoid mutable operations (`push`, `pop`, `splice`, `sort`, `reverse`). Use immutable alternatives (`[...array]`, `concat`, `filter`, `map`, `toSorted`, `toSpliced`).

> *From `guides/maps-and-sets-usage.md`, `reference/apis/create.md`, `reference/middlewares/immer.md`*

### 2. Unnecessary Re-renders from Object Selectors

**Don't return new objects/arrays from selectors without `useShallow`.**

```js
// Bad - new array every render, causes infinite re-renders in v5
const names = useStore((state) => Object.keys(state))

// Good - shallow comparison prevents unnecessary re-renders
const names = useStore(useShallow((state) => Object.keys(state)))
```

In v5, selectors that return unstable references can even cause **infinite loops**.

> *From `guides/prevent-rerenders-with-use-shallow.md`, `reference/hooks/use-shallow.md`, `migrations/migrating-to-v5.md`*

### 3. Global Module State in SSR / Next.js

**Don't define stores as global variables in Next.js.**

```js
// Bad - shared across requests, causes hydration errors
export const useStore = create(...)
```

Zustand stores are module state. In Next.js this means multiple requests share the same store and server/client render different outputs. **Fix:** Use a store factory (`createStore`) + React Context provider, creating one store per request/component instance.

> *From `guides/nextjs.md`, `guides/ssr-and-hydration.md`*

### 4. Applying Middleware Inside Individual Slices

**Don't wrap slice creators with middleware — apply middleware only at the combined store level.**

```js
// Bad
export const createBearSlice = persist((set) => ({...}))

// Good
export const useBoundStore = create(persist((...a) => ({
  ...createBearSlice(...a),
  ...createFishSlice(...a),
})))
```

> *From `guides/slices-pattern.md`*

### 5. Redundant / Derived State in Store

**Don't store state that can be computed from other state.**

The tic-tac-toe tutorial explicitly removes `xIsNext` from the store because `xIsNext = currentMove % 2 === 0`. Storing it separately risks getting out of sync.

> *From `guides/tutorial-tic-tac-toe.md`*

### 6. Calling `get()` During Initial Store Creation

**Don't call `get()` synchronously when defining the initial state.**

```js
// Bad - get() returns undefined before initial state is created
const useBoundStore = create((set, get) => ({
  foo: get().foo, // TypeError: Cannot read properties of undefined
}))
```

> *From `guides/advanced-typescript.md`*

### 7. Using `combine` with Curried `create<T>()`

**Don't use the curried syntax `create<T>()(...)` with `combine` (or `redux`).**

`combine` creates the state type automatically, so currying is unnecessary. The docs note that `get()` inside `combine`'s second parameter is typed as if the state is only the first parameter, which is a "lie" that can cause mistakes with `Object.keys(get())` or `set({}, true)`.

> *From `guides/advanced-typescript.md`*

### 8. Not Resetting Stores Between Tests

**Don't let store state leak between tests.**

The testing guide provides mock setups specifically because stores persist as module state. Without resetting, test order matters and tests become flaky.

> *From `guides/testing.md`, `guides/how-to-reset-state.md`*

### 9. Pre-React 18: Unbatched Updates Outside Event Handlers

**Don't call store actions outside React event handlers in React 17 without `unstable_batchedUpdates`.**

```js
// Bad in React 17
nonReactCallback(() => { useStore.getState().increment() })

// Good
import { unstable_batchedUpdates } from 'react-dom'
nonReactCallback(() => { unstable_batchedUpdates(() => useStore.getState().increment()) })
```

> *From `guides/event-handler-in-pre-react-18.md`*

### 10. TypeScript: Empty Maps/Sets Without Type Hints

**Don't initialize empty Maps/Sets without explicit types.**

```js
// Bad - TypeScript infers never[]
{ ids: new Set([]), users: new Map([]) }

// Good
{ ids: new Set([] as string[]), users: new Map([] as [string, User][]) }
```

> *From `guides/maps-and-sets-usage.md`*

### 11. Using `shallow` on Nested Objects

**Don't expect `shallow` to compare deeply nested properties.**

```js
const a = { nested: { count: 1 } }
const b = { nested: { count: 1 } }
shallow(a, b) // false - only top-level references are compared
```

> *From `reference/apis/shallow.md`*

### 12. Immer: Forgetting `[immerable]` on Class Objects

**Don't use class instances with Immer without marking them `[immerable] = true`.**

If you don't, Immer mutates the object without proxies, updating the current state directly. Zustand then sees no change and skips subscriptions.

> *From `reference/integrations/immer-middleware.md`*

### 13. v5: Using `create` with Custom Equality Functions

**Don't pass equality functions to `create` in v5.**

```js
// v5 - no longer supported
const state = useStore(selector, shallow)

// v5 - use createWithEqualityFn instead
import { createWithEqualityFn as create } from 'zustand/traditional'
```

> *From `migrations/migrating-to-v5.md`*

### 14. v5: Persist Middleware No Longer Stores Initial State

**Don't rely on `persist` to store dynamically generated initial state.**

In v4, `persist` stored the initial state during `create()`. In v5, it doesn't. You must explicitly `setState()` after creation if the initial value is dynamic.

> *From `migrations/migrating-to-v5.md`*

### 15. SSR Hydration Mismatches

**Don't use `typeof window !== 'undefined'`, browser-only APIs, or different data in server/client rendering logic.**

These are listed as the most common causes of hydration errors when using Zustand with SSR.

> *From `guides/ssr-and-hydration.md`*

---

## Deprecated & Removed in v5

Based on `reference/migrations/migrating-to-v5.md` and `reference/previous-versions/zustand-v3-create-context.md`.

### Removed APIs

| Feature | Status | Replacement |
|---------|--------|-------------|
| `zustand/context` (`createContext`) | Deprecated in v4, **removed in v5** | Use `createStore` + React Context + `useStore` manually |
| Default exports (`import create from 'zustand'`) | **Removed in v5** | Use named exports: `import { create } from 'zustand'` |
| Custom equality functions in `create` (`useStore(selector, shallow)`) | **Removed in v5** | Use `createWithEqualityFn` from `zustand/traditional` or `useShallow` hook |
| UMD / SystemJS builds | **Dropped in v5** | Use ESM or CJS builds |
| ES5 support | **Dropped in v5** | Modern browsers / build tools required |

### Behavioral Changes

| Change | Before (v4) | After (v5) |
|--------|-------------|------------|
| **Persist initial state storage** | `persist` stored initial state during `create()` | No longer stores initial state. Explicitly `setState()` after creation if dynamic |
| **Selector stability requirement** | Unstable selector references could work | Must return stable references or infinite loops occur. Use `useShallow` |
| **`setState` replace flag types** | `setState({}, true)` was type-valid | `setState({}, true)` is a TypeScript error. Must provide complete state when `replace: true` |
| **React version** | React 16.8+ | React 18+ minimum |
| **TypeScript version** | TS 3.9+ | TS 4.5+ minimum |
| **`use-sync-external-store`** | Bundled | Peer dependency (required for `createWithEqualityFn` / `useStoreWithEqualityFn`) |

### Migration Paths

**`createContext` (v3 pattern)**
```js
// v3/v4 - REMOVED
import createContext from 'zustand/context'
const { Provider, useStore } = createContext()

// v5 - Manual Context
import { createContext, useContext } from 'react'
import { createStore, useStore } from 'zustand'
const StoreContext = createContext(null)
```

**Custom equality functions**
```js
// v4 - REMOVED
const state = useStore(selector, shallow)

// v5 - Option A: createWithEqualityFn
import { createWithEqualityFn as create } from 'zustand/traditional'

// v5 - Option B: useShallow hook (recommended)
import { useShallow } from 'zustand/shallow'
const state = useStore(useShallow(selector))
```

**Persist with dynamic initial state**
```js
// v4 - auto-stored initial state
const useStore = create(persist(() => ({ count: Math.random() }), { name: 'count' }))

// v5 - explicit setState after creation
const useStore = create(persist(() => ({ count: 0 }), { name: 'count' }))
useStore.setState({ count: Math.random() })
```

---

## Great Advice

Positive patterns and architectural insights from the docs that are worth internalizing.

### 1. `createStore` Is the Primitive; `create` Is Just React Sugar

**Understand that `create` from `zustand` is simply `createStore` + `useStore` bound together.**

- Use `createStore` from `zustand/vanilla` for non-React environments, testing, or when you need full control.
- Use `create` when you want the convenience of a React hook with API utilities attached.
- This separation is what makes the store factory + Context pattern possible for Next.js.

> *From `reference/apis/create.md`, `reference/apis/create-store.md`, `guides/nextjs.md`*

### 2. Always Use Granular Selectors

**Select only what the component needs.**

```js
// Bad - subscribes to entire store
const state = useStore()

// Good - subscribes to one primitive
const bears = useStore((state) => state.bears)
```

Zustand only re-renders when the selected value changes. Subscribing to the whole store defeats the purpose.

> *From `guides/beginner-typescript.md`, `guides/flux-inspired-practice.md`*

### 3. Use `combine` to Eliminate TypeScript Currying Boilerplate

**If you don't want to write `create<State>()(...)` manually, use `combine`.**

```ts
// No manual types needed - inferred automatically
const useStore = create(
  combine({ bears: 0 }, (set) => ({
    increase: () => set((state) => ({ bears: state.bears + 1 })),
  })),
)
```

This avoids the `create<T>()` currying ceremony entirely. It's the recommended path when you want inference over explicit types.

> *From `guides/advanced-typescript.md`, `reference/middlewares/combine.md`*

### 4. Extract Store Creators as Factory Functions

**Don't create the store at module level if you need multiple instances.**

```ts
// Reusable factory
export const createCounterStore = () =>
  createStore<CounterStore>()((set) => ({
    count: 0,
    increment: () => set((state) => ({ count: state.count + 1 })),
  }))
```

This enables:
- Per-request stores in Next.js
- Per-component-instance stores via Context
- Isolated stores in tests

> *From `guides/nextjs.md`, `guides/initialize-state-with-props.md`, `guides/testing.md`*

### 5. Cross-Slice Actions Should Use `get()`

**When combining slices, one slice can call another slice's actions via `get()`.**

```ts
const createBearFishSlice = (set, get) => ({
  addBearAndFish: () => {
    get().addBear()
    get().addFish()
  },
})
```

This keeps slices decoupled while allowing coordination. Just remember: middleware goes on the combined store, never inside individual slices.

> *From `guides/slices-pattern.md`*

### 6. `devtools` Must Be the Outermost Middleware

**Wrap `devtools` around everything else in the middleware stack.**

```ts
// Good
devtools(persist(immer((set) => ({...}))))

// Bad - devtools type mutations get lost
immer(devtools(persist((set) => ({...}))))
```

`devtools` mutates `setState` and adds a type parameter. If another middleware mutates `setState` before it, those mutations can be lost.

> *From `guides/advanced-typescript.md`*

### 7. Use `subscribeWithSelector` for Granular External Subscriptions

**When subscribing outside React (e.g., in vanilla JS or side effects), use `subscribeWithSelector` to listen to specific slices.**

```ts
const store = createStore(
  subscribeWithSelector((set) => ({ count: 0, name: 'foo' })),
)

// Only fires when count changes
store.subscribe((state) => state.count, (count) => console.log(count))
```

This is much more efficient than `store.subscribe()` which fires on every state change.

> *From `reference/middlewares/subscribe-with-selector.md`*

### 8. Module-Level Actions for Non-React Code Splitting

**You don't have to put actions inside the store.**

```ts
export const useBoundStore = create(() => ({ count: 0 }))

export const increment = () =>
  useBoundStore.setState((state) => ({ count: state.count + 1 }))
```

Advantages:
- No hook needed to call the action
- Facilitates code splitting (actions can live in separate files)
- Works in non-React contexts

> *From `guides/practice-with-no-store-actions.md`*

### 9. Use `ExtractState` to Pull Store Types

**Zustand provides a built-in helper to extract the full state type from any store.**

```ts
import { create, type ExtractState } from 'zustand'

export const useBearStore = create((set) => ({
  bears: 3,
  increase: (by: number) => set((s) => ({ bears: s.bears + by })),
}))

// No need to manually define BearState
export type BearState = ExtractState<typeof useBearStore>
```

Useful for props, tests, utility functions, and keeping types in sync.

> *From `guides/beginner-typescript.md`*

### 10. `createWithEqualityFn` Requires `use-sync-external-store`

**If you use `createWithEqualityFn` or `useStoreWithEqualityFn`, install the peer dependency:**

```bash
npm install use-sync-external-store
```

These functions rely on `useSyncExternalStoreWithSelector` which is not bundled with Zustand.

> *From `reference/apis/create-with-equality-fn.md`, `reference/hooks/use-store-with-equality-fn.md`*

### 11. Use `persist.skipHydration` for Framework SSR

**When using `persist` in server-rendered apps, skip auto-hydration and trigger it manually after mount.**

```ts
const useStore = create(
  persist((set) => ({ count: 0 }), {
    name: 'count',
    skipHydration: true,
  }),
)

// In component
useEffect(() => {
  useStore.persist.rehydrate()
}, [])
```

This prevents hydration mismatches caused by async storage values differing between server and client.

> *From `reference/middlewares/persist.md`, `reference/integrations/persisting-store-data.md`*

### 12. Use `useState` Lazy Initialization for Store Providers

**When creating a store inside a React component (e.g., for Context providers), use `useState` with a factory function.**

```tsx
function StoreProvider({ children }) {
  const [store] = useState(() => createCounterStore())
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}
```

This ensures the store is created once per mount and is safe during React Strict Mode double-renders.

> *From `guides/nextjs.md`, `guides/initialize-state-with-props.md`*
