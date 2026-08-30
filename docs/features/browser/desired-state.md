# Browser v1 desired state

## Outcome

Buddy provides a real browser inside Bench. The user controls the page. The agent knows which browser pages exist and can open links for the user, but cannot read or operate the page.

## Product contract

- Each browser page is a normal Bench tab. Browser does not add a second tab strip.
- Browser tabs belong to the chat that opened them and persist across Bench tab or chat switches.
- Browser tabs are temporary: not restored after app restart and not stored as managed objects.
- All Browser tabs share one persistent Buddy browser session (single sign-on across the app).
- The toolbar contains an address field, Back, Forward, and Reload.
- A blank tab is labeled **New tab**, shows a globe, and omits `about:blank` from the address field.
- Once loaded, live page title and favicon replace the blank label and globe. Favicons are captured via the session and shown only while on the origin.
- Address field accepts HTTP(S) URLs (localhost defaults to HTTP; other bare hosts default to HTTPS).
- `file:`, `data:`, `javascript:`, and external application links are blocked.
- HTTP(S) popups load in the current Browser tab.
- Downloads are cancelled with a clear “Downloads are not supported yet” message.
- Sanitized clipboard writes are allowed. Camera, mic, geolocation, notifications, and screen capture are denied.
- Acceptance pages: Buddy web dev server (local); `https://hibuddy.in` (public authenticated).

## Agent contract

Agent turns receive compact Browser state via Bench context:

- tab ID, URL, page title, loading state, selection/visibility, and other chat Browser tabs.

The feature adds one agent tool:

```text
inapp_browser_open({ url })
```

Validates the URL, creates and selects a new visible Browser Bench tab, and never replaces the active user page. The agent cannot inspect DOM contents, capture screenshots, click, type, scroll, run JavaScript, or access console/network data.

## Ownership

| Owner | Responsibility |
| --- | --- |
| Bench | Tab identity, chat ownership, selection, visibility, and agent turn context |
| Browser web UI | Toolbar, navigation controls, loading/failure feedback, and `<webview>` element |
| Electron | Guest registration, shared persistent session, permissions, popups, downloads, crashes, favicons |
| Browser feature | `inapp_browser_open`, URL validation, agent-facing contract |

The browser page is embedded with Electron's `<webview>` to compose cleanly with Bench's React layout and floating chat without native-view stacking issues.

## Reference implementation and t3code differences

T3code is the reference implementation (`apps/{web,desktop,server}/src/preview`, `apps/server/src/mcp/toolkits/preview`). Deliberate Buddy differences:

- Single shared persistent partition (Buddy is single-user without environment profiles).
- `contextIsolation` enabled (no picker or automation preload injected in v1).
- `inapp_browser_open` uses Bench's client-action channel (automation broker deferred).
- Excluded from saved workspace state (temporary tabs).
- Permissions and downloads denied (no v1 UI).
- Idle surface labeled **New tab** instead of **Browser**.

## Deferred

- DOM/accessibility snapshots and CDP/Playwright integration.
- Agent clicking, typing, scrolling, waiting, or script execution.
- Automation broker, interruption protocol, DevTools, responsive presets, and recording.
- Tab restoration, data clearing settings, and website permission prompts.
- Moving HTML widgets onto the Browser renderer.

The future automation layer must build atop these Bench targets, tab IDs, session, and guest registration without replacing the v1 foundation.

## Acceptance

Browser v1 is complete when verified on macOS and Windows:

1. User can open Browser in Bench, enter URLs, navigate, go back/forward, and reload.
2. Switching Bench tabs or chats does not destroy or leak another chat's Browser page.
3. Sign-in to `https://hibuddy.in` is shared across tabs and survives app restarts (tabs themselves do not).
4. Agent can open an HTTP(S) link in a new selected Browser Bench tab.
5. Next agent turn sees URL, title, loading, and visibility for the tab, with no page content.
6. Popups stay in current tab; downloads and disallowed URL schemes fail with feedback.
7. HTML widget flow is completely unaffected.
8. Blank tabs show **New tab** / globe; loaded pages show live title / favicon.
