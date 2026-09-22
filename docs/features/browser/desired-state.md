# Browser v1 desired state

## Outcome

Buddy provides a real browser inside Bench. The user controls the page. The agent knows which browser pages exist and can open links for the user, but cannot read or operate the page. The user can cite selected page text into the chat.

## Product contract

- Each browser page is a normal Bench tab. Browser does not add a second tab strip.
- Browser tabs belong to the chat that opened them and persist across Bench tab or chat switches.
- Browser tabs are temporary: not restored after app restart and not stored as managed objects.
- Browser profiles have separate Chromium sessions. Persistent profiles keep sign-ins across app
  restarts; Incognito is discarded when Buddy quits.
- The toolbar contains an address field, Back, Forward, and Reload.
- A blank tab is labeled **New tab**, shows a globe, omits `about:blank` from the address field, and
  presents a native search surface above recently visited pages.
- Once loaded, the live page title and favicon replace the blank label and globe. The tab tries the
  session-captured favicon, then the committed page origin's `/favicon.ico`, then the globe.
- The native New tab field and address field use the configured search engine for ordinary words and
  phrases. Google is the default and DuckDuckGo is available in Browser settings.
- Address fields accept HTTP(S) URLs (localhost defaults to HTTP; other bare hosts default to HTTPS).
  Explicit unsupported schemes remain blocked instead of becoming search queries.
- `file:`, `data:`, `javascript:`, and external application links are blocked.
- OAuth-style `new-window` popups open as hardened child windows. Other allowed HTTP(S) popup
  navigations load in the current Browser tab.
- Downloads use Chromium's normal download flow.
- Clipboard read/sanitized write, notifications, and geolocation are allowed. Camera, microphone,
  screen capture, and other unlisted permissions are denied.
- Settings can choose the default search engine; create, remove, and select profiles; clear profile
  cookies/cache; and import cookies from supported installed browsers. Import failures must produce
  user feedback and structured logs.
- Acceptance pages: Buddy web dev server (local); `https://hibuddy.in` (public authenticated).

## Agent contract

Agent turns receive compact Browser state via Bench context:

- tab ID, URL, page title, loading state, selection/visibility, and other chat Browser tabs.

The feature adds one agent tool:

```text
inapp_browser_open({ url })
```

Validates the URL, creates and selects a new visible Browser Bench tab, and never replaces the active user page. The agent cannot inspect DOM contents, capture screenshots, click, type, scroll, run JavaScript, or access console/network data.

## Citations

Browser text is cited like document, reader, and chat text, as a `web` citation source:

- Selecting page text shows the standard Cite button; the page's context menu also offers
  **Cite in Chat**. Citing adds a quote chip and opens its comment editor while the page keeps the
  text marked.
- The citation stores the excerpt, a drift-tolerant text selector, the committed page URL read by
  Electron main, the Browser profile, the page title, and the nearest headings. Page text leaves
  the page only when the user cites it.
- The model receives the excerpt, URL, title, and section in the standard `<buddy_citation>` block.
  It still cannot read the page.
- Opening a web quote switches to a Browser tab in the current chat that shows the page, or opens
  a new tab in the cited profile (Default when that profile was removed), then scrolls to and
  briefly highlights the text. It never replaces the user's current page.
- Quote details offer **Open in system browser** with a `#:~:text=` link.
- Text inside iframes, canvas-rendered pages, and the PDF viewer cannot be cited.

## Ownership

| Owner | Responsibility |
| --- | --- |
| Bench | Tab identity, chat ownership, selection, visibility, and agent turn context |
| Browser web UI | Toolbar, navigation controls, loading/failure feedback, `<webview>` element, and the Cite button |
| Electron | Guest registration, profile sessions, permissions, popups, downloads, crashes, favicons, cookie import, and citation capture, marking, and reveal |
| Browser feature | `inapp_browser_open`, URL validation, agent-facing contract |

The browser page is embedded with Electron's `<webview>` to compose cleanly with Bench's React layout and floating chat without native-view stacking issues.

## Reference implementation and t3code differences

T3code is the reference implementation (`apps/{web,desktop,server}/src/preview`, `apps/server/src/mcp/toolkits/preview`). Deliberate Buddy differences:

- Named persistent partitions plus an ephemeral Incognito partition.
- `contextIsolation` enabled. The only guest preload handles mouse navigation, blocked links, and
  text citations; there is no picker or automation preload.
- `inapp_browser_open` uses Bench's client-action channel (automation broker deferred).
- Excluded from saved workspace state (temporary tabs).
- Native Electron user agent retained: rewriting it breaks browser-integrity checks such as
  Cloudflare Turnstile.
- Downloads use Chromium defaults; unlisted permissions stay denied.
- Cookie import supports Chrome and Safari on macOS and Chrome and Edge on Windows. Windows
  DPAPI-protected cookie keys are decrypted only under the current Windows account.
- Idle surface labeled **New tab** instead of **Browser**.

## Deferred

- DOM/accessibility snapshots and CDP/Playwright integration.
- Agent clicking, typing, scrolling, waiting, or script execution.
- Automation broker, interruption protocol, DevTools, responsive presets, and recording.
- Tab restoration and per-site permission prompts.
- Additional browser import sources. Cookies protected with Chromium's Windows App-Bound Encryption
  stay inside the source browser by design and require signing in manually in Buddy.
- Moving HTML widgets onto the Browser renderer.

The future automation layer must build atop these Bench targets, tab IDs, session, and guest registration without replacing the v1 foundation.

## Acceptance

Browser v1 is complete when verified on macOS and Windows:

1. User can open Browser in Bench, enter URLs, navigate, go back/forward, and reload.
2. Switching Bench tabs or chats does not destroy or leak another chat's Browser page.
3. Sign-in to `https://hibuddy.in` is shared across tabs in the same persistent profile and survives
   app restarts (tabs themselves do not); profiles remain isolated from one another.
4. Agent can open an HTTP(S) link in a new selected Browser Bench tab.
5. Next agent turn sees URL, title, loading, and visibility for the tab, with no page content.
6. OAuth popups work in hardened child windows, downloads proceed, and disallowed URL schemes fail
   with feedback.
7. HTML widget flow is completely unaffected.
8. Blank tabs show **New tab** / globe; loaded pages show live title / favicon.
9. New tab and address-bar searches use the selected engine without weakening URL scheme blocking.
