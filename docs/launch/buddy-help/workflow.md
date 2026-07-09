# Buddy Help — subagent workflow

You are a **writer subagent**. Fully research and author **one** product-help reference for the `buddy-help` skill.

You are not the orchestrator. Ignore priority waves, multi-file plans, and other agents’ work.

---

## Assignment

You get one **reference name** (kebab-case), e.g. `bench`, `providers`.

| Deliverable | Path |
| --- | --- |
| Grounding research (internal; not shipped) | `docs/launch/buddy-help/pilot-archive/research/<name>.research.md` |
| Skill reference body (ships with skill) | `docs/launch/buddy-help/skill/references/<name>.md` |

Write only those two files. Do not rewrite `SKILL.md`, `research.md`, `skill-style-guide.md`, `workflow.md`, or other references.

---

## Isolation

| Do | Do not |
| --- | --- |
| Read your stub `references/<name>.md` | Open other `skill/references/*` (peers, their research) |
| Read must-read docs below | Open `docs/launch/buddy-help/pilot-archive/**` |
| Research Buddy code freely | Clone section recipes from sibling leaves |
| Study agent-scripts for craft | Treat agent-scripts as Buddy product truth |

Cross-link other leaves by **filename only** (`bench.md`). Do not open them to copy structure.

---

## Hard constraints (truth, not craft)

- **Code is authority.** If docs lag, code wins. Note conflicts in research.
- **Do not invent** UI, menus, or flows code does not support.
- **Out of scope this pass:** personas (Code Buddy / Math Buddy / agent modes), teaching workspace / checkpoints, “surfaces” as product vocab. Do not author those into skill bodies.
- **Skill bodies = product help only:** UI paths, honesty, layout, user flows. Do **not** restate tool ids, parameters, or how tools work — the agent already has the live tool list and system prompt. Capability language is fine (“Mermaid tool”, “memory tools”). Exact ids belong in research only, not skill bodies.
- **Answer users in UI nouns.** Dual language is conceptual (notebook ≈ workspace folder; thread ≈ session) — not a second tool catalog.
- **Unknown → under-claim.** Known sharp edges (OS gates, ignored config, empty/error states, until-restart) are worth shipping when you find them — prefer sharp and short over flat completeness.
- **Separate files:** research holds grounding (may cite tool ids); skill body is product-facing only. No source dumps or path lists in the skill body.

---

## Hard order (process only)

```text
1. Must-read docs
2. Autonomous research in Buddy (+ craft exemplar from agent-scripts if useful)
3. Write pilot-archive/research/<name>.research.md
4. Read style guide (and exemplar again if useful)
5. Write skill/references/<name>.md
```

Do not write the skill body before research exists. Do not skip research into the skill file.

---

## Step 1 — Must-read docs

Read **in full**:

| File | Why |
| --- | --- |
| `docs/launch/buddy-help/workflow.md` | This contract |
| `docs/launch/buddy-help/research.md` | Ontology, dual-language, **your** term-audit row, honesty pitfalls |
| `docs/launch/buddy-help/skill/SKILL.md` | Router rules, dual phrases, defaults, answer shape |
| `docs/launch/buddy-help/skill/references/<name>.md` | Your stub only |

Do not load `skill-style-guide.md` yet.

---

## Step 2 — Research

Explore Buddy yourself. Hunt real behavior and failure modes while you explore — not as a form to fill later.

Optional craft corpus (structure/voice only):

**Root:** `/Users/prashantbhudwal/Code/agent-scripts`

```text
agent-scripts/
├── README.md
├── AGENTS.MD
└── skills/<name>/SKILL.md   (+ optional references/, scripts/, …)
```

Useful density samples: `wrangler`, `reminders`, `ssh-doctor`, `one-password`, `browser-use`, `openclaw-relay`, `github-deep-review`, `cloudflare-registrar`. Prefer in-tree skills over symlinks.

---

## Step 3 — Write `<name>.research.md`

Path: `docs/launch/buddy-help/pilot-archive/research/<name>.research.md`

Author grounding only. Not shipped as the skill reference.

**No mandated outline.** Structure however best holds evidence for this topic. Dense and citable is fine. Accuracy over polish.

Must be complete enough that Step 5 needs only this file + must-read docs — no hidden knowledge left only in your head.

Finish before the style guide.

---

## Step 4 — Style craft

Read **in full:** `docs/launch/buddy-help/skill-style-guide.md` (especially §5–§5d).

Telegraph, operational, imperative. No marketing essays. No invented tools/flags.

Re-open agent-scripts only for craft. Product facts only from your research + must-read docs.

---

## Step 5 — Write `<name>.md`

1. Frontmatter: `name` + quoted `description` (routing bait).
2. Body shape fits **this topic** and good skill craft — not a shared buddy-help recipe and not a checklist dump.
3. Ground only on research. If research does not support a line, do not write it.
4. Prefer **sharp and short** over complete and flat. Cut background first; keep user paths and traps you actually proved.
5. Unknowns: under-claim. Do not invent.
6. Do not restate tool ids, parameters, or how tools work — live tools + system prompt own that. Capability language only.

**Done when:** both files exist; skill body is real (not stub); claims are grounded; isolation held; research and skill stay separate; skill body is not a second tool catalog.

---

## Out of scope

- Orchestration, other leaves, pilot-archive  
- Wiring `defineBuddySkill` / installer (unless assigned)  
- Pedagogy skills, marketing site  
- Loading research/style-guide into product runtime  

---

## Quick start

1. Must-read docs.  
2. Research Buddy (and craft samples if useful).  
3. Write `pilot-archive/research/<name>.research.md`.  
4. Style guide.  
5. Write `skill/references/<name>.md`.  
6. Stop.
