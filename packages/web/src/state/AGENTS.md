# AGENTS.md

State in `packages/web/src/state` must follow these acceptance criteria.

## Required Inputs
- Load the `zustand-best-practices` skill before creating or refactoring Zustand stores in this folder.
- Follow `packages/web/AGENTS.md` in addition to this file.

## Store Taxonomy
Every new state module must fit one of these categories explicitly:
- Persisted app store: long-lived client state owned fully by Zustand. Example: preferences, onboarding, model selection.
- Workbench store: per-screen or per-instance editable draft state owned by Zustand, with server/query data injected from the React boundary.
- Query adapter: TanStack Query loader/invalidator module with no editable Zustand state.

If a file mixes more than one category, split it.

## Store Shape
A store is acceptable only if all of the following are true:
- Actions are colocated inside the store creator.
- The store owns editable client state, not duplicated server cache snapshots, unless duplication is strictly required for correctness and documented inline.
- Derived state is computed from existing state instead of being stored redundantly.
- Constants, defaults, field definitions, and domain-specific keys are centralized and typed.
- Public APIs and exported helpers are explicitly typed.

## `create` vs `createStore`
Use `create(...)` when:
- The store is a normal global React store with no per-instance initialization.

Use `createStore(...)` when:
- The store is scoped to a component instance, route instance, selected directory, dialog, or workbench.
- The store needs initialization from props, query results, or runtime inputs.

For `createStore(...)` usage, the React layer must keep the store instance stable with `useState(() => createStore(...))` or equivalent.

## React Subscription Rules
A Zustand usage is acceptable only if all component subscriptions follow these rules:
- Never subscribe to the entire store when a selector is sufficient.
- Prefer selector subscriptions for each field/action actually consumed.
- Use `useShallow` when selecting objects or arrays assembled from multiple store fields.
- Avoid returning fresh objects from selectors unless paired with `useShallow` or another equality strategy.

Reject patterns like:
- `const state = useStore(store)` for workbench stores.
- Large hook return objects built from whole-store subscriptions when selector-based subscriptions are possible.

## Slices
Use the slices pattern when a store contains more than one real subdomain.

A store should be split into slices when any of these are true:
- The file owns separate concepts with different update rules.
- The action list is becoming hard to scan.
- The draft/state shape has clearly separable sections.
- One part of the state could evolve independently of another.

Typical slice boundaries:
- Draft state slice
- Lifecycle slice (`saving`, `error`, initialization)
- Domain slices (`modelSelection`, `learnerMemory`, `toolOverrides`)

Do not create slices for tiny stores that only add indirection.

## Query Boundary Rules
For workbench-style state:
- TanStack Query owns server data fetching, invalidation, and cache updates.
- Zustand owns editable draft state and local workflow state.
- React effects may synchronize query results into the store.
- Query result objects should not be mirrored into Zustand just for convenience.

Allowed exceptions:
- Temporary duplication needed to compute rollback or preserve unsaved edits.
- If used, document why the duplication is necessary and keep the duplicated surface minimal.

## Effects
`useEffect` is allowed only for boundary work such as:
- syncing query results into a per-instance store
- autosave timers
- unmount persistence
- invalidation or refresh side effects

`useEffect` is not acceptable for:
- implementing normal store actions
- holding the primary source of truth for editable state
- replacing straightforward store transitions

## Update Rules
A store implementation is acceptable only if:
- It relies on Zustand's one-level merge semantics where appropriate.
- It does not spread the entire store state in `set(...)` unless necessary.
- Nested updates use explicit immutable updates.
- `immer` is used only when nested updates are genuinely noisy enough to justify it.

Do not add `immer` by default.

Use `immer` when:
- nested object or collection updates dominate the store logic
- the non-immer version becomes materially harder to read or maintain

Do not use `immer` when:
- updates are mostly shallow field replacements
- it is being added just for style consistency

## File Organization
When a workbench store becomes non-trivial, split it into these files:
- `*-store.ts`: Zustand store, slices, actions, selectors, defaults
- `*-rules.ts`: pure draft/patch/diff/merge logic
- `*-query.ts`: TanStack Query options and cache helpers
- `*.ts`: React hook boundary that wires query + store + effects

For small stores, collapsing `*-rules.ts` into the store file is acceptable only if the file remains easy to scan.

## Testing Requirements
A store refactor is complete only if it adds or preserves focused tests for the risky behavior.

Test the pure logic directly when possible:
- draft builders
- patch builders
- rollback logic
- slice actions
- initialization semantics
- persistence edge cases

Do not rely only on component tests when the logic can be tested at the store/rules layer.

## Performance Acceptance Criteria
A store implementation is acceptable only if:
- components do not rerender on unrelated store writes due to whole-store subscriptions
- derived arrays/objects selected from state use a shallow-equality strategy when needed
- expensive derived computations are not stored redundantly unless profiling or correctness justifies it
- query data is not copied into Zustand without a concrete reason

## Smell List
If you see any of these, stop and redesign before continuing:
- Hook-local state machines masquerading as stores
- Whole-store subscriptions in workbench hooks
- One giant store file with unrelated actions and state mixed together
- Duplicated config keys, defaults, or patch logic across files
- Redundant server snapshots in Zustand
- `set((state) => ({ ...state, ... }))` everywhere
- `immer` added without nested-update pressure
- Effects doing the real state management work
- Stores with no direct tests for their rules or transitions

## Completion Checklist
A Zustand/state change in this folder is done only when all are true:
- The store category is explicit.
- `create` vs `createStore` choice is justified by scope.
- Components use selector-based subscriptions.
- `useShallow` is used where object/array selector outputs would otherwise rerender unnecessarily.
- Slices are used when the store has multiple subdomains.
- Query ownership and store ownership are clearly separated.
- Redundant state has been removed or justified.
- `immer` is omitted unless it materially improves nested updates.
- Store/rules logic has focused tests.
- `bun fmt`, `bun lint`, and `bun typecheck` pass.
