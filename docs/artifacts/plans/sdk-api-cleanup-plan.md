# SDK API Cleanup Plan

## Status

- `requestJson` has been fully removed from code.
- The only remaining repo mention of `requestJson` is the rule text in `AGENTS.md`.

## Remaining Manual API Helpers

- `apiFetch`
- `resolveApiUrl`
- `createEventStreamUrl`

## Remaining Manual API Call Sites

### Raw file access

- `packages/web/src/state/resources-query.ts`
  - raw blob read for resource covers and reading resources
- `packages/web/src/components/project-explorer/project-file-explorer-panel.tsx`
  - `HEAD /file/raw/{fileName}` metadata read
  - raw blob read for reader files

### Event streaming

- `packages/web/src/state/chat-sync.ts`
  - authenticated fetch-based SSE path
  - browser `EventSource` path

### Direct URL resolution

- `packages/web/src/components/chat/tools/render/render-figure.tsx`
- `packages/web/src/components/markdown/Markdown.tsx`
- `packages/web/src/components/chat/tools/tool-attachments.tsx`

## SDK Coverage

- Raw file bytes:
  - `getBuddyClient(directory).explorer.file.raw(...)`
  - supports `parseAs: "blob"`
- Raw file headers:
  - `getBuddyClient(directory).headApiFileRawFileName(...)`
- Event stream:
  - `getBuddyClient(directory).event.stream(...)`

## Phases

### Phase 1

Replace remaining `/file/raw/*` manual fetches with `BuddyClient`.

Targets:

- `packages/web/src/state/resources-query.ts`
- `packages/web/src/components/project-explorer/project-file-explorer-panel.tsx`

Expected cleanup:

- `apiFetch` usage should drop to event streaming only.
- `packages/web/src/lib/project-file-raw-url.ts` may become removable.

### Phase 2

Audit and refactor event streaming in `packages/web/src/state/chat-sync.ts`.

Questions to answer during implementation:

- What does vendor use for event streaming today?
- Should Buddy keep browser-native `EventSource` for non-authenticated web flows?
- Should desktop/auth-required streaming switch to SDK SSE first, or should both paths unify behind SDK?

### Phase 3

Reassess `packages/web/src/lib/api-client.ts`.

- Delete `apiFetch` if event streaming no longer depends on it.
- Keep `resolveApiUrl` only if direct asset URLs are still required.
- Keep or remove `createEventStreamUrl` based on the final SSE design.

## Verification Requirements

- `bun fmt`
- `bun lint`
- `bun typecheck`
