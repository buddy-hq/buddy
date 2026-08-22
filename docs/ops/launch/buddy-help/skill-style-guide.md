# The Elements of Skill Style

A Strunk & White for Agent Skills — distilled from [steipete/agent-scripts](https://github.com/steipete/agent-scripts).

## 1. Purpose

**This guide is:** observation → rules for authors of `SKILL.md` and skill `references/`. It codifies how a large, battle-tested skill corpus is written so agents route correctly and execute safely with minimal tokens.

**This guide is not:** a rewrite of any skill; a product manual for tools named inside skills; a platform-spec for OpenClaw/Codex skill loading.

**Prime rule.** Prefer the short word to the long, the concrete command to the abstract claim, the routing noun to the marketing sentence.

**If you only read one part:** §5–§5d (voice, phrasing, descriptions, sentence craft). Structure later; sound first.

---

## 2. Anatomy of a skill

```text
skills/<name>/
  SKILL.md                 # required: frontmatter + operational body
  agents/openai.yaml       # optional: display_name, short_description, default_prompt
  references/**/*.md       # optional: progressive disclosure (long docs, dated caches)
  scripts/*                # optional: helpers the skill tells the agent to run
  config/*                 # optional: aliases, non-secret defaults
  LICENSE.txt              # optional (e.g. third-party skill)
  mcporter-config.md       # optional satellite note (config repair, not the skill body)
```

| Layer | Load cost | Put here |
| --- | --- | --- |
| Frontmatter `description` | Always in skill list | Routing bait only |
| `SKILL.md` body | When skill is selected | Workflow, defaults, guardrails, copy-paste commands |
| `references/` | When body points at it | Long guides, WWDC notes, CLI rubrics, evidence caches |
| `scripts/` | When invoked | Repeatable multi-step ops (auth, release, status) |
| `agents/openai.yaml` | UI/catalog | Human labels + default invocation phrase |

**Canonical repo rules** (agent-scripts `README.md` / `AGENTS.MD`):

- Skills are the main routing layer.
- Keep descriptions short and generic; optimize for routing, not documentation.
- Keep skill bodies terse and operational.
- Prefer helpers under `skills/<name>/scripts/` for repeatable commands.
- Quote `description` in front matter.
- Validate: every `skills/*/SKILL.md` needs YAML front matter with non-empty `name` and `description`.

---

## 3. Naming

### Folder and `name`

- **Kebab-case.** Folder name equals frontmatter `name` (almost always).
- **Product + job** when both matter: `github-deep-review`, `swiftui-view-refactor`, `release-mac-app`, `github-cache-hygiene`.
- **Tool noun alone** when the skill *is* the CLI/product surface: `npm`, `wrangler`, `xurl`, `peekaboo`, `obsidian`, `oracle`.
- **Role / procedure** for workflows: `codex-first`, `ssh-doctor`, `skill-cleaner`, `maintainer-orchestrator`.
- **Router skills** name the domain, not every backend: `whatsapp` (routes to `wacrawl` / `wacli`), `discord-clawd` (relay, not archive).

### Description nouns

Preserve **trigger nouns**: product, tool, action, object. Skill-cleaner’s own policy: *“Preserve trigger nouns in descriptions: product, tool, action, object.”*

| Pattern | Examples |
| --- | --- |
| `Product: actions…` | `SSH triage: Remote Login, launchd sshd…` |
| `Tool CLI: verbs…` | `Twilio SMS CLI: buy/list/keep numbers…` |
| `Domain: objects…` | `GitHub issue/PR triage: queues, CI, blockers…` |
| `Product ops: surfaces…` | `ClickClack ops: chat app, Cloudflare Workers deploy…` |

Avoid personal names, long absolute paths, and workflow narration in `description` unless required for routing (`AGENTS.MD`).

---

## 4. Frontmatter

### Required

```yaml
---
name: skill-name
description: "Short generic trigger phrase."
---
```

- `name`: non-empty string; unique across the skill root.
- `description`: non-empty string; **always quoted**.
- Front matter must start on line 1 and close with `---`.

### Optional (observed)

```yaml
metadata:
  short-description: Human one-liner
# or JSON-ish openclaw/clawdbot metadata:
metadata: {"clawdbot":{"emoji":"📦","requires":{"bins":["npm"]}}}
license: Complete terms in LICENSE.txt
```

`agents/openai.yaml` (when present) is separate from SKILL frontmatter:

```yaml
interface:
  display_name: "Title Case Name"
  short_description: "One short human line."
  default_prompt: "Use $skill-name to …"
```

### How to write `description`

**Shape (dominant corpus template):**

```text
"<Primary product or domain>: <comma- or slash-separated trigger nouns>."
```

**Length:** one line. ~8–20 words. Routing bait, not a summary paragraph.

**Grammar:** telegraph style is intentional — drop articles, use noun stacks, prefer `/` and `,` over full sentences.

Full phrasing rules, more real quotes, and rewrite drills: **§5c Description style**.

**Good (real corpus):**

| Skill | description |
| --- | --- |
| `reminders` | `"Apple Reminders via rem CLI: add, list, search, update, complete, delete."` |
| `wrangler` | `"Wrangler CLI: Workers, KV, tail, deploy, account routing."` |
| `browser-use` | `"Existing Chrome automation: Chrome plugin first, mcporter fallback."` |
| `github-deep-review` | `"GitHub deep review: bugs, PRs, best fix, stale-or-real, read code first."` |
| `one-password` | `"1Password/op: service-account first, targeted secret read/store/inject, tmux."` |
| `discord-clawd` | `"Discord-backed OpenClaw agent/session relay; not archive search."` |

**Bad (invented anti-patterns; do not ship):**

```yaml
# Essay / marketing
description: "A comprehensive, delightful toolkit that helps you manage secrets securely with 1Password in modern agent workflows."

# Vague (no triggers)
description: "Helps with development tasks."

# Narration + personal paths
description: "When Peter needs to fix SSH on steipete-mbp after the launchd issue we saw last week in ~/Projects/..."
```

**Disambiguation is allowed** when two skills collide: e.g. `discord-clawd` ends with `; not archive search` so it does not steal `discrawl` traffic.

---

## 5. Voice & diction

This section is the meat of the guide. Structure (recipes, anatomy) gets you a skeleton; **voice** is how sentences sound when an agent is burning tokens.

Global agent voice (from agent-scripts `AGENTS.MD`):

> Work style: telegraph; noun-phrases ok; drop grammar; min tokens.

Same file, on skill edits:

> Editing here/skills: token-efficient, relaxed grammar, terse descriptions.

README reinforces the product rule:

> Keep skill bodies terse and operational.

Apply that pressure inside every skill body. The unit of style is the **directive line**, not the paragraph.

### 5.1 The house register

Skills write in **telegraph English**:

| Trait | What it means | Real corpus |
| --- | --- | --- |
| **Imperative first** | Lead with the verb the agent must obey | `Prefer service-account tokens before any interactive 1Password flow.` (`one-password`) |
| **Articles optional** | Drop *a/the* when the line stays clear | `Use JSON for anything scripted or verified:` (`reminders`) |
| **Noun stacks** | Comma-joined objects, not relative clauses | `queues, CI, blockers, risk, proof, next actions` (`github-project-triage` description) |
| **Concrete over abstract** | Named binary, flag, path, field | `Do not invent flags from memory.` (`wrangler`) |
| **Default → exception** | State the default, then the rarer case | `Default to local for direct telephone-game work… Use ssh when the target agent/session lives on another machine.` (`openclaw-relay`) |
| **Stop conditions explicit** | “Stop and ask” is a first-class verb phrase | `Stop and ask if the item is missing…` (`npm`) |

| Prefer | Avoid |
| --- | --- |
| Imperative: *Use when…*, *Prefer…*, *Never…* | Soft essay: *It is often helpful to consider…* |
| Noun stacks: *queues, CI, blockers, risk* | Filler: *various aspects of the process* |
| Exact binaries/flags | “the appropriate flags” |
| Numbered workflows | Narrative anecdotes |
| Default → exception | Exception-first walls of text |
| *Prefer X over Y* | *You might want to think about whether X could be better* |
| *Never print secrets* | *Please be careful with sensitive information* |
| *Always read back after writes* | *It’s a good idea to double-check* |

### 5.2 Sentence length

**Default skill line: 8–22 words.** Long enough to name the object and the constraint; short enough to scan in a bullet list.

| Density | Length target | Where |
| --- | --- | --- |
| **Telegraph** | ~8–16 words / line | CLI skills, Defaults, Guardrails, Gotchas |
| **Contract** | 15–35 words; full grammar OK | Review contracts, policy bullets that encode judgment |
| **Forbidden** | Multi-clause essay paragraphs without a lead verb | Anywhere in `SKILL.md` (move to `references/`) |

**Thin CLI** (`wrangler`) — almost every body line is one rule:

> Do not invent flags from memory. Wrangler 4 removed/changed some old flags; confirm with `--help`.

**Judgment / review** (`github-deep-review`) — full sentences, but still imperative and evidence-bound:

> Prefer current source and executable proof over issue comments. Treat stale comments, old CI, and old release behavior as hints until rechecked.

> Avoid vague "consider" comments.

**Control-plane** (`maintainer-orchestrator`) — longest sentences in the corpus; still lead with obligation, never with throat-clearing:

> Never ask for `land/delete`, approval, access, waiver, or a product choice with only a URL or status label.

**Rule of thumb:** if a line needs a second period, split into two bullets unless you are writing a named contract (Review Contract, Owner Decision Brief, Output Template).

### 5.3 Rhythm

Corpus rhythm is **staccato**: short imperative, then optional “why” or “how,” then stop.

```text
[Verb] [object] [constraint]. [Optional: fix / proof / fallback.]
```

Examples:

> Always read back after writes; do not trust exit status alone. (`reminders`)

> Never print secrets. Query exact secret names only; do not dump env. (`wrangler`)

> Draft by default. Do not post to X/Twitter unless the user explicitly asks. (`release-tweets`)

> Fail closed on unresolved secrets… (`agent-transcript`)

Avoid rising soft cadence (*you should consider… it may be beneficial… ideally one would…*). Prefer falling cadence: **order → constraint → stop**.

### 5.4 When full sentences are OK

Full grammar is not banned. It is **earned**:

| Use full sentences when… | Example |
| --- | --- |
| Encoding a judgment contract the agent must *answer* | `github-deep-review` Review Contract bullets |
| Explaining a branching stop condition | browser-use attach-alert rules |
| Spec / design deliverables | `create-cli` clarify + deliverables lists |
| Policy that would be ambiguous as telegraph | maintainer worker-boundary rules |

| Stay telegraph when… | Example |
| --- | --- |
| Defaults, flags, install, common commands | `wrangler`, `reminders`, `peekaboo` |
| Guardrails that are binary | Never / Do not / Prefer |
| Gotchas | Symptom + fix |
| Description frontmatter | Always |

**Contrast pair (same topic, two densities):**

- Thin: `Prefer --dry-run before bulk updates/deletes.` (`things-todo`)
- Dense: `If reproduction is not feasible, say exactly what blocks it and what evidence would make the decision reliable.` (`github-deep-review`)

Both are correct. Density tracks **how much judgment the skill owns**.

**H1 titles:** Title Case, short, usually match the skill’s display name (`# SSH Doctor`, `# Browser Use`, `# npm`). Subheads: `## Workflow`, `## Guardrails`, `## Gotchas`, `## Commands`.

---

## 5b. Phrasing patterns

Copy these shapes. Do not invent softer synonyms.

### Openings (first lines after H1)

Dominant openers in the corpus:

| Pattern | Real quotes |
| --- | --- |
| **Use when / Use this for / Use for** | `Use when SSH connects then closes before auth…` (`ssh-doctor`); `Use this for browser tasks against the existing Chrome session.` (`browser-use`); `Use for Cloudflare Wrangler CLI work: deploys, tails…` (`wrangler`) |
| **Use this as the first stop…** | `Use this as the first stop for WhatsApp work. Keep the source boundary sharp:` (`whatsapp`) |
| **Scope in one breath** | `Claude Code sessions only. Codex/other harnesses: skip; never self-delegate.` (`codex-first`) |
| **Contract, not mission statement** | `Best-effort local-only provenance for OpenClaw PR/issue bodies.` (`agent-transcript`) |
| **Design goal in one line** | `Design CLI surface area (syntax + behavior), human-first, script-friendly.` (`create-cli`) |

**Often pair opener with a negative boundary in the next line:**

> For Discord archive/history/search, use `$discrawl` instead. (`discord-clawd`)

> This skill is about release copy, not cutting the release. (`release-tweets`)

**Weak → corpus rewrite:**

```markdown
# Bad
This skill helps you work with SSH when things might be broken and you're not sure why.

# Good (ssh-doctor shape)
Use when SSH connects then closes before auth, Remote Login seems advertised but unusable,
or local/remote Mac SSH needs diagnosis.
```

```markdown
# Bad
You can use this whenever you need to automate Chrome for various browsing tasks.

# Good (browser-use shape)
Use this for browser tasks against the existing Chrome session.
```

### Prohibitions

Ranked by force (use the strongest word that is true):

| Force | Phrasing | Real quotes |
| --- | --- | --- |
| **Hard ban** | `Never …` | `Never print secrets.` (`wrangler`); `Never send or mutate WhatsApp state unless explicitly requested.` (`whatsapp`); `Never paste secrets into logs, chat, or code.` (`one-password`) |
| **Hard ban (action)** | `Do not …` | `Do not invent flags from memory.` (`wrangler`); `Do not approve, comment, close, merge, push, or land unless the user asked for that action.` (`github-deep-review`) |
| **Preference** | `Prefer X over Y` / `Prefer X` | `Prefer rem over Things/AppleScript when the user wants an AI-friendly personal todo backend on macOS.` (`reminders`); `Prefer current source and executable proof over issue comments.` (`github-deep-review`) |
| **Default** | `Default to …` / `Default: …` | `Default to local for direct telephone-game work…` (`openclaw-relay`); `Default: add directly, then verify by search/show.` (`reminders`) |
| **Gate** | `Stop and ask if …` / `stop and ask` | `Stop and ask if the item is missing…` (`npm`); `If the button is not visible or the prompt is ambiguous, stop and ask` (`browser-use`) |
| **Fail mode** | `Fail closed on …` | `Fail closed on unresolved secrets, private keys, browser/session/cookie details, or auth URLs.` (`agent-transcript`) |
| **Only-when** | `only when …` / `unless the user explicitly …` | `Force-send media when the user explicitly wants a channel post` (`openclaw-relay`); `Do not post to X/Twitter unless the user explicitly asks.` (`release-tweets`) |

**Never write prohibitions as suggestions:**

```markdown
# Bad
You should try to avoid printing secrets if possible.
It is recommended not to invent CLI flags.
Consider asking the user before sending messages.

# Good
Never print secrets.
Do not invent flags from memory.
Never send or mutate WhatsApp state unless explicitly requested.
```

**Stack related bans in parallel structure** (same verb form, same line shape):

```markdown
# xurl Safety (corpus)
- Never read, print, summarize, upload, or paste `~/.xurl` into LLM context.
- Never ask the user to paste client secrets… into chat.
- Never use `--verbose` in agent runs; it can expose auth headers.
```

### Defaults and “assume this unless told”

Corpus default lines name the **value**, not the philosophy:

```markdown
## Defaults
- transport: `local`
- ssh host: `steipete@steipete-macstudio.local`
- control session name: `codex-bridge`
```

(`openclaw-relay`)

Inline default:

> Default account for personal/work secrets is `my.1password.com`.
> Do not silently use `my.1password.eu` / Titan unless explicitly asked.
> (`one-password`)

> Prefer repo wrapper: `npm exec --yes --package wrangler -- wrangler ...` unless repo has its own script.
> (`wrangler`)

### Gotchas / pitfalls

**Shape:** bold symptom or short claim → consequence or fix. Observed failures only.

```markdown
## Gotchas
- macOS only.
- First run may fail with `reminders access denied` until the calling app has
  Reminders permission.
- `rem` search is plain query search, not shell regex.
```

(`reminders`)

```markdown
## Pitfalls
- Do not invent flags from memory. Wrangler 4 removed/changed some old flags; confirm with `--help`.
- `wrangler kv key list` has no `--limit`; use `--prefix` and filter locally.
- `wrangler tail --sampling-rate` must be `>0` and `<1`; use `0.999` for near-full sampling, not `1`.
```

(`wrangler`)

```markdown
## Known Pitfalls
- macOS clipboard APIs may fail from `prlctl exec`; …
- If keystrokes produce garbage, send Return to clear the line, create a shorter launcher, then retry.
```

(`vm-lab`)

**Weak → corpus rewrite:**

```markdown
# Bad
Sometimes things can go wrong with permissions on macOS so you may need to
check System Settings if the tool doesn't work on the first try.

# Good
First run may fail with `reminders access denied` until the calling app has
Reminders permission.
```

### Preferences and tradeoffs

`Prefer` is the corpus word for soft constraints. Not “consider,” not “ideally.”

> Prefer service-account tokens before any interactive 1Password flow. User dialogs are fallback only. (`one-password`)

> Prefer `--dry-run` before bulk updates/deletes. (`things-todo`)

> Prefer small, explicit helpers over large conditional blocks. (`swiftui-view-refactor`)

> Strongly prefer the existing Chrome profile for any website that needs login. (`browser-use`)

When the tradeoff needs a reason, put reason after the rule, not before:

```markdown
# Bad
Because captchas are annoying and SSO is hard, you should use the real profile.

# Good
Most login-heavy sites fail in isolated profiles because fresh sessions trigger
captcha, device checks, or missing SSO/extension state. Strongly prefer the
existing Chrome profile for any website that needs login.
```

### Verify / proof language

Corpus loves **read-back**, **shape-only**, and **proof** nouns:

> Always read back after writes; do not trust exit status alone. (`reminders`)

> For token checks, return shape only: present/absent, length, status code, account/org name. (`browser-use`)

> Print presence/shape only, never token or secret values. (`one-password`)

> Codex claims are advisory (`codex-first`)

> If browser automation is unavailable, report that as a verification gap instead of substituting isolated browser tooling. (`browser-use`)

### Output / report language

Name fields, do not describe the vibe of a good report:

```text
Report:
- root cause
- exact commands changed
- validation output, redacted as needed
- whether remote should retry
```

(`ssh-doctor`)

```text
Ref: #123 / PR #456
Bug: …
Cause: …
Proof: …
Risk: …
```

(`github-deep-review`)

> Return the actual assistant text or delivery result, not shell noise. (`openclaw-relay`)

> Finish with terse counts: brew: upgraded / already current … (`mac-maintenance`)

### Scope boundaries (what this skill is *not*)

Negative scope is high-value routing after selection:

> Do not add calendar events here; use calendar tooling instead. (`reminders`)

> Do not use this for local Discord archive queries. (`discord-clawd`)

> If the request is “design parameters”, do not drift into implementation. (`create-cli`)

> Keep service-specific auth details in the owning skill. … This skill owns only the generic 1Password rules… (`one-password`)

### Mutation / consent phrasing

Billable, public, or destructive actions use the same spine: **explicit user intent**.

> Registration is billable/non-refundable. Ask Peter for explicit confirmation before `POST /registrar/registrations`. (`cloudflare-registrar`)

> Sending, reactions, presence…: use `wacli` only after explicit user intent. (`whatsapp`)

> Draft by default. Do not post to X/Twitter unless the user explicitly asks. (`release-tweets`)

> Always ask the user before adding transcript logs to a GitHub PR/issue body. (`agent-transcript`)

### Bold lead-ins and colon lists

Two common body micro-forms:

1. **Bold lead-in + gloss** (rare in house skills; more in design outliers):

   `**CRITICAL**: Choose a clear conceptual direction…` (`frontend-design` — third-party register; do not default to this)

2. **Label: value** (house default for report fields and defaults):

   `- transport: local`
   `- Bug: <one or two sentences>`

Prefer **label: value** and plain bullets over essay headings inside lists.

### Bullet density

| Skill type | Bullet style |
| --- | --- |
| CLI / ops | High density; almost every line a command or constraint |
| Review / triage | Medium density; full-sentence bullets that must be *answered* |
| Expert / design | Mix: numbered guidelines + short code samples + `see references/` |

Do not pad. If a bullet is only tone (“be careful,” “think hard”), delete it or replace with a testable rule.

---

## 5c. Description style

Frontmatter `description` is **routing bait**, not documentation. Agent-scripts rules:

> Keep descriptions short and generic; optimize for routing, not documentation.

> Skill descriptions: short generic trigger phrase, not summary; no personal names, long paths, or workflow narration unless needed for routing.

### Telegraph grammar

- **One line.** ~8–20 words.
- **Drop articles** (`a`, `the`) freely.
- **Colon after the primary product/domain.**
- **Comma- or slash-separated trigger nouns** after the colon.
- **Verbs as bare stems** when listing actions: `add, list, search, update`, not `adding and listing`.
- **Optional disambiguator** after `;` when two skills collide.

**Shape:**

```text
"<Primary product or domain>: <comma- or slash-separated trigger nouns>."
```

### Real corpus descriptions

| Skill | description |
| --- | --- |
| `reminders` | `"Apple Reminders via rem CLI: add, list, search, update, complete, delete."` |
| `wrangler` | `"Wrangler CLI: Workers, KV, tail, deploy, account routing."` |
| `browser-use` | `"Existing Chrome automation: Chrome plugin first, mcporter fallback."` |
| `github-deep-review` | `"GitHub deep review: bugs, PRs, best fix, stale-or-real, read code first."` |
| `one-password` | `"1Password/op: service-account first, targeted secret read/store/inject, tmux."` |
| `discord-clawd` | `"Discord-backed OpenClaw agent/session relay; not archive search."` |
| `whatsapp` | `"WhatsApp router: history/search/read/send; wacrawl read, wacli live."` |
| `codex-first` | `"Route implementation work to Codex CLI; Claude specs, reviews, verifies."` |
| `agent-transcript` | `"GitHub PR/issue agent transcripts: redact, preview, and insert safely."` |
| `cloudflare-registrar` | `"Cloudflare Registrar: domain availability, prices, registration via mcporter."` |
| `skill-cleaner` | `"Codex/OpenClaw skill audit: live budget, usage, duplicates, compact descriptions."` |

### Description rewrite drill

```yaml
# Bad — essay / marketing
description: "A comprehensive, delightful toolkit that helps you manage secrets securely with 1Password in modern agent workflows."

# Good
description: "1Password/op: service-account first, targeted secret read/store/inject, tmux."
```

```yaml
# Bad — vague
description: "Helps with development tasks."

# Good
description: "SSH triage: Remote Login, launchd sshd, pre-auth closes, stale sessions."
```

```yaml
# Bad — narration + personal paths
description: "When Peter needs to fix SSH on steipete-mbp after the launchd issue we saw last week in ~/Projects/..."

# Good
description: "SSH triage: Remote Login, launchd sshd, pre-auth closes, stale sessions."
```

```yaml
# Bad — summary paragraph
description: "This skill walks you through reviewing GitHub issues and pull requests carefully by reading the code and deciding whether bugs are real."

# Good
description: "GitHub deep review: bugs, PRs, best fix, stale-or-real, read code first."
```

**Preserve trigger nouns** (skill-cleaner policy): product, tool, action, object. If a word would make a user type `$skill`, keep it.

---

## 5d. Body sentence craft

How to write the *words* inside `##` sections after the opener.

### Lead with the obligation

Put the verb first. Reasons follow, or live in a separate short line.

```markdown
# Bad
Because Wrangler changes often and agents hallucinate APIs, flag invention is problematic.

# Good
Do not invent flags from memory. Wrangler 4 removed/changed some old flags; confirm with `--help`.
```

```markdown
# Bad
It is important that registration is confirmed since it costs money and cannot be refunded.

# Good
Registration is billable/non-refundable. Ask Peter for explicit confirmation before
`POST /registrar/registrations`.
```

### Drop needless grammar (without becoming cryptic)

Allowed drops: articles, “that/which” fillers, “in order to,” “please,” “make sure to.”

Keep: proper nouns, exact flags, ids, confidence labels, URLs when they are the contract.

```markdown
# Soft
You should make sure to always verify the secret field shape before using it.

# Corpus
verify the field shape before using it live: length, expected prefix, newline count, never value.
```

(`one-password`)

### Parallel lists

When listing allowed vs forbidden, mirror syntax:

```markdown
# codex-first (corpus shape)
Delegate to Codex …:
- implementation from a frozen spec; refactors; mechanical migrations
- bug fixes with known repro; test writing; coverage fills

Keep in Claude:
- design, API design, architecture, naming, UX judgment
- tiny edits (~<20 lines, single obvious change) — delegation overhead loses
```

### “Always / Never / Prefer / Stop” as section glue

A good Rules/Guardrails block is almost entirely those four stems:

```markdown
## Rules
- Do not print secrets, tokens, full env, or broad secret grep output.
- Validate locally first: loopback failure means server-side…; loopback success plus remote failure means network…
- Prefer non-interactive SSH:
```

(`ssh-doctor`)

```markdown
## Guardrails
- Always run `domain-check` immediately before registration.
- Registration is billable/non-refundable. Ask Peter for explicit confirmation before …
- Do not print tokens.
```

(`cloudflare-registrar`)

### Weak essay → corpus-style (full micro-skills)

**1. CLI ops**

```markdown
# Bad body
## Overview
Wrangler is Cloudflare's powerful CLI that enables developers to manage Workers
and related resources. You should familiarize yourself with the documentation and
consider running whoami so you know which account you are on. Be careful with
secrets. Flags sometimes change between versions so try to look things up.

# Good body (wrangler shape)
Use for Cloudflare Wrangler CLI work: deploys, tails, KV/R2/D1/Queues/Workers, secrets,
bindings, and account routing.

## Defaults
- Retrieval first for flags/config: `wrangler --help`, subcommand `--help`, …
- `wrangler whoami` before account-sensitive work.

## Pitfalls
- Do not invent flags from memory. … confirm with `--help`.
- Never print secrets. Query exact secret names only; do not dump env.
```

**2. Safety-critical tool**

```markdown
# Bad
## Notes
When using 1Password, it's generally best practice to avoid exposing credentials
in chat. You may want to use tmux. Service accounts can be nice when available.

# Good (one-password shape)
- Prefer service-account tokens before any interactive 1Password flow. User dialogs are fallback only.
- Print presence/shape only, never token or secret values.
- Do not run `op` outside tmux; stop and ask if tmux is unavailable.
- Never paste secrets into logs, chat, or code.
```

**3. Judgment skill**

```markdown
# Bad
## How to review
Try to understand the PR. Look at the code if you can. Think about whether the
fix is good. Mention any risks you notice. You can approve if it looks fine.

# Good (github-deep-review shape)
## Review Contract
Always answer these, explicitly:
- What is the bug or behavior being fixed?
- Can we identify the root cause? If yes, where in code and why. If no, what evidence is missing.
- Is the current/proposed fix the best possible fix after reading adjacent code?

Lead with findings when reviewing a PR. Findings need file/line/symbol references
and a concrete failure mode. Avoid vague "consider" comments.

Do not approve, comment, close, merge, push, or land unless the user asked for that action.
```

### Density ladder (same skill idea, three wrong lengths)

**Too thin** (missing the stop condition):

```markdown
Use for domain registration.
```

**Corpus-right** (`cloudflare-registrar`):

```markdown
Use for Cloudflare Registrar domain availability, pricing, listing, and registration.

## Guardrails
- Always run `domain-check` immediately before registration.
- Registration is billable/non-refundable. Ask Peter for explicit confirmation before …
- Do not print tokens.
```

**Too thick** (essay):

```markdown
Domain registration is a sensitive area because money is involved and Cloudflare
charges are typically final. In this skill we will explore how an agent might
thoughtfully approach the problem of checking whether a domain is free and then,
after a conversation with the user, potentially registering it…
```

### Third-party / design outlier note

Some imported skills (`frontend-design`, parts of `swiftui-view-refactor`) use fuller marketing-adjacent prose (“BOLD aesthetic,” “UNFORGETTABLE”). That is an **outlier register**. When authoring Buddy skills, prefer the **telegraph majority** (`wrangler`, `reminders`, `browser-use`, `ssh-doctor`), and only climb toward review-contract density when the skill’s job is judgment.

---

## 6. Body structure

There is no single required outline. Strong skills pick from a small set of **recipes**.

### Recipe A — CLI surface (thin skill)

`markdown-converter`, `openai-image-gen`, `reminders`, `things-todo`, `xurl`

1. One-line purpose  
2. Install / binary resolution  
3. Common commands (fenced)  
4. Flags table or “Useful flags”  
5. Gotchas  

### Recipe B — Ops / doctor

`ssh-doctor`, `browser-use`, `vm-lab`, `npm`, `one-password`

1. Use when  
2. Rules / Safety / Guardrails  
3. Baseline / Quick Start commands  
4. Branching diagnosis sections  
5. Failure handling + closeout report shape  

### Recipe C — Judgment / review

`github-deep-review`, `github-project-triage`, `github-author-context`, `release-tweets`

1. Review contract (questions that must be answered)  
2. Source order / tools (`gh`, not web)  
3. Output template (fenced `text` block)  
4. What not to do (approve/merge only if asked)  

### Recipe D — Expert / design

`swiftui-view-refactor`, `swift-concurrency-expert`, `create-cli`, `swiftui-liquid-glass`

1. Overview (1–2 lines)  
2. Decision tree or ordered guidelines  
3. Snippets with good/bad code  
4. Pointer: `see references/…`  

### Recipe E — Control-plane / orchestration

`maintainer-orchestrator`, `codex-first`, `openclaw-relay`

1. Hard boundaries (what this skill owns vs not)  
2. Defaults + mode selection  
3. Contracts for workers / prompts / outputs  
4. Monitoring / failure / reporting  

### Section names that work

| Section | Job |
| --- | --- |
| **Use when / Scope** | Routing confirmation after selection |
| **Rules / Guardrails / Safety** | Non-negotiables first |
| **Defaults** | Named defaults the agent should assume |
| **Workflow / Quick Start / Golden path** | Ordered steps |
| **Commands / Common Commands** | Copy-paste, real flags |
| **Gotchas / Pitfalls** | Observed failure modes only |
| **Output / Report / Closeout** | Exact fields to return |
| **References** | Paths under `references/` or upstream URLs |

**Heading style:** `## Title Case` or `## sentence case` both appear; pick one per skill and stay consistent. Prefer short headings over nested `####`.

---

## 7. Progressive disclosure

**SKILL.md stays lean.** Push bulk elsewhere.

| Content | Where |
| --- | --- |
| Trigger nouns, defaults, safety, 5–15 key commands | `SKILL.md` |
| Full CLI guideline docs, WWDC notes, long design essays | `references/*.md` |
| Dated evidence tables | `references/` (e.g. non-majority repo ledger) |
| Multi-step auth/release/status | `scripts/` + thin wrappers in body |
| Config repair that is rare | Sibling md (e.g. `mcporter-config.md`) |
| Human catalog strings | `agents/openai.yaml` |

**Pointers, not embeds.** Pattern from expert skills:

```markdown
For MV-first guidance and rationale, see `references/mv-patterns.md`.
```

```markdown
- See `references/swift-6-2-concurrency.md` for Swift 6.2 changes…
```

**Router skills** stay short and send the agent to peer skills/tools (`whatsapp` → `wacrawl` / `wacli`; `discord-clawd` → relay script; archive → other skill).

**Exception observed:** a few skills are long by nature (`maintainer-orchestrator`, large review/triage skills). Length is justified when every paragraph is a **policy or contract**, not background prose. If you need a novel, split into `references/`.

---

## 8. Operational density

### Commands

- Show the **exact** invocation the agent should run.
- Prefer fenced `bash` blocks over prose paraphrases.
- Resolve binary paths once (`PB=…`, `command -v`, skill-relative `scripts/…`).
- Document **verified** flags only.

### “Never invent flags”

Corpus rule, explicit in `wrangler` and implied everywhere tools change:

> Do not invent flags from memory. … confirm with `--help`.

Same idea: `Retrieval first for flags/config: wrangler --help`, subcommand help, local schema, then docs.

### Defaults

Name them in a **Defaults** list when non-obvious:

```markdown
## Defaults
- transport: `local`
- ssh host: `…`
- control session name: `codex-bridge`
```

### Pitfalls / Gotchas

Only include failures you have **seen**. Format:

```markdown
## Gotchas
- **Wrong app profiled**: LaunchServices resolves installed app…
  - Fix: use direct binary path or `--attach` with known PID.
```

### Safety density (secrets, writes, public posts)

Recurring hard rules across skills:

- Never print secrets, tokens, full env, or broad secret dumps.
- Prefer shape-only reporting: present/absent, length, prefix class.
- Mutations (send, buy, register, post, release) require **explicit** user intent.
- Read back after writes; do not trust exit status alone (`reminders`, `things-todo`).
- Prefer dry-run / doctor / status before destructive paths.
- Fail closed on secrets in public bodies (`agent-transcript`).

### Output contracts

When the user will get a structured answer, **specify the shape**:

```text
Ref: #123 / PR #456
Bug: …
Cause: …
Proof: …
Risk: …
```

or section lists (`Workers`, `Recently merged`, …) as in `clawsweeper-status`.

---

## 9. Anti-patterns

| Anti-pattern | Why it fails | Do instead |
| --- | --- | --- |
| **Long essay in SKILL.md** | Burns prompt budget; hides the workflow | Telegraph body; move essays to `references/` |
| **Marketing copy in `description`** | Weak routing; wastes list tokens | Colon + trigger nouns |
| **Nested docs site** | Agent never finds the command | One golden path + links |
| **Vague description** | Wrong skill selected or none | Product + actions + objects |
| **Invented CLI surface** | Silent wrong behavior | `--help`, then document |
| **Secrets in skill text** | Leak + staleness | Point at 1Password / env; print shape only |
| **Personal narration in description** | Fails generic routing | Keep personal topology in body if needed (`remote-mac`) |
| **Duplicate skills with near-identical bodies** | Budget waste | skill-cleaner policy: dedupe; keep policy-bearing copy |
| **Placeholder public sections** | Noise / false provenance | Fail closed; omit section if empty (`agent-transcript`) |
| **Implementation drift when asked for a spec** | Wrong deliverable | `create-cli`: design parameters ≠ write the CLI |

**Corpus contrast (good vs stretched):**

- **Good density:** `cloudflare-registrar` (~60 lines): defaults, guardrails, three commands.  
- **Good density:** `mac-maintenance` (~40 lines): four steps + report counts.  
- **Stretched but justified:** `github-project-triage` — long because it is a full maintainer contract with output templates.  
- **Outlier prose:** some third-party-attributed design skills use fuller sentences; when authoring new Buddy skills, prefer the telegraph majority, not the outlier.

---

## 10. Checklist (before shipping a skill)

- [ ] Folder name is kebab-case and matches `name`.
- [ ] Frontmatter has quoted `description` and non-empty `name`.
- [ ] `description` is one line of **routing bait** (product + job + trigger nouns).
- [ ] Body opens with **Use when** / scope boundary (what this skill is *not*).
- [ ] Defaults are explicit.
- [ ] Commands are copy-pasteable; flags verified via help or tests.
- [ ] Guardrails cover secrets, mutations, and public disclosure where relevant.
- [ ] Gotchas are observed, not theoretical.
- [ ] Long material lives in `references/`; body links to it.
- [ ] Repeatable multi-step work is a `scripts/` helper, not a 40-line shell novel in the skill.
- [ ] Output/report shape defined if the skill produces a review/status/decision.
- [ ] No marketing prose; telegraph voice throughout (§5–§5d).
- [ ] Prohibitions use Never / Do not / Prefer / Stop and ask — not “you should consider.”
- [ ] Sentences default ~8–22 words; full grammar only for contracts/judgment.
- [ ] Gotchas are symptom → fix, observed only; no theoretical essays.
- [ ] Optional `agents/openai.yaml` display strings do not contradict SKILL routing.
- [ ] Validator (or equivalent) passes: YAML front matter + required fields.
- [ ] Skill does not duplicate another skill’s body; router skills point to peers.

---

## 11. Appendix

### Exemplar skills

| Skill | Why exemplar |
| --- | --- |
| **`reminders`** / **`things-todo`** | Canonical CLI recipe: tool, start, mutate, conventions, gotchas; “verify after write.” |
| **`wrangler`** | Tiny ops skill: defaults, **never invent flags**, pitfalls, five commands. |
| **`browser-use`** | Route decision, hard exclusions, attach recovery, typical flow, secret handling. |
| **`one-password`** | Progressive disclosure (`references/`), hard safety, scripted tmux patterns without dumping secrets. |
| **`github-deep-review`** | Judgment skill: explicit review contract + fenced output template. |
| **`create-cli`** | Spec skill: clarify → deliverables → defaults → templates; points to `references/cli-guidelines.md`. |
| **`openclaw-relay`** | Defaults, mode selection, session rules, failure handling, output relay. |
| **`cloudflare-registrar`** | Minimal billable-op skill: guardrails before POST, exact `mcporter` calls. |

### Bad shape (inferred — do not invent content)

Without naming real skills as “bad,” these shapes would fail the corpus norms:

1. **Description paragraph** that restates the H1 in full sentences.  
2. **SKILL.md that embeds an entire upstream manual** instead of 10 commands + `references/`.  
3. **No Use-when boundary** so the skill steals traffic from a peer (archive vs live, review vs triage).  
4. **Commands without defaults** so every run invents host, account, or template.  
5. **Happy-path only** — no secrets rule, no failure handling, no “stop and ask.”

### Corpus coverage

**Method:** Read agent-scripts root `README.md`, `AGENTS.MD`, `skills.sh.json`, `scripts/validate-skills`; then every resolvable `skills/*/SKILL.md` body (or full file), plus sampled `agents/openai.yaml`, `references/**/*.md`, and one satellite note (`browser-use/mcporter-config.md`). Broken symlinks to external skill repos (e.g. `autoreview`, `discrawl`, `gog`, `wacli`, `wacrawl`) were noted but not counted as reads when `SKILL.md` was missing on disk.

**SKILL.md files actually read (50):**

`agent-transcript`, `beeper`, `browser-use`, `clawsweeper-status`, `clickclack`, `cloudflare-registrar`, `codex-debugging`, `codex-first`, `create-cli`, `discord-clawd`, `domain-dns-ops`, `frontend-design`, `github-author-context`, `github-cache-hygiene`, `github-deep-review`, `github-project-triage`, `hopper-debugger`, `instruments-profiling`, `mac-maintenance`, `maintainer-orchestrator`, `markdown-converter`, `nano-banana-pro`, `native-app-performance`, `notcrawl`, `npm`, `obsidian`, `one-password`, `openai-image-gen`, `openclaw-relay`, `oracle`, `peekaboo`, `release-mac-app`, `release-tweets`, `reminders`, `remote-mac`, `skill-cleaner`, `sonos`, `speaking`, `ssh-doctor`, `swift-concurrency-expert`, `swiftui-liquid-glass`, `swiftui-performance-audit`, `swiftui-view-refactor`, `things-todo`, `twilio-sms`, `video-transcript-downloader`, `vm-lab`, `whatsapp`, `wrangler`, `xurl`

**Supporting files sampled:** `README.md`, `AGENTS.MD`, `skills.sh.json`, `scripts/validate-skills`, several `agents/openai.yaml`, `references/` for `one-password`, `create-cli`, `maintainer-orchestrator`, `domain-dns-ops`, `swiftui-view-refactor`, `swiftui-liquid-glass`, `swift-concurrency-expert`, plus `browser-use/mcporter-config.md`.

**Total files read:** well under the 100-file cap (~70).

### Recurring phrase bank (copy when it fits)

Drawn from real skill bodies; full voice rules in §5–§5d.

**Open / scope**
- `Use this for …` / `Use when …` / `Use for …`
- `Use this as the first stop for …`
- `…; not archive search` / `This skill is about X, not Y`
- `Keep the source boundary sharp:`

**Force ranking**
- `Never …` (hard ban)
- `Do not …` (hard ban, action-focused)
- `Prefer X over Y` / `Strongly prefer …`
- `Default to …` / `Default: …`
- `Stop and ask if …` / `stop and ask`
- `Fail closed on …`
- `only after explicit user intent` / `unless the user explicitly asks`

**Ops / verify**
- `Never print secrets` / `Query exact secret names only`
- `return shape only: present/absent, length…`
- `Always read back after writes; do not trust exit status alone`
- `Do not invent flags from memory` / `confirm with --help`
- `Retrieval first for flags/config`
- `Codex claims are advisory`

**Report**
- `Report: root cause / exact commands changed / validation / next step`
- `Return the actual assistant text …, not shell noise`
- `Finish with terse counts:`
- `See \`references/…\``

**Review / judgment**
- `Always answer these, explicitly:`
- `Avoid vague "consider" comments`
- `Lead with findings`
- `say "not proven" when the trail is weak`
- `Do not approve, comment, close, merge… unless the user asked`

### Structural template (starter)

```markdown
---
name: my-skill
description: "Product: action, object, constraint, related tool."
---

# My Skill

Use when <trigger>. Not for <peer skill domain>.

## Rules

- Never …
- Prefer …
- Stop and ask if …

## Defaults

- …

## Workflow

1. …
2. …

## Commands

```bash
# verified invocations only
```

## Gotchas

- **Symptom**: fix.

## Output

- …
```

---

*Omitting needless words is not optional. Skills pay rent in the context window.*
