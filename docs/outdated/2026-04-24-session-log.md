# 2026-04-24 Session Log

## Context

This session started from a first-send/new-thread bug in `packages/web`: after sending a prompt from a draft/new session, the left sidebar showed a newly created session, but the main chat area stayed on the empty state until assistant generation finished. The work also touched ongoing cleanup around replacing manual `requestJson` calls with typed SDK calls.

## Main Findings

- The first attempt focused on canonical session selection and stale bootstrap loads. That fixed several state races but did not fix the user-visible blank main pane.
- The screenshot and console logs showed the real failure mode: the sidebar had a real busy session, while the main pane still had no user message to render.
- Buddy was waiting for the proxied `session.prompt` POST to resolve before applying the first user message. In the real app that POST can remain pending while generation runs.
- Vendor OpenCode does not wait for prompt completion to show the user turn. It creates a client-side message ID, inserts an optimistic user message and parts immediately, and then sends the prompt request using the same message ID.
- Our initial optimistic ID format was invalid for vendored OpenCode. OpenCode validates message IDs with the `msg` prefix and part IDs with the `prt` prefix.
- Title generation still appears to be vendored and backgrounded. It is triggered in `vendor/opencode/packages/opencode/src/session/prompt.ts` via `SessionPrompt.ensureTitle`, forked on the first prompt loop step, and uses the `title` agent or provider small model fallback.
- Sidebar/title freshness depends on SSE `session.updated` or session-list refetch. Logs showed SSE reconnect churn (`connect -> open -> error -> connect -> open`), which can make sidebar/title updates feel slower even when title generation itself is still backgrounded.

## Changes Made

- `packages/web/src/state/chat-actions.ts`
  - Added per-directory request invalidation helpers for session-list and transcript loads.
  - Added canonical/draft selection helpers so real session state wins over stale draft/bootstrap state.
  - Marked directories ready immediately when selecting canonical/draft sessions and when promoting prompt/command mutations.
  - Changed `sendPrompt()` and `sendCommand()` to consume typed SDK `200` responses (`{ info, parts }`) instead of assuming an empty response.
  - Added optimistic user-message insertion for `sendPrompt()` before the prompt request resolves, following vendor behavior.
  - Added client-generated optimistic IDs using vendor-compatible prefixes: `msg...` for messages and `prt...` for parts.
  - Passed `messageID` through the prompt body so the backend/vendor can use the same ID.
  - Removed optimistic messages on failure or when recovering from missing-session retry.
  - Prevented stale bootstrap transcript reloads from overwriting live first-send messages.
  - Replaced several manual `requestJson` usages with typed SDK calls.
- `packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts`
  - Passed the resolved submitted session ID into teaching-runtime sync after prompt/command sends instead of using stale closed-over draft session state.
- `packages/web/src/state/chat-sync.ts`
  - Restored explicit SSE request headers: `Accept: text/event-stream` and `Cache-Control: no-cache`.
- `packages/web/test/chat-actions.test.ts`
  - Updated prompt tests to use the real SDK response shape.
  - Added regression coverage for stale bootstrap transcript reloads.
  - Added regression coverage that the submitted user message appears before the prompt request resolves.
  - Reset leaked model-selection restoration metadata between tests.
- `packages/web/test/chat-sync-stream.test.ts`
  - Updated the test harness to read headers from `Request` objects.

## Validation Run

- Passed: `bun test --preload ./happydom.ts test/chat-actions.test.ts test/chat-sync-stream.test.ts`
- Passed: `bun run --cwd packages/web typecheck`

## Known Remaining Observations

- Repo-wide `bun fmt` / `bun typecheck` remain blocked by an unrelated backend parse error in `packages/buddy/src/learning/capabilities/pedagogy/tools/definitions/prepare-resource.ts`.
- Sidebar title updates may still feel slow if SSE reconnects repeatedly or if session/title updates are delayed behind broad `resyncDirectory()` work.
- Title generation itself still appears vendor-driven and backgrounded; no evidence was found that Buddy moved it to a slower blocking path.
