# AGENTS.md

## Web Learnings (non-obvious)
- Web should treat backend as a compatibility contract (`/api/*`) and stay decoupled from OpenCode internal payload/store details.
- Chat SSE must reconnect with backoff and then resync via `GET /api/session/:id/message`; reconnect alone can leave stale UI state.
- Derive `isBusy` from the latest assistant message `finish` field after sync/reconnect to avoid blocked sends when stream lifecycle events are missed.
- In `packages/web`, `@/lib/*` can resolve into `packages/ui/src/lib/*` via Vite alias rewriting; use relative imports for web-only modules unless alias config is updated.
- Console errors like “message channel closed before a response was received” can come from browser extensions; confirm with `/api/*` network responses and backend logs before app-level fixes.
- Markdown rendering behavior spans `src/lib/markdown-parser.ts` and `src/components/Markdown.tsx`; change both together to preserve OpenCode-style link, math, and code-block handling.
- Canonical chat context is `/$directory/chat`; `/chat` is an entry/redirect route and should not own long-lived chat state.
- `src/state/chat-actions.ts` includes a post-send resync poll to recover from dropped SSE status events; this is the safety net when backend completed but UI stayed busy.
- Debugging stalled sends is fastest with paired logs: backend (`bus.publish`, `route.sse.event`) and frontend (`chat-sync`, `chat-action`), not browser extension noise.
- OpenCode-style composer layout is a two-layer dock: input shell on top with inline send/stop control, and agent/model/thinking controls in a bottom tray; putting controls above the textarea diverges from expected interaction.
- Project picking in desktop mode should first use runtime bridges (`window.__TAURI__.dialog.open` or `window.electronAPI.openDirectoryPickerDialog`) and only fall back to manual path entry when neither bridge exists.
