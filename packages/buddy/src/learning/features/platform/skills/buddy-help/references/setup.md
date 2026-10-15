---
name: setup
description: "Buddy setup: install, updates, desktop start/restart, first-run onboarding."
---

# Setup

Use when the user asks how to install or update Buddy, why it won’t start, restart/logs, or first-launch onboarding.

Not skill install or Advanced packages (`extend.md`). Privacy: `trust.md`. Providers after setup: `providers.md`.

## Install & updates

Use when the user asks how to get Buddy, update it, pick Stable vs Preview, or recover a broken install. Desktop app only (macOS + Windows). Not skill install or Advanced packages — `extend.md`. First-launch wizard and process issues: sections below.

### Fresh install

For **Stable**, prefer the site script or the download buttons on hibuddy.in.

| OS | Command |
| --- | --- |
| macOS | `curl -fsSL https://hibuddy.in/install \| bash` |
| Windows | `irm -UseBasicParsing https://hibuddy.in/install \| iex` |

Same from **hibuddy.in** → **Download for Mac** / **Download for Windows**.

**macOS after the script:** DMG/ZIP opens. Drag **Buddy** into **Applications**. Default download under `~/Downloads/buddy-release`; script clears quarantine on the file.

**Windows after the script:** Setup opens. Finish the installer (directory selectable). Default under `Downloads\buddy-release`.

Supported: macOS Apple Silicon + Intel; Windows **x64** first. No Linux install path.

For **Buddy Beta**, use `install-buddy-macos.sh` or `install-buddy-windows.ps1` from `prashantbhudwal/buddy-beta-releases`. It installs beside Stable as **Buddy Beta**.

### Updates (already installed)

In-app updates on the normal installed desktop app (not web-only).

1. **Settings → About → Updates**
2. **Update channel:** Stable app offers **Stable** (default) or **Preview**; **Buddy Beta** shows a fixed **Beta** row
3. **Check now** for a manual pass

**Stable** = approved releases. **Preview** = release candidates; switching to Preview saves and checks immediately.

When downloaded, the sidebar update button offers **Restart to install**. Confirm with **Restart now**. Download first; install restarts the app. No silent install without that action.

macOS also: menu **Buddy → Check for Updates...**. Windows: Settings only.

Background: first check shortly after startup, then roughly every **30 minutes**.

Status can show checking, downloading, available, downloaded, blocked, up to date, or installing; failures appear separately.

### Recovery

- Startup failure can offer an update check; may install a fix (including an older or newer build).
- **Blocked** update ≠ “up to date.”
- Mid-fail install → may still be on old build; use **Check now** again or re-run this app’s installer.
- Re-run this app’s install script anytime to re-download latest and open the installer.

### Guardrails

- Guide the user to site/script/Settings for app install — not something Buddy does from chat alone.
- Stable app offers **Stable** / **Preview**. **Buddy Beta** is a separate app with its own data and a fixed **Beta** row; it updates from its own releases. **Buddy Dev** is another separate build if present.
- Do not claim installation happens before the user chooses **Restart to install**.
- **Install CLI…** in macOS menu is disabled — not available.
- Prefer hibuddy.in script for Stable; Beta’s release installer for **Buddy Beta**.

### Gotchas

- **Updates unavailable in this build** → this install cannot use in-app updates; re-download this app’s installer (Fresh install above).
- Preview can be rougher than Stable.
- Site install script pulls **latest Stable**. Beta uses its own release installer; local macOS `./script/install-release.sh --channel beta` pulls latest Beta unless a tag is supplied.
- Gatekeeper/SmartScreen: script strips quarantine on download; OS security prompts may still appear.
- Skills drawer “install” (right rail) ≠ app install.

## Desktop process

Use when Buddy won’t start, needs restart, multi-window / second-launch behavior, `buddy://` / `buddy-beta://` protocols, or desktop logs.

Install/update: Install & updates above. First-run wizard: First run below. Privacy of local data: `trust.md`.

### What it is

Buddy desktop runs **on this machine** for one OS user. A local service must start before the main window stays up.

### Start

1. Launch Buddy (Dock / Start menu / app icon).
2. Buddy starts its local service (can take a short while).
3. Main window opens (sometimes a short **Starting Buddy…** loading window).

**Failure dialog:** **Buddy failed to start.** Detail is the error text, or that Buddy could not finish starting.

- Builds with updates: **Check for Update** vs **Quit**; can try a recovery update when start fails.
- No update path: error → quit. Manual download may point at the latest release page.

### Restart

| Action | Effect |
| --- | --- |
| **macOS** Buddy menu → **Restart** | Fully relaunch Buddy |
| **macOS** Buddy menu → **Reload** | Reload the window only; Buddy keeps running |
| Quit app, open again | Full cold start (both OS) |
| Update **Restart to install** | Installer/relaunch |

Windows has **no** Buddy application menu. Restart = quit/reopen or update install. Do not tell Windows users to use a menu Restart.

### Windows & single instance

- Normally **one instance per app**. Second launch focuses that app’s existing window (may pass deep-link args).
- **macOS** File → **New Window** can open another UI window; still one Buddy app running.
- Closing the last window: macOS may keep the app in the Dock; Windows usually quits.

### Deep links

- Stable registers **`buddy://`**; **Buddy Beta** registers **`buddy-beta://`**.
- Incoming links are forwarded into the desktop window.
- **Do not invent** arbitrary `buddy://…` / `buddy-beta://…` destinations. Notes can link to a saved chat message (`notes.md`); provider login finishes in the **system browser** and returns to Buddy (`providers.md`).

### Logs

No in-app log viewer. Logs are files on disk (Buddy folder under the OS log location; **Buddy Dev** uses its matching name).

- Packaged **Buddy Beta** logs: macOS `~/Library/Application Support/ai.buddy.desktop.beta/logs`; Windows `%APPDATA%\ai.buddy.desktop.beta\logs`.
- macOS update failures may also write an update installer log next to the main log.

### Defaults

- Buddy is local on this machine; not a remote multi-user server.
- Stable / Beta / Dev apps keep **separate** app data; Stable/Preview are rings within the Stable app. Stable and Beta intentionally share `~/.opencode`, `~/.claude`, and `~/.agents`.
- Updates only on normal installed desktop builds.

### Gotchas

- Corporate network tools that block local Buddy networking can fail startup.
- Prefer in-app controls over dubious macOS menu command labels; Reload, Restart, Quit, New Window are real.
- **Install CLI…** in macOS menu is disabled.
- Opening the desktop app does not require a Buddy account.

## First run / onboarding

Use when the user asks about first launch, setup wizard, onboarding, “what do I pick,” Documents home, or personalizing Buddy after install.

Desktop only. Web does not show this flow. Install/update: Install & updates above. App won’t start: Desktop process below.

### Defaults

- First desktop launch without completed setup or an open notebook → onboarding (focus, AI engine, notebook location).
- **Learn** selects the **Buddy** persona. **Teach** selects **Teaching Buddy**, shows teaching-oriented copy, reveals **Standards**, and starts Standards package setup on desktop.
- Default notebook home: Stable **Documents → Buddy** (`~/Documents/Buddy`); Beta **Documents → Buddy Beta** (`~/Documents/Buddy Beta`).
- First notebook after setup: **Inbox**.
- AI engines in wizard: **Connect ChatGPT** or **Free models** only.
- Personalization is available later in **Settings → Personalization**.
- ChatGPT sign-in is **provider** auth, not a Buddy account (`trust.md`, `providers.md`).

### Golden path

1. Launch Buddy desktop and choose **Let's begin**.
2. At **You're here to…**, choose **Learn** or **Teach**. Change this later under **Settings → General → Default way Buddy works**.
3. Choose **Connect ChatGPT** (finish sign-in in the system browser) or **Free models**.
4. At **Your work lives here**, choose **Use this** for the proposed Buddy Home or **Choose a different home**.
5. Buddy saves the home, opens **Inbox**, and sets a model for the chosen engine. Edit your profile later in **Settings → Personalization**.

### Gate (why am I here again?)

Onboarding shows on desktop when:

- setup is unfinished, or no notebook is open / active

Finishing setup alone is not enough — without a notebook, desktop returns to onboarding.

Skip onboarding when open notebooks already exist or recovery is needed.

### Failures

| Symptom | What to do |
| --- | --- |
| Proposed home inaccessible / setup fails | **Choose a different home**. macOS may need Privacy & Security access for Documents. |
| ChatGPT sign-in stuck / timeout | **Cancel sign-in**; retry ChatGPT or choose **Free models**. Finish auth in the system browser. |
| Free models unavailable | Retry later or use ChatGPT. |

### Guardrails

- Do not invent extra wizard steps or Buddy logins.
- Do not invent free model names; catalog varies.
- Prefer UI nouns: onboarding, Learn, Teach, Connect ChatGPT, Free models, Use this, Inbox.
- Provider detail after setup: `providers.md`. Notebooks / Home / Inbox: `notebooks.md`.
