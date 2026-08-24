# Browser v1 desired state

## Outcome

Buddy has a real browser inside Bench. The user controls the page. The agent knows which browser pages exist and can open a link for the user, but cannot read or operate the page.

## Product contract

- Each browser page is a normal Bench tab. Browser does not add a second tab strip.
- Browser tabs belong to the chat that opened them and stay alive while the user switches between Bench tabs or chats.
- Browser tabs are temporary. Buddy does not restore them after an app restart and does not turn them into managed objects.
- All Browser tabs share one persistent Buddy browser session. A user signs into a site once across Buddy.
- The toolbar contains an address field, Back, Forward, and Reload.
- A blank Browser tab is labeled **New tab**, shows a globe, and keeps `about:blank` out of the address field.
- After a page loads, its title and favicon replace the blank-tab label and globe. Electron captures the favicon through the Browser session, and Buddy only shows it while the tab remains on the page's origin.
- The address field accepts HTTP and HTTPS URLs, including localhost. Bare localhost addresses default to HTTP; other bare hosts default to HTTPS.
- `file:`, `data:`, `javascript:`, and links to other applications are blocked.
- HTTP(S) popups load in the current Browser tab, matching t3code v1 behavior.
- Downloads are cancelled with a clear “Downloads are not supported yet” message.
- Sanitized clipboard writes are allowed, matching t3code. Camera, microphone, location, notifications, and screen capture are denied.
- The local acceptance page is Buddy's web development server. The public signed-in acceptance page is `https://hibuddy.in`.

## Agent contract

Every agent turn receives compact Browser state through the existing Bench context:

- tab ID;
- URL;
- page title;
- loading state;
- whether the tab is selected and visible;
- a compact list of the chat's other Browser tabs.

The Browser feature adds one agent action:

```text
inapp_browser_open({ url })
```

It validates the URL, creates a new visible Browser Bench tab, and selects it. It never replaces the page the user is using.

The agent cannot inspect page contents, take screenshots, click, type, scroll, submit forms, run page JavaScript, or read console and network data.

## Ownership

| Owner | Responsibility |
| --- | --- |
| Bench | Browser tab identity, chat ownership, selection, visibility, and the selected target supplied to agent context |
| Browser web UI | Toolbar, navigation requests, loading and failure feedback, and the `<webview>` element |
| Electron | Browser guest registration, one shared persistent session, permissions, popup policy, download policy, crashes, page events, and bounded favicon capture |
| Browser feature | `inapp_browser_open`, URL validation, and the agent-facing Browser contract |

The browser page is embedded with Electron's `<webview>`, matching t3code. This is a deliberate choice: Browser must compose with Bench's React layout and floating chat without native-view stacking problems.

## Required implementation rule

T3code is the reference implementation for Browser behavior. When t3code has already solved the same problem, inspect and adapt that pattern before writing a Buddy-specific one. Do not invent a parallel pattern unless Buddy's existing architecture requires a difference; record that difference and its reason in this folder.

The main references are:

- `/Users/prashantbhudwal/Code/t3code/apps/web/src/components/preview`
- `/Users/prashantbhudwal/Code/t3code/apps/desktop/src/preview`
- `/Users/prashantbhudwal/Code/t3code/apps/server/src/preview`
- `/Users/prashantbhudwal/Code/t3code/apps/server/src/mcp/toolkits/preview`

## Deliberate differences from t3code

- Buddy uses one shared persistent partition because Buddy is single-user and has no environment profiles.
- Buddy keeps `contextIsolation` enabled because v1 injects no picker or automation preload into pages.
- `inapp_browser_open` reuses Bench's acknowledged client-action channel; the separate automation broker is deferred with page control.
- Browser tabs are removed from saved workspace state because v1 tabs are explicitly temporary.
- Buddy denies site permissions and downloads because v1 has no permission or download interface.
- Buddy calls the idle surface **New tab** instead of t3code's current **Browser** label because it is a normal Bench tab created by the user's New tab action. Both keep `about:blank` out of the visible address field.

## Deferred

- DOM or accessibility snapshots
- Agent clicking, typing, scrolling, waiting, or JavaScript execution
- Playwright and Chrome debugging integration
- An automation broker or human-interruption protocol
- DevTools UI, responsive presets, element picking, recording, and picture-in-picture
- Tab restoration, browser-data settings, downloads, external-app links, and website permission prompts
- Moving HTML widgets onto the Browser renderer

The future automation layer must extend the same Bench targets, tab IDs, session, and Electron guest registration. It must not replace the v1 foundation.

## Acceptance

Browser v1 is complete when all of these are true on macOS and Windows:

1. A user can open Browser in Bench, enter an address, navigate, go back and forward, and reload.
2. Switching Bench tabs and chats does not accidentally destroy or reveal another chat's Browser page.
3. Signing into `https://hibuddy.in` is shared by other Browser tabs and survives an app restart, while the tabs themselves do not return.
4. An agent can open an HTTP(S) link in a new selected Browser Bench tab.
5. The next agent turn sees the selected Browser tab's current URL, title, loading state, and visibility, but no page content.
6. Popups stay in the current tab; downloads and disallowed URL schemes are blocked with visible feedback.
7. The existing HTML widget flow is unchanged.
8. Blank tabs show **New tab** and a globe; loaded pages show their live title and favicon, including after switching away and back.
