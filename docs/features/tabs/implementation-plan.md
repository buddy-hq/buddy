# Buddy Bench Tabs — Implementation Plan

## Outcome

Give every chat a persistent ordered set of Bench tabs with T3 Code-style presentation and
interactions, while keeping the active target URL-owned and every transition controller-owned.

## Phase 1 — Tab Infrastructure And UI

- Add the final tab identity and ordered-tab model to each chat workspace slot.
- Make the workspace controller own open, focus, close, bulk-close, restore, and chat-transition
  tab outcomes.
- Persist and hydrate tabs without duplicating active selection outside the route.
- Render the T3 Code-style tab strip and wire every existing user presentation path to open or
  focus tabs.
- Keep mounted Bench surfaces bounded and release surfaces whose tabs close.
- Preserve current collapse, New Chat, dirty-work, supersession, and drawer behavior.
- Verify the store, controller, persistence, navigation, rendering, and interactions end to end.

Phase 1 does not change agent tool schemas, backend APIs, SDK contracts, or model-visible Bench
context.

## Phase 2 — Agent And API Integration

- Extend `bench_present` with exact-tab focus while keeping it the only presentation tool.
- Make `bench_read_context` report tab summaries and optionally return a temporary Bench screenshot
  path through an explicit response format. Keep model-visible tab summaries bounded and support an
  optional flat text search across the complete internal tab list. Include current one-based tab
  numbers for interpreting user references while retaining exact tab keys for focus actions.
- Make explicit presentation focus and reveal. Reveal the first active-chat whiteboard update in an
  agent message, keep later updates in that message in the background, and never switch chats for
  inactive-chat auto-open. Focus fullscreen widgets presented for the active chat while keeping
  inactive-chat widget presentation in the background.
- Replace the client-action, context, OpenAPI, and SDK contracts together with no compatibility
  layer.
- Verify capture cleanup, tab/context consistency, auto-open edge cases, lint, and type safety.
