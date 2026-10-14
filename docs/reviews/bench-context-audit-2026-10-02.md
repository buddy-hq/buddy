# Bench context audit — 2026-10-02

Research ledger for mismatches between what the user sees on the Bench and what Buddy is told. Produced by a read-only code audit after the chat-tab bug. Nothing here was reproduced in the running app. Line numbers are from the working tree on 2026-10-02 and will drift.

Status tags: **fixed**, **confirmed** (re-read by the main session), **reported** (audit agent's reading only), **inferred**.

## Fixed in this session

- **fixed** — Chat or subagent chat tab selected: web published `{"status":"closed"}` and dropped chat tabs from the tab list. Now published as `visibility: "chat"` with `session` tab targets; Read Bench adds the session database path. `packages/web/src/lib/directory-workspace-lifecycle.ts`, `packages/buddy/src/learning/features/bench/context.ts`, `tools/read-context.ts`, `prompt/user-prelude/index.ts`.

## Fixed after the audit (same day)

Decisions taken with the user: a list-covered item is reported as the item plus "list covers it"; `@` mentions carry pointers; the whiteboard preview is left alone.

1. **fixed** — Mermaid and figure tabs opened from the UI now register under the tab's own target when the tab leaves the revision open (`objectContextTargetForRoute` in `packages/web/src/components/bench/bench-context-utils.ts`, used by every object surface registration).
2. **fixed** — An item covered by another section's list keeps its live context: `BenchSurfaceHost` parks only the presentation, and the published `drawer.presentation` is `covering`. Notes get their library path in the turn context even from the route-fallback stub.
3. **fixed** — A list or drawer opened from a New tab publishes `visibility: "new-tab"` with the drawer and every open tab.
4. **fixed** — A collapsed Bench with a New tab in front of item tabs publishes `parked` with the tab list. A collapsed Bench holding only New tabs still publishes `closed`.
5. **fixed** — Note unavailable, Browser on the web build, and Browser settings failed publish `unavailable` or `error`. Browser page errors carry the error kind and, for load failures, the description and code. Note loading and Browser hydrating still use the loading stub, which is accurate.
6. **fixed** — `@` locators: an open-tab chip names the note path or the object kind and ID; chat mentions get the session database pointer and object mentions (all kinds but whiteboard and resource) get the object folder, both appended on the server in `normalizePromptParts`; subagent chip titles drop the `(@agent subagent)` suffix.
7. **fixed** — `drawer.presentation` is now `drawer`, `covering`, `beside`, or `hidden`, and the turn context words each one. `drawer.kind` stays the stored drawer so screenshot capture still matches.
10. **fixed** — Turn context no longer says "loaded target" beside a loading state, and adds "Only the learner can switch to a chat tab" when a chat tab is open; Read Bench's description covers chat tab targets and drawer positions; `chat.md` describes `@` as a notebook search.

## Left open

8. **left by decision** — The whiteboard-opening transient preview is not published; Buddy sees the tab underneath. Rare and brief.
9. **open**, low — Titles: a notebook Markdown tab is `foo.md` in the list but `foo` when selected; legacy note filenames with a ` — <ID>` suffix differ from the strip; a blank Browser tab and the empty Bench page are both "New tab"; a session or note rename republishes only on the next prompt.
- **open**, low — A list or drawer open with the route closed and no New tab to stand behind it still publishes `closed`.

## Checked and consistent

- Tab numbering: item tabs then New tabs, same order as the strip and as Cmd/Ctrl+1–9.
- Hydration pending, leaving to Settings or Skills, and chat switching publish `closed` by design.
- New tab snapshot matches the empty page, docked and immersive.
- Parked state publishes tabs and the selected browser.
- Markdown, file and object surfaces' pending, error, unsupported and large-file states publish accurate status text.
- Reading page registers with the route target.
- Browser runtime titles are normalised at the source, so strip, tab list and chip agree.

## Not determined

- No runtime trace of any finding.
- How often finding 7 occurs.
- Whether a rejected publish can leave Buddy with a stale snapshot.
- Retained-previous and chat-transition frames were only partly traced.
