---
name: instructions
description: "Buddy AGENTS.md, notebook instructions, personalization profile, preferred name."
---

# Instructions

Use when the user asks how to personalize Buddy, set AGENTS.md, edit notebook instructions, or change preferred name / occupation / about-you. Not Memory (`learner-memory.md`). Not skills install (`extend.md`).

Two separate authorities:

| What | Scope | Where in UI |
| --- | --- | --- |
| **Profile** (structured) | Global | Settings → **Personalization** → **Profile** |
| **Instructions** (freeform `AGENTS.md`) | Global **and/or** this notebook | Settings → **Personalization** → **Instructions**, or rail **Notebook Instructions** |

Profile is not written into `AGENTS.md`. Global and notebook `AGENTS.md` are different files.

## Profile

Fields: **Preferred name**, **Occupation**, **More about you**.

- Settings → **Personalization** → Profile (badge **Global**). Autosaves.
- First-run onboarding may offer the same three fields (skippable).
- One profile for the app — not per notebook.
- Empty fields: Buddy has no preferred-name / occupation / about-you text to use.

## Global instructions

Settings → **Personalization** → **Instructions** (badge **Global**).

- Freeform markdown `AGENTS.md` for Buddy as a whole (global).
- Empty: create via “Create instructions file.”
- Applies across notebooks (with notebook file if both exist).
- Concurrent disk edit can conflict: reload or overwrite.

## Notebook instructions

In a notebook, right rail → **Notebook Instructions** (below Files; not a list drawer).

1. Ensures notebook-root `AGENTS.md` exists (creates seed if missing).
2. Opens it on **Bench** as markdown.
3. Placeholder: rules for how Buddy responds **in this notebook**.

Also openable as workspace file `AGENTS.md` via Files if present.

## How Buddy uses them

- **Profile** → structured personalization when any field is set.
- **`AGENTS.md` (global and notebook)** → instruction text for the agent each turn.
- Prefer product file name **`AGENTS.md`**. Do not teach CLAUDE.md / CONTEXT.md as Buddy settings.
- Edits apply on **later turns** after save. Do not invent a full app restart requirement.

## Gotchas

- **Profile ≠ Instructions ≠ Memory.** Memory is another tab (`learner-memory.md`).
- **Notebook Instructions ≠ Sources drawer.** Rail opens a Bench file, not a catalog.
- **One global profile** — notebook-only name/occupation not in UI.
- **Two AGENTS files** — global vs notebook root.
- **Save conflict** on global editor if the file changed on disk.
- Do not claim profile is silently copied into `AGENTS.md` or Memory.
