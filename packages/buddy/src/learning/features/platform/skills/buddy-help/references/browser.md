---
name: browser
description: "Buddy Browser: Bench tabs, profiles, Incognito, link opening, webpage citations, desktop."
---

# Browser

Use when the user asks about Buddy's in-app Browser, web tabs, profiles, Incognito, opening links in Buddy, or citing a webpage. Desktop app only. ChatGPT and MCP sign-in use the **system browser** (`providers.md`, `extend.md`).

## Open and use

- **New tab** in the sidebar or **Cmd/Ctrl+T** opens a blank Browser tab on the Bench using the default profile.
- Bench **+** → **Open in a new tab** offers Browser profiles, recent items, files, and a URL/search field. Choose **Incognito** here when needed.
- Ask Buddy to open an HTTP or HTTPS page and it can present a new Browser tab. The page is controlled by the user: Buddy cannot inspect, click, type, scroll, or screenshot the live Browser tab.
- The tab has Back, Forward, Reload, an address/search field, and **More**. A blank **New tab** page shows search and **Recently visited** pages from this notebook.
- **More** offers hard reload, zoom, page Appearance, clear cookies, and clear cache. The address bar can **Open in system browser**.
- Select page text → **Cite selected text**, or use **Cite in Chat** from the page menu, to put a web quote in the chat composer. Clicking a saved quote tries to reopen and highlight the passage.

The Browser is available on the desktop app. A web build says **Browser requires Buddy desktop**.

## Where links open

**Settings → Browser → Open links in** chooses **Your default browser** (initial default) or **Buddy** for web links in chats, Markdown documents, PDFs, and books.

- The first eligible click may ask **Open links in Buddy?** Choose **Use default browser** or **Open in Buddy**. Change the choice in Settings later.
- **Cmd/Ctrl+click** opens a web link in the system browser either way.
- Provider and MCP sign-in, and **Open in system browser**, use the system browser regardless of this setting.

## Profiles and defaults

- **Settings → Browser → Profiles** separates cookies and logins. **Default** is built in. Add a blank profile or import cookies from Chrome, Edge, or Safari; the source browser may need to be closed for import.
- **Incognito** is chosen from the Bench tab picker, not the Settings profile list. Its data is cleared when Buddy closes, and its visits do not appear in Recently visited.
- A profile menu can **Set as default**, **Clear cookies and cache**, or remove a custom profile and its data. Already open tabs in a removed profile stay open until closed.
- **Settings → Browser → Defaults** controls search engine, zoom for new tabs, page Appearance, and link opening. Browser Appearance tells web pages which color scheme to prefer; the app theme is under Settings → Appearance.

## Limits and gotchas

- Browser tabs are not restored after Buddy restarts. Recently visited pages are kept per notebook on this machine.
- Browser tabs accept HTTP and HTTPS pages. Other address types and links that try to open another app can be blocked.
- There is no Browser downloads list; camera and microphone are unavailable in Browser.
- Buddy can separately search or fetch the web when that capability is used, but opening a page in Browser does not give Buddy the live tab contents.

## Related

`workspace.md` — Bench tabs; `settings.md` — Browser and Shortcuts tabs; `trust.md` — network and local data.
