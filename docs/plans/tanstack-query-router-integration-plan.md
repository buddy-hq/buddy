# TanStack Query + Router Integration Plan for `packages/web`

## Goal

Adopt the official TanStack Router + TanStack Query pattern in `packages/web` so route-critical server state is loaded through router loaders and shared through the Query cache, while Buddy keeps its existing Zustand/event-stream model for live chat state.

This plan is intentionally scoped to the frontend package and to low-effort, high-leverage wins.

## Source Guidance Used

- TanStack Router external data loading docs:
  [External Data Loading](https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading)
- TanStack Router Query integration docs:
  [Query Integration](https://tanstack.com/router/latest/docs/framework/react/integrations/query)
- TanStack Query prefetching docs:
  [Prefetching & Router Integration](https://tanstack.dev/query/latest/docs/framework/react/guides/prefetching)
- Local TanStack Router skill:
  `node_modules/.bun/@tanstack+router-core@1.168.6/node_modules/@tanstack/router-core/skills/router-core/data-loading/SKILL.md`

## Official Pattern to Follow

- Keep one app-level `QueryClient` and pass it through router context. Buddy already does this in [packages/web/src/app.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/app.tsx:15).
- For route-critical data, use route `loader`, not `beforeLoad`, and call `context.queryClient.ensureQueryData(...)`.
- In components that depend on loader-prefetched data, prefer `useSuspenseQuery(...)` with the same `queryOptions(...)`.
- For non-blocking or client-only data, use `useQuery(...)`.
- Define reusable `queryOptions(...)` factories with stable key factories. Do not scatter inline query keys.
- After mutations, update or invalidate the affected queries explicitly with `queryClient.invalidateQueries(...)` or `setQueryData(...)`.
- Keep Query for request/response server state. Keep Zustand for local UI state, optimistic editor state, and streaming chat/event application.

## Important Scoping Decision

Do not add `@tanstack/react-router-ssr-query` in the first tranche.

- The package is for SSR dehydration/hydration and streaming.
- `packages/web` is currently a Vite SPA/Electron surface, not an SSR surface.
- The main value right now is shared caching, route prefetch, and removal of manual `useEffect` fetch code.
- Revisit the SSR integration package only if `packages/web` or a future shell starts rendering through SSR.

## Keep Out of Scope for First Pass

- Live transcript loading, event stream sync, and incremental message patching in `chat-actions` and `chat-sync`
- Session creation/send/abort flows that are tightly coupled to streaming state
- Replacing all Zustand state with Query
- Refactoring vendor-facing backend contracts

## Top 10 Lowest-Hanging Asymmetric Wins

### 1. Shared resources query across `/chat` and `/read`

Why this is a win:

- The `/$directory/chat -> /$directory/read -> /$directory/chat` transition remounts the child subtree because `/$directory` keys the outlet by pathname in [packages/web/src/routes/$directory.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/routes/$directory.tsx:17).
- The reading page then refetches resources on mount in [packages/web/src/components/directory-chat/directory-chat-reading-page.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/directory-chat/directory-chat-reading-page.tsx:85).
- The sidebar has a manual cache in [packages/web/src/components/layout/chat-left-sidebar/resources-section.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/layout/chat-left-sidebar/resources-section.tsx:589), which is exactly the kind of logic Query should replace.

Target pattern:

- Create `resourcesQueryOptions(directory)` using SDK-backed `loadResources(directory)`.
- Use that query in both the sidebar resources section and the reading page.
- Invalidate the resources query after `addResource`, `rebuildResource`, `removeResource`, and rename flows.

Key files:

- [packages/web/src/components/layout/chat-left-sidebar/resources-section.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/layout/chat-left-sidebar/resources-section.tsx:571)
- [packages/web/src/components/directory-chat/directory-chat-reading-page.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/directory-chat/directory-chat-reading-page.tsx:85)
- [packages/web/src/state/resource-actions.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/resource-actions.ts:34)

### 2. Prefetch resource metadata in the `/$directory/read` route loader

Why this is a win:

- The current reading page does resource lookup after mount instead of before navigation settles.
- This is the cleanest place to apply the official `loader + ensureQueryData` pattern.

Target pattern:

- Add a route `loader` to [packages/web/src/routes/$directory.read.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/routes/$directory.read.tsx:9).
- The loader should `ensureQueryData(resourcesQueryOptions(directory))`.
- The reading page should resolve `resourceRecord` from the query cache instead of firing a fresh request in an effect.
- Keep `path` and `resource` search params as route inputs; do not move them into local state.

Key files:

- [packages/web/src/routes/$directory.read.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/routes/$directory.read.tsx:9)
- [packages/web/src/components/directory-chat/directory-chat-reading-page.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/directory-chat/directory-chat-reading-page.tsx:85)

### 3. One learner snapshot query feeding both curriculum and capabilities

Why this is a win:

- The right sidebar has two separate manual loaders in [packages/web/src/components/layout/chat-right-sidebar.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/layout/chat-right-sidebar.tsx:191).
- Both `loadCurriculumView(...)` and `loadRuntimeCapabilities(...)` derive from the same `/api/learner/snapshot` request in [packages/web/src/state/chat-actions.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-actions.ts:1531).
- This means Buddy is paying for duplicated request work and duplicated effect lifecycle code.

Target pattern:

- Create one `learnerSnapshotQueryOptions({ directory, persona, intent, sessionID })`.
- Use `select` or small pure derivation helpers to map that cached snapshot to curriculum view and runtime capabilities view.
- If the sidebar tab is route-critical later, preload the snapshot in a route loader. Otherwise keep it client-side with `useQuery`.

Key files:

- [packages/web/src/components/layout/chat-right-sidebar.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/layout/chat-right-sidebar.tsx:191)
- [packages/web/src/state/chat-actions.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-actions.ts:1482)
- [packages/web/src/state/chat-actions.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-actions.ts:1560)

### 4. Workspace Mermaid artifacts panel

Why this is a win:

- The panel is pure server state plus local virtualization state.
- It currently uses manual load/error handling in [packages/web/src/components/layout/workspace-mermaid-panel.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/layout/workspace-mermaid-panel.tsx:59).
- Query can own the server data while the component keeps virtualization/hydration indexes locally.

Target pattern:

- Create `workspaceMermaidArtifactsQueryOptions(directory)`.
- Replace mount effect loading with `useQuery`.
- Trigger invalidation when the directory transitions from busy to idle instead of manually reloading.

Key files:

- [packages/web/src/components/layout/workspace-mermaid-panel.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/layout/workspace-mermaid-panel.tsx:59)
- [packages/web/src/state/chat-actions.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-actions.ts:1614)

### 5. Workspace question-set artifacts panel

Why this is a win:

- It has the same structure and refetch trigger pattern as Mermaid.
- It is a straightforward copy of a good Query migration pattern once Mermaid is done.

Target pattern:

- Create `workspaceQuestionSetArtifactsQueryOptions(directory)`.
- Replace mount effect loading with `useQuery`.
- Use the same invalidation trigger as Mermaid when the underlying generation flow finishes.

Key files:

- [packages/web/src/components/layout/workspace-question-set-panel.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/layout/workspace-question-set-panel.tsx:24)
- [packages/web/src/state/chat-actions.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-actions.ts:1628)

### 6. MCP directory config + status dialog data

Why this is a win:

- [packages/web/src/components/mcp-dialog/use-mcp-directory-data.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/mcp-dialog/use-mcp-directory-data.ts:86) is already a thin async orchestration layer over two server reads.
- This is a natural fit for `useQuery` plus mutation invalidation.

Target pattern:

- Split the read side into:
  - `mcpStatusQueryOptions(directory)`
  - `projectConfigQueryOptions(directory)`
- Keep `query`, `pendingName`, and dialog-local UI state in React state.
- On connect/disconnect/authenticate, invalidate the MCP status query and any derived config query that can change.

Key files:

- [packages/web/src/components/mcp-dialog/use-mcp-directory-data.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/mcp-dialog/use-mcp-directory-data.ts:86)
- [packages/web/src/state/chat-actions.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-actions.ts:1686)
- [packages/web/src/state/chat-actions.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-actions.ts:1772)

### 7. Composer config bundle for directory chat

Why this is a win:

- [packages/web/src/lib/directory-chat/use-chat-config.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/lib/directory-chat/use-chat-config.ts:75) maintains a hand-rolled cache map and manually coordinates four reads.
- This is duplicated cache/inflight logic that Query already solves.

Target pattern:

- Create a single `composerConfigQueryOptions(directory)` that internally composes:
  - `agentCatalog`
  - `personaCatalog`
  - `projectConfig`
  - `commandCatalog`
- Keep slash command refresh as targeted invalidation of the command catalog query or of the composed query.
- Keep MCP status as a separate query, not embedded into the composer config payload.

Key files:

- [packages/web/src/lib/directory-chat/use-chat-config.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/lib/directory-chat/use-chat-config.ts:75)
- [packages/web/src/state/chat-actions.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-actions.ts:1686)
- [packages/web/src/state/chat-actions.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-actions.ts:1735)
- [packages/web/src/state/chat-actions.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-actions.ts:1751)
- [packages/web/src/state/chat-actions.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-actions.ts:1762)

### 8. Skills catalog consolidation across settings and the skills page

Why this is a win:

- The same remote catalog is loaded independently in:
  - [packages/web/src/components/settings/settings-advanced.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/settings/settings-advanced.tsx:74)
  - [packages/web/src/components/skills/skills-page.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/skills/skills-page.tsx:339)
- This is duplicated request and refresh logic for one logical data source.

Target pattern:

- Create `skillsCatalogQueryOptions(directory, refreshFlag?)` or a stable `skillsCatalogQueryOptions(directory)` and use explicit invalidation when refresh is required.
- Migrate mutations like install/create/remove/update-settings to Query mutations.
- After each mutation, invalidate the skills catalog query.

Key files:

- [packages/web/src/components/settings/settings-advanced.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/settings/settings-advanced.tsx:74)
- [packages/web/src/components/skills/skills-page.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/skills/skills-page.tsx:339)
- [packages/web/src/state/skills-actions.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/skills-actions.ts:23)

### 9. Route bootstrap data for `/chat`, `/onboarding`, and `/settings`

Why this is a win:

- These routes all do mount-time bootstrapping instead of route-time preloading:
  - [packages/web/src/routes/chat.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/routes/chat.tsx:70)
  - [packages/web/src/routes/onboarding.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/routes/onboarding.tsx:89)
  - [packages/web/src/routes/settings.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/routes/settings.tsx:121)
- This is exactly the integration point where Router + Query together create the “best of both worlds”: preload before render, then read from cache in the component.

Target pattern:

- For `/chat`, preload:
  - open projects
  - notebook home
- For `/onboarding`, preload:
  - open projects
  - provider catalog snapshot
  - notebook home
- For `/settings`, preload:
  - open projects
  - optionally session lists for the current/open directories if the cost is acceptable

Important note:

- Keep redirect/auth guards in `beforeLoad`.
- Move data fetches to `loader`.

Key files:

- [packages/web/src/routes/chat.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/routes/chat.tsx:37)
- [packages/web/src/routes/onboarding.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/routes/onboarding.tsx:40)
- [packages/web/src/routes/settings.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/routes/settings.tsx:49)

### 10. Local runtime status polling for standards and advanced math

Why this is a win:

- These hooks are classic Query polling cases:
  - [packages/web/src/components/settings/use-standards-runtime.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/settings/use-standards-runtime.ts:63)
  - [packages/web/src/components/settings/use-advanced-math-runtime.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/settings/use-advanced-math-runtime.ts:105)
- They currently hand-roll loading, polling intervals, and retry/error behavior.

Target pattern:

- Move status reads to `useQuery` with conditional `refetchInterval`.
- Keep install/remove actions as mutations.
- Invalidate the status query after mutation success or failure recovery.

Key files:

- [packages/web/src/components/settings/use-standards-runtime.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/settings/use-standards-runtime.ts:58)
- [packages/web/src/components/settings/use-advanced-math-runtime.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/settings/use-advanced-math-runtime.ts:98)

## Recommended Migration Order

### Phase 1: Foundation

- [ ] Keep the existing `QueryClient` in [packages/web/src/app.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/app.tsx:15), but move to explicit Query defaults:
  - Set conservative defaults for `staleTime`, `gcTime`, and retry policy.
  - Do not set global refetch-on-focus behavior until the resource-heavy screens are audited.
- [ ] Introduce feature-owned query key factories and `queryOptions(...)` helpers.
- [ ] Keep key names literal and centralized. Do not inline ad hoc arrays throughout components.
- [ ] Use SDK-backed action functions as queryFns where possible. Do not introduce manual `fetch`.
- [ ] Do not use route `beforeLoad` for data fetching.

### Phase 2: First Real Win

- [ ] Migrate resources first.
- [ ] Add `resourcesQueryOptions(directory)`.
- [ ] Replace the manual sidebar cache with Query cache reads.
- [ ] Add a `loader` to `/$directory/read` that calls `ensureQueryData(resourcesQueryOptions(directory))`.
- [ ] Remove the mount-time `loadResources(...)` request from the reading page once cache reads are in place.
- [ ] Invalidate resources after add/rebuild/remove/rename.

### Phase 3: Shared Snapshot and Artifact Panels

- [ ] Add one learner snapshot query and derive curriculum/capabilities from it.
- [ ] Migrate Mermaid artifacts panel to `useQuery`.
- [ ] Migrate question-set artifacts panel to `useQuery`.
- [ ] Use invalidation on busy-to-idle transitions instead of direct reload calls.

### Phase 4: Dialog and Composer Reads

- [ ] Migrate MCP dialog read paths to Query.
- [ ] Migrate composer config read paths to Query.
- [ ] Remove hand-rolled in-memory composer config caching once Query is authoritative.

### Phase 5: Cross-Route and Settings Reads

- [ ] Migrate skills catalog consumers to a single cached query.
- [ ] Add route loaders for `/chat`, `/onboarding`, and `/settings` bootstrap data.
- [ ] Migrate standards runtime status and advanced math runtime status polling to Query.

## Subagent Implementation Instructions

### General Rules

- [ ] Preserve Buddy’s split of responsibilities:
  - Query owns request/response server state.
  - Zustand owns transient UI state and streaming session state.
- [ ] Keep query factories close to the feature that owns the data.
- [ ] Prefer exported `type` aliases, not interfaces.
- [ ] Do not use casts or `any`.
- [ ] Use `queryOptions(...)` for reusable read definitions.
- [ ] Use `useSuspenseQuery(...)` only when the route loader has already ensured the data or when suspense is intentionally desired.
- [ ] Use `useQuery(...)` for non-blocking client-only fetches.
- [ ] Use route `loader` for pre-navigation data guarantees.
- [ ] Keep `beforeLoad` only for redirects/guards.

### Per-Feature Checklist

- [ ] For each migrated feature, add:
  - a stable query key factory
  - a `queryOptions(...)` factory
  - mutation invalidation rules
  - component conversion away from mount-time `useEffect` fetches
- [ ] When one endpoint powers multiple views, create one underlying query and derive the views from cached data instead of duplicating requests.
- [ ] When a feature currently uses a manual cache map, delete that cache once Query replaces it.

### Validation Checklist

- [ ] Confirm `/chat -> /read -> /chat` no longer causes a network refetch of resources unless invalidated or stale by policy.
- [ ] Confirm route navigation still works with the existing `defaultPreload: "intent"` router behavior in [packages/web/src/app.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/app.tsx:32).
- [ ] Confirm data mutations refresh the correct panels without full-screen reloads.
- [ ] Confirm no live transcript/session behavior regresses.
- [ ] Run:
  - `bun fmt`
  - `bun lint`
  - `bun typecheck`

## Acceptance Criteria

- Manual mount-time `useEffect` fetch code is removed from the first-wave target screens.
- Route-critical reads use `loader + ensureQueryData`.
- Shared server state is no longer cached in ad hoc `Map` objects or duplicated local state where Query can own it.
- Route transitions reuse cached data instead of paying repeated network cost.
- Mutation paths refresh their dependent reads through explicit invalidation.
