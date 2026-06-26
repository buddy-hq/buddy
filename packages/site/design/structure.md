# Buddy Site — Structure & Direction

> Planning document for the Buddy landing page (`packages/site`).
> Updated: 2026-06-24.

---

## Product context

Buddy is a private, local-first AI learning companion. Desktop app (macOS + Windows).
Free, BYOK, no account. Data stays on your machine.

Four pillars:
1. A real agent (subagents, MCPs, skills, custom tools, 50+ providers)
2. A pedagogical engine (standards-aligned, Bloom's, Socratic, active recall, spaced repetition)
3. Local-first & private (data on machine, free, no account)
4. A multi-surface workspace (reader, whiteboard, Python sandbox, flashcards, MCQ, notes, resource export)

Logo palette (from `buddy.svg`): magenta→purple→violet (`#FF1E8F → #B721FF → #6000FF`) on deep purple-black (`#190B2B → #08020E`).

Audience: "Learners" is the umbrella term (anyone learning anything — exam prep, curiosity, self-study, career pivot). We never use the word "students." Educators is a second audience.

Visual: dark, confirmed. Current shade feels dull; logo-orange as primary is questionable.

Mockups: CSS/HTML is the intentional direction, not a placeholder for screenshots.

---

## Landing page structure

**Page goal:** Install the app. Conversion = download.
Everything on the page must build enough desire + trust to overcome the friction of downloading and installing a desktop app.

### Page flow (top to bottom)

```
0. Nav              — logo + wordmark, audience toggle, install button
1. Hero             — headline + subtext + workspace mock
2. Feature Steps    — learning journey (what you DO)
3. Bring your own   — BYOK, providers, ChatGPT login (how you POWER it)     [probationary]
4. Made to extend   — skills, subagents, MCP, tools (what it CAN DO)         [probationary]
5. Philosophy       — local-first, no account, no tracking (WHY)             [probationary]
6. Install          — command bar, OS toggle, steps
7. Final CTA        — sentiment + install button                              [probationary]
8. Footer
```

The logic: **what it is → what you do → how to power it → what it can do → why it's safe → how to install → emotional close.**

Sections 3, 4, 5, and 7 are probationary. We build them, see how they feel, then cut or merge.

---

### 0. Nav

- `logo` — Buddy icon
- `wordmark` — "Buddy" text
- `audience-toggle` — Learners / Educators segmented control, in the nav bar between wordmark and install. Swaps entire page content (hero, features, examples). Replaces nav links.
- `install-button` — scrolls to install section, always accessible

---

Minimal nav. Three elements: logo + wordmark (left), audience toggle (center), install button (right). No anchor links — sections are discovered by scrolling, like Dia. The audience toggle replaces links entirely. On mobile, toggle + install appear in the drawer.

**Audience toggle behavior:** Same slots, swap content only. The section structure (order, types) stays identical for both audiences. Only copy and visuals change per slot. Implementation: content lives in a config file (`content.ts`) with both audiences side by side — prevents drift, makes both versions visible at once. Components render both versions server-side. The toggle JS swaps a class that triggers CSS transitions (opacity + blur).

**Status:** Built.

---

### 1. Hero

- **Product mock as the hero visual.** CSS/HTML workspace mock (not a screenshot). Research validates this — 4 of 5 analyzed pages put a product visual in the hero (Linear, Cursor, Raycast, Dia). 2 of 5 make it interactive/clickable (Linear, Cursor).
- Headline (2 lines, paired with subtext — synthesis §1.3a)
- Subtext (1-2 sentences, always paired with headline)
- CTA: No install button in the hero. Hero stays clean — the mock + headline sell. Install method is a terminal script (curl/PowerShell), so the hero CTA bridges to a dedicated section with the command, copy button, and explanation. Honest about the method.
- Mock: interactive CSS/HTML workspace showing Buddy in action (reader + chat + a surface or two)
- **Install button placement:** Nav only (always accessible). Final CTA section at the bottom of the page also has the install button. Hero has no install button — follows Linear's pattern of letting the visual sell.

**Status:** Built.

---

### 2. Feature Steps

- Numbered learning journey steps (01, 02, 03...) following Linear's editorial numbering pattern.
- Each step = number + tag + headline + subtext + CSS mock.
- Learners: INGEST → INTERACT → RETAIN
- Educators: PLAN → CREATE → ASSESS
- Same slots, swap content per audience.
- **Status:** Built (`FeatureSteps.astro`). Audience-aware via `.swap` utilities.

---

### 3. Bring your own `[probationary]`

Answers "how do I get AI into this?" — practical onboarding. Same for both audiences — BYOK is audience-agnostic.

- `headline` — section title
- `subtext` — one-line explanation
- `provider-list` — named providers (Anthropic, OpenAI, Google, Mistral, Groq, Ollama, and 50+ more). List by name, not abstract count (synthesis §6.15).
- `auth-methods` — how to authenticate (API keys or OAuth)
- `chatgpt-login` — callout: use existing ChatGPT Plus/Pro subscription, log in with OpenAI
- `local-models` — callout: run fully local with Ollama, no API key required

**Research basis:** synthesis §6.8 (OpenCode "What is X?"), §6.15 (Pi — list providers by name). This section type is unique to free/BYOK products — SaaS pages don't need it because the billing flow handles onboarding.

**Why it's separate from capabilities:** BYOK is "how do I power this?" — a prerequisite. Capabilities are "what can this do?" — a possibility. Different questions.

**Why it's separate from constitution:** "No account" is philosophy. "Here's how to get AI in without an account" is practical. The philosophy creates the need; this section answers the practical question.

---

### 4. Made to extend `[probationary]`

Technical capabilities surfaced as verb-first labels. Same for both audiences — capabilities are audience-agnostic.

- `headline` — section title
- `subtext` — one-line explanation
- `capabilities` — 3-4 items, each with:
  - `verb` — Delegate / Extend / Automate (verb-first labels, synthesis §6.11)
  - `description` — 1-2 sentence explanation
- Capabilities to cover: subagents (Delegate), skills + MCP (Extend), background tasks / scheduling (Automate)

**Research basis:** synthesis §6.11 (Hermes verb-first features — subagents as "Delegate", sandboxing as "Experiment"). Pi treats extensions/skills as user-facing features, not hidden technical capabilities.

**Why it's separate from Feature Steps:** Feature Steps are the learning workflow — things the user directly does (import, chat, study). Capabilities are things that power features or extend them — the user might never directly spawn a subagent, but knowing they can builds trust in the platform.

**Why it's separate from BYOK:** BYOK is about input (getting AI in). Capabilities are about output (what the system can do with that AI). Different questions.

---

### 5. Philosophy `[probationary]`

Why Buddy exists this way. Trust through values, not social proof. Same for both audiences.

- `headline` — section title
- `principles` — 4-5 items, each with:
  - `label` — No cloud / No account / No tracking / No lock-in
  - `description` — one-line explanation
- `closing-statement` — one sentence that ties it together

**Framing options:**
- Negative-space (Pi pattern, synthesis §6.14): "What Buddy doesn't do" — No cloud, No account, No tracking, No lock-in.
- Positive (Dia pattern, synthesis §6.2): "Yours, entirely" — Your data stays on your machine. No account, no cloud, no tracking.

**Research basis:** synthesis §6.14 (Pi "What we didn't build"), §6.2 (Dia privacy-as-control), §6.3 (Raycast philosophy interlude), §3.3 (Dia's end of social-proof spectrum — trust through local-first, not names and logos).

**Why it's separate from BYOK:** "No account" is the philosophy. "Bring your own keys" is the practical consequence. The constitution is WHY; BYOK is HOW.

---

### 6. Install

- `headline` — section title
- `os-toggle` — macOS/Linux | Windows
- `command` — terminal command (curl for macOS/Linux, PowerShell for Windows)
- `copy-button` — inline copy
- `steps` — 3 short steps (copy, paste, run)
- **Status:** Built (`InstallSection.astro`).

**Open question:** Should we also offer direct .dmg/.exe download? Hermes, OpenClaw, and Warp all offer both terminal + desktop download. Non-technical users (especially educators) may not be comfortable with terminal install. For now: terminal only. Revisit if we have signed desktop builds.

---

### 7. Final CTA `[probationary]`

Emotional close. Sentiment that bookends the hero. Install button.

- `headline` — sentiment that echoes the hero (per audience)
- `install-button` — scrolls to install section, or command is inline here

**Research basis:** synthesis §2.1 — 5/5 SaaS pages + Warp have a closing CTA that echoes the hero. Linear: "Built for the future. Available today." Cursor: "Try Cursor now." Raycast: "Take the short way." Dia: "Ready for a better day?"

**Why it's separate from Install:** Install is practical (command, steps, OS toggle). Final CTA is emotional (sentiment, one button). Install answers "how do I install?" Final CTA answers "why should I bother?"

**Alternative: merge Final CTA + Install.** The Install section's title becomes the sentiment, and the command bar follows. One section, two functions. This follows the pattern from Linear/Cursor/Raycast where the final CTA IS the download section.

---

## Invariants

- **No FAQ section.** No SaaS page (Linear, Cursor, Raycast, Dia, Codex) or non-SaaS page (Hermes, OpenClaw, Pi, Warp) has FAQ on the landing page. Only OpenCode does. FAQ goes on a separate /help or /faq route, linked from footer. (synthesis §6.18)
- **No pricing section.** Buddy is free. (synthesis §2.2 — 4/5 SaaS pages push pricing to a separate route; Buddy has none.)
- **Copy philosophy — consumer-first, not coder-first.** Buddy's audience are consumers (learners and educators), not coders. They are early adopters in their domain — they know what ChatGPT is, they may have a Plus subscription, they understand "AI" at a practical level — but they are not on the cutting edge of AI tooling. They don't know what "BYOK" means. They don't think in terms of "API keys" or "OAuth." Copy must not burden them with technical framing, but must not dumb it down either — they are smart, just not technical. Information hierarchy should prioritize what they already have (logins, subscriptions) over what they'd need to learn (API keys, local models). Lead with the familiar, follow with the technical.

---

## Open decisions

- **Sections 3+4 merge?** "Bring your own" and "Made to extend" could be one section with two halves (power it / extend it). Or stay separate for clarity.
- **Sections 5+7 merge?** Constitution could be the Final CTA — the negative-space statement IS the emotional close. Or they stay separate (constitution = trust, final CTA = action).
- **Section 7 merge with 6?** Final CTA + Install = one section. The sentiment headline leads into the command bar.
- **Section order:** Does Constitution come before or after Bring your own / Made to extend? Current proposal: BYOK → Capabilities → Constitution. Alternative: Constitution → BYOK → Capabilities (philosophy first, then practical consequences).
- **Desktop download:** Offer .dmg/.exe alongside terminal install? Depends on whether we have signed builds.