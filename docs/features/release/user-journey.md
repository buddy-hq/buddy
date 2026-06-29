# User Journey — Critical Path

**Platform:** macOS desktop (first release).  
**Rule:** One path, top to bottom. Any step fails → release blocked.

Test checklist: `pre-release-checklist.md` (same steps — pass/fail criteria, prompts, and sign-off).

---

## Feature inventory

Everything Buddy ships, grouped by how the user reaches it. Agent-only rows are not directly clickable; they run inside chat.

### App shell

| Area | What the user can do | Where |
| --- | --- | --- |
| Install & launch | Download from GitHub, open app, backend starts | Desktop |
| Auto-update | Update toast on new version; manual check in Settings → General | Desktop |
| Onboarding | ChatGPT Plus OAuth or free models; default Buddy Home notebook; optional personalization | `/onboarding` |
| Entry hub | Quick chat, new notebook, open existing, recovery | `/chat` |
| Notebook | Create, open, close, reorder; learner memory defaults on create | Left sidebar |
| Sessions | New thread, select, rename, archive, pin, unread | Left sidebar |
| Settings | General, Providers, MCPs, Personalization, Learner memory, Advanced, Attribution, Standards* | `/settings` |

\*Standards tab appears only after the standards package is installed (Settings → Advanced → Packages).

### Chat & agent

| Feature | User-visible outcome | Trigger |
| --- | --- | --- |
| **teaching-guidance** | Socratic dialogue, explain, worked examples, practice, assess, resolve confusion | Chat |
| **reading** | Resource prep, full-text ingest | Import + chat |
| **memory** | Learner memory across sessions | Chat (agent) |
| **analogies** | Concept analogies | Chat (agent) |
| **stepwise-solving** | Step-by-step problem solving | Chat (agent) |
| **debug-guidance** | Debug wrong attempts | Chat (agent) |
| **math** | Math teaching skill | Chat (agent) |
| **calculator** | Python calculator | Chat (agent) |
| **practice** | Deliberate practice tasks | Chat (agent) |
| **assessment** | Inline mastery checks | Chat (agent) |
| **curriculum** | Routes goals / practice / assessment | Chat (agent) |
| **curriculum-planning** | Learning goals (CWSEI-style) | Chat (agent) |
| **lesson-workspace** | Structured lessons, checkpoints | Chat (agent) → editor surface |

### Library & bench

| Surface | Formats / objects | Open from |
| --- | --- | --- |
| **Resources** | PDF, EPUB (drag-drop or picker) | Library → Resources |
| **Reader** | PDF, EPUB in bench | Resource open |
| **Flashcards** | SM-2 decks (basic + cloze) | Library or agent |
| **Question sets** | MCQ practice | Library or agent |
| **Whiteboard** | AI-drawn canvas | Agent or bench |
| **Diagrams** | Mermaid | Library or agent |
| **Widgets** | HTML widgets | Library or agent |
| **Media** | Images, audio, video presentations | Library or agent |
| **Figures** | Geometric / freeform figures | Agent |
| **Files** | Workspace markdown, code, other files | File explorer / bench |
| **bench** | Layout: docked or floating chat over any surface | Auto or user |

### Skills & extensions

| Area | What the user can do | Where |
| --- | --- | --- |
| Skill library | Browse curated catalog, install approved skills | Sidebar → **Skills** → Library |
| Installed skills | Allow/deny, inspect, remove library installs | Skills → Installed |
| Custom skills | Create, edit, delete user-authored skills | Skills |
| MCP servers | Add, connect, manage MCP integrations | Settings → MCPs |
| AGENTS.md | Per-notebook custom instructions | Personalization tab + notebook |

### Optional packages (GitHub download)

| Package | Install / remove | Where |
| --- | --- | --- |
| **Standards** | Knowledge-graph DB + standards query tools | Settings → Advanced → Packages |
| **Advanced math** | Python math/graph runtime | Settings → Advanced → Packages |

Both download assets from GitHub releases. Windows: advanced math shows “Coming soon” (macOS only for v1).

---

## Critical path

One golden run proves the product. Derived from the inventory above — only what blocks release.

```
Install → Onboard → Chat → Import → Read → Learn → Skills → Packages → Relaunch → Settings → Update
```

| # | Step | User action | Passes when |
| --- | --- | --- | --- |
| 1 | **Install** | Download GitHub release, open app | App launches; no crash |
| 2 | **Onboard** | Free models *or* ChatGPT Plus; skip or finish personalization | Notebook chat opens (`/$directory/chat`) |
| 3 | **Chat** | Send one message | Streaming reply completes |
| 4 | **Import** | Add one PDF or EPUB (library or drag-drop) | Resource shows **ready** |
| 5 | **Read** | Open resource in reader bench | Pages render and scroll |
| 6 | **Read + chat** | Ask one question with reader open | Reply arrives; reader still usable |
| 7 | **Flashcards** | Ask Buddy for a small flashcard deck from the material | Deck in library; open in bench; rate one card |
| 8 | **Skill** | Sidebar → **Skills** → Library → install **xlsx-author** → remove it | Installed state toggles; no error toast |
| 9 | **Standards** | Settings → Advanced → Packages → turn **Standards** on → off (confirm remove) | Reaches ready while on; **Standards** settings tab appears; removes cleanly |
| 10 | **Advanced math** | Same Packages section → turn **Advanced math** on → off (confirm remove) | Reaches ready while on; removes cleanly |
| 11 | **Relaunch** | Quit fully, reopen | Notebook, sessions, library, installed packages state as expected |
| 12 | **Settings** | Providers + Personalization tabs | Provider connected; profile fields load and save |
| 13 | **Update** | *(When a newer build is staged)* accept update toast or General → Check for updates | Restarts on new version |

**Before ship:** run steps 1–12 twice — **Run A** with free models, **Run B** with ChatGPT Plus OAuth (fresh state for step 2). **Run C** is step 13 when an update is staged.

---

## Test coverage vs manual QA

Buddy has **no Playwright/E2E suite** for the desktop critical path. Release QA is manual end-to-end. Automated tests cover **pieces** of most steps (backend routes, prompt pipeline, UI units) but **zero steps** are fully substituted by automation today.

| # | Step | Automated (what exists) | Still manual for release |
| --- | --- | --- | --- |
| 1 | Install | `smoke-backend-utility` at package time; updater version parsing | Download GitHub artifact, first launch, splash/backend UX |
| 2 | Onboard | `onboarding-flow.test.ts`, `onboarding-setup.test.tsx`, provider bootstrap routes | Full UI flow; ChatGPT OAuth browser callback (Run B) |
| 3 | Chat | SSE/sync/reducer/streaming render tests; message route reads transcript | Live provider send → stream → complete |
| 4 | Import | `resource-routes.test.ts` (PDF add → ready), pack chunking | Library UI, drag-drop, desktop file picker |
| 5 | Read | Reader navigation helpers; bench routing tests | Foliate renders real PDF/EPUB in Electron bench |
| 6 | Read + chat | `active-reading-context.test.ts` (reading payload → prompt) | Prompt from reading bench with live LLM |
| 7 | Flashcards | `flashcard-tools-routes.test.ts`, `bench-surface-render` (review UI) | Agent creates deck via chat → library → bench flow |
| 8 | Skill | Skills routes (custom CRUD, permissions); `github-fetcher.test.ts` | **No test for `POST /skills/library/:id/install` or library delete**; Skills page UI; real GitHub fetch |
| 9 | Standards | `local-runtimes-routes.test.ts` install/remove with mock assets | Settings toggle UI; **real GitHub download** in packaged app; Standards tab appears |
| 10 | Advanced math | Same local-runtimes tests; math control component (Windows gate) | Settings toggle UI; **real GitHub download + runtime build** on macOS |
| 11 | Relaunch | `open-project-routes.test.ts` (notebook registry persistence) | Electron quit/reopen; session + library UI restore |
| 12 | Settings | `project-config-readers.test.ts`, `settings-providers.test.ts`, provider routes | Settings navigation; connected state; personalization autosave in UI |
| 13 | Update | `custom-mac-updater.test.ts`, `update-common.test.ts` | Update toast, download, install, restart on real build |

### Summary

| | Count |
| --- | --- |
| Critical path steps | **13** |
| Fully automated (replaces manual checklist step) | **0** |
| Backend integration tests cover core API (mocked downloads) | **5** — steps 4, 7, 9, 10, 11 |
| Partial unit/component tests only | **8** — steps 1–3, 5, 6, 8, 12, 13 |
| Manual required for release checklist as written | **13** (Run B re-manuals 2–12 with OAuth) |

**Largest gaps:** no E2E desktop tests; skill library install/remove untested at route level; chat step needs live provider; packages (9–10) use mocks in CI but release must hit real GitHub assets.

---

## What each step proves

| Steps | Covers |
| --- | --- |
| 1–2 | Desktop shell, backend, onboarding, provider auth, Buddy Home |
| 3 | Agent loop, streaming, session |
| 4–6 | Reading feature, resource pipeline, bench reader, reading context in prompts |
| 7 | Flashcards feature, agent artifacts, library, bench, SM-2 UI |
| 8 | Skill library install/remove, managed skill storage, runtime refresh |
| 9 | Standards optional package (GitHub download), tool gating, settings tab unlock |
| 10 | Advanced math optional package (GitHub download) — required for mac v1 per release plan |
| 11–12 | Local-first persistence, settings, personalization |
| 13 | electron-updater / custom mac updater |

---

## Not on the critical path

Track separately; do not block release unless promoted.

| Feature / area | Why deferred |
| --- | --- |
| Question sets, whiteboard, diagrams, widgets, media | Same artifact class as flashcards; spot-check if time |
| Second notebook, `/chat` recovery, lesson workspace, curriculum | Power-user / edge flows |
| MCP server setup | Optional integration |
| Standards tool calls in chat | Covered by package install + tab; agent invocation is flaky to QA |
| Windows desktop, web-only mode | Out of mac v1 scope |
| Large PDF perf, long transcript perf, a11y audit | Quality bar, not functional gate |

Known issues: `docs/features/bench-mode/known-issues.md`, `docs/features/skills/known-issues.md`, `docs/features/standards/known-issues.md`, `docs/features/advanced-math/known-issues.md`.
