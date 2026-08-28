---
name: trust
description: "Buddy privacy, local data, site honesty, permission prompts Allow once/always/reject."
---

# Trust

Use when the user asks about accounts, privacy, local data, tracking, marketing claims, or permission prompts (Allow once / always / Reject).

Not provider connect flows (`providers.md`). Not memory remember/forget (`learner-memory.md`).

## Privacy & local data

Use when the user asks about Buddy accounts, privacy, local data, tracking, or whether marketing claims are true.

Not provider connect flows (`providers.md`). Not memory remember/forget (`learner-memory.md`).

### Defaults

- **No Buddy account.** Open the app and work. No Buddy sign-up, password, or multi-user profiles.
- **Single machine, single OS user.** State lives in that user’s home/profile — not a Buddy cloud of chats.
- **Local-first ≠ offline-only.** Notes, notebooks, and session state stay on disk. Network still used for AI providers, web search/fetch, optional MCP, and app updates.
- **No Buddy login ≠ no AI login.** ChatGPT OAuth, API keys, and some MCP servers still need credentials. Those are **provider** accounts, not Buddy accounts.

### What stays on this computer

Rough map (prod desktop; exact Windows folders may differ):

| What | Where |
| --- | --- |
| Notebooks / Buddy Home | Documents → Buddy (or the Home folder they chose) |
| App settings, memory, and local app data | On this computer under the user profile (not a Buddy cloud) |

Prefer “on this computer in your user profile / Documents / Buddy” over inventing exact folder paths.

### What leaves the machine

- **Chat content and tool context go to the AI provider you connected.** Buddy does not host that as a Buddy cloud product.
- **Web fetch / web search** (and similar) call the open internet when used.
- **MCP remotes** you configure talk to those servers.
- **App updates** (installed desktop app) check/download release feeds.
- **Marketing site** (`hibuddy.in`) can send install analytics. That is the website, not the desktop app tracking your study work.

Do not claim “nothing ever leaves your computer” or “Buddy never uses the network.”

### Site claims → product truth

If marketing or the landing page conflicts with the app, prefer this file.

| Claim | Prefer |
| --- | --- |
| “No account / no logins” | No **Buddy** account. Provider login/keys may still be required. |
| “No cloud” | No Buddy-hosted chat cloud; files and notebooks local. Providers still receive chat when you use them. |
| “No tracking” | Buddy is not a study-analytics cloud. Do not invent in-app tracking claims either way. Site install host can capture download events. |
| “Only model calls need internet” | Incomplete. Web search/fetch, MCP, and updates also need network when used. |
| “Asks before anything / approve every file and action” | **Overclaim.** Many actions never show a prompt. The permission dock appears only when Buddy needs consent. See Permissions below. |
| “Allow always” forever | **Until Buddy restarts** — UI says so. Not permanent. |
| Open source | **No.** Free and local-first; do not call Buddy open source. |

### Permissions (honesty only)

- Sensitive work can prompt: **Allow once** / **Allow always** / **Reject**.
- **Allow always** = remember until Buddy is restarted.
- Notebook work under Buddy Home often needs fewer prompts; outside that tree can require external-folder access.
- Guide the **user** to the dock above chat.

### Memory honesty

Memory is **not** on by default for remembering everything. The experiment and notebook switches control it; treat it as opt-in until the user enables it. Details → `learner-memory.md`.

## Permissions

Use when the user asks about permission prompts, Allow once / Allow always, Reject, or why Buddy is waiting on a permission.

Permission dock (above chat) ≠ question UI (structured agent questions). Not the chat composer.

### What it is

When an action needs consent, the run **blocks** and a **permission dock** appears above chat input for the active chat.

Buttons (left → right):

| Button | Meaning |
| --- | --- |
| **Reject** | Don't allow. Fails this ask; other pending permission asks in the **same chat** are rejected too. |
| **Allow always** | Allow this scope and remember it **until Buddy restarts** — not forever. |
| **Allow once** | Only this time. Not saved. |

Headline examples: Access external folder, Read/Edit file, Run command, or generic “Permission needed.” May show path, folder, or command detail. Multiple waits: one card + “+N more pending…”.

### Defaults

- Most actions **do not** prompt. The dock only appears when Buddy asks for consent.
- Never claim the user must approve every action.
- **Allow always** lasts until Buddy restarts — not permanent.
- Inside the notebook folder, routine reads/edits often run without a dock.
- Outside the notebook folder usually needs **Access external folder**.
- Sensitive files (e.g. `.env`) may still ask even inside the project.
- Some capabilities stay blocked by access rules **without** a dock until the user enables them (packages, memory, etc.).

### Notifications

**Settings → Notifications → Permission notifications**: system notify when Buddy waits on a permission or a question. Title: “Permission required.”

### Gotchas

- **Allow always ≠ permanent.** Tooltip: “Remember until Buddy is restarted.”
- **Reject** also clears other open permission prompts in that chat — not only the visible card.
- Skills drawer Active On/Off is **durable skill config** — not the same as dock **Allow always**. See `extend.md`.
- Denied actions show as quiet permission denial in the transcript, not a generic crash.
