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

Prefer the site script or the download buttons on hibuddy.in.

| OS | Command |
| --- | --- |
| macOS | `curl -fsSL https://hibuddy.in/install \| bash` |
| Windows | `irm -UseBasicParsing https://hibuddy.in/install \| iex` |

Same from **hibuddy.in** → **Download for Mac** / **Download for Windows**.

**macOS after the script:** DMG/ZIP opens. Drag **Buddy** into **Applications**. Default download under `~/Downloads/buddy-release`; script clears quarantine on the file.

**Windows after the script:** Setup opens. Finish the installer (directory selectable). Default under `Downloads\buddy-release`.

Supported: macOS Apple Silicon + Intel; Windows **x64** first. No Linux install path.

### Updates (already installed)

In-app updates on the normal installed desktop app (not web-only).

1. **Settings → Updates**
2. **Update channel:** **Stable** (default) or **Preview**
3. **Check for updates** for a manual pass

**Stable** = approved releases. **Preview** = release candidates; switching to Preview saves and checks immediately.

When ready: toast **Install & restart** or **Later**. Download first; install restarts the app. No silent install without that action.

macOS also: menu **Buddy → Check for Updates...**. Windows: Settings only.

Background: recheck roughly every **10 minutes** while Buddy is visible, and on focus.

Status row: idle / checking / downloading / ready / installing / error.

### Recovery

- Startup failure can offer an update check; may install a fix (including an older or newer build).
- **Blocked** update ≠ “up to date.”
- Mid-fail install → may still be on old build; **Check for updates** again or re-run the site install command.
- Re-run install script anytime to re-download latest and open the installer.

### Guardrails

- Guide the user to site/script/Settings for app install — not something Buddy does from chat alone.
- Channel UI is **Stable** / **Preview**, not “Beta.” **Buddy Beta** / **Buddy Dev** are separate app builds if present.
- Do not claim auto-update without **Install & restart**.
- **Install CLI…** in macOS menu is disabled — not available.
- Prefer hibuddy.in script.

### Gotchas

- **Updates unavailable in this build** → this install cannot use in-app updates; re-download from hibuddy.in.
- Preview can be rougher than Stable.
- Fresh install script pulls **latest stable**, not Preview.
- Gatekeeper/SmartScreen: script strips quarantine on download; OS security prompts may still appear.
- Skills drawer “install” (right rail) ≠ app install.

## Desktop process

Use when Buddy won’t start, needs restart, multi-window / second-launch behavior, `buddy://` protocol, or desktop logs.

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
| Update **Install & restart** | Installer/relaunch |

Windows has **no** Buddy application menu. Restart = quit/reopen or update install. Do not tell Windows users to use a menu Restart.

### Windows & single instance

- Normally **one instance**. Second launch focuses the existing window (may pass `buddy://` args).
- **macOS** File → **New Window** can open another UI window; still one Buddy app running.
- Closing the last window: macOS may keep the app in the Dock; Windows usually quits.

### Deep links

- Scheme **`buddy://`** is registered.
- Incoming links are forwarded into the desktop window.
- **Do not invent** navigable `buddy://…` destinations — product UI does not document them. Provider login finishes in the browser and returns to Buddy — `providers.md`.

### Logs

No in-app log viewer. Logs are files on disk (Buddy folder under the OS log location; **Buddy Beta** / **Buddy Dev** use matching names).

- macOS update failures may also write an update installer log next to the main log.

### Defaults

- Buddy is local on this machine; not a remote multi-user server.
- Prod / beta / dev app builds keep **separate** app data; settings do not merge across channels.
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

- First desktop launch with no notebooks open → onboarding (**2 steps**).
- Default notebook home: **Documents → Buddy** (`~/Documents/Buddy` shape).
- First notebook after Next: **Inbox**.
- AI engines in wizard: **ChatGPT** or **Free Models** only.
- Personalization is optional (**Skip for now**).
- ChatGPT sign-in is **provider** auth, not a Buddy account (`trust.md`, `providers.md`).

### Golden path

1. Launch Buddy desktop with no prior notebooks.
2. **Select AI Engine**
   - **ChatGPT** — browser sign-in; models depend on ChatGPT plan. Complete auth in browser; Cancel aborts.
   - **Free Models** — start without ChatGPT; free models only (no OAuth in this step).
3. Storage shows **Documents**. Tap **Next** (disabled until an engine is chosen).
4. Buddy saves notebook home, opens **Inbox**, sets a model for that engine.
5. **Make buddy your own** (step 2 / 2) — optional:
   - Preferred name
   - Occupation
   - More about you
   - **Next** saves; **Skip for now** continues without.
6. Land in Inbox chat. Edit profile later: **Settings → Personalization** (`instructions.md`, `settings.md`).

### Gate (why am I here again?)

Onboarding shows on desktop when:

- personalization was started and not finished/skipped, **or**
- no open notebooks / no active notebook

Finishing setup alone is not enough — without a notebook, desktop returns to onboarding.

Skip onboarding when open notebooks already exist (or recovery is needed) — unless personalization is still pending.

### Failures

| Symptom | What to do |
| --- | --- |
| Documents access denied / Next fails | **Choose another folder**. macOS may need Privacy & Security access for Documents. |
| ChatGPT modal stuck / timeout | Cancel; retry ChatGPT or switch to Free Models. Browser must finish auth. |
| Free Models fails | No free model available for that notebook — retry later or use ChatGPT. |
| “Pick an AI provider first” | Choose ChatGPT or Free Models before Next. |
| Relaunch still on personalization | Finish or Skip; incomplete step 2 keeps onboarding. |

### Guardrails

- Do not invent extra wizard steps or Buddy logins.
- Do not invent free model names; catalog varies.
- Prefer UI nouns: onboarding, AI Engine, Documents, Inbox, Preferred name.
- Provider detail after setup: `providers.md`. Notebooks / Home / Inbox: `notebooks.md`.

