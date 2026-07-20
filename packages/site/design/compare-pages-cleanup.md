# Compare pages: content cleanup and review process

Independent process for writing or revising Buddy compare pages. **Content only**: YAML under `packages/site/src/content/compares/`, routes/slugs, SEO wording, and writing quality. No layout or CSS.

Any agent should be able to run this end-to-end without prior chat context.

## Goals

1. Pages read as **product comparisons that sell Buddy**, not research notes, blog essays, or competitor help centers.
2. Copy is **SEO- and crawler-friendly**: clear `Buddy vs {Product}` framing, real product names, job terms.
3. Writing avoids **AI-isms** without gaming metrics in ways that hurt clarity or SEO.
4. Honesty stays in the page (when the competitor wins) without dedicated “autopsy” sections.

## Content standards

### Titles, slugs, related links

| Field | Rule |
| --- | --- |
| SEO `title` | `Buddy vs {Product}` (+ short job if length allows) |
| H1 `headline` | Same shape: name **both products** and signal comparison (`vs`) |
| `tagline` | Concrete difference (optional when prose leads; still useful for hub / `llms.txt`) |
| File slug / URL | `buddy-vs-{competitor-kebab}` → `/compare/buddy-vs-chatgpt/` |
| `relatedCompares` | Other **slugs** (`buddy-vs-…`), not bare competitor names |
| Related-card title | **Buddy vs {Competitor}**, not the competitor name alone |

Do **not** use dualisms without product names as the H1 (e.g. “chat in the cloud or practice on your machine”). Put the real tradeoff in tagline or short prose.

### What belongs on the page

| Piece | Rule |
| --- | --- |
| **Prose** (optional) | 2 short setup paragraphs; no separate essay H2 restating the page title |
| **Snapshot / workflow / decision-factors / pricing** | Only if they change the buy; not feature dumps |
| **Decision** (required, exactly one) | Choose-if lists: when competitor fits, when Buddy fits. **No** closing summary under the cards |
| **FAQs** | At least 3; every answer must compare or put Buddy in context (see FAQs below) |
| **Install CTA** | Shared site install block at the bottom of every compare page and the hub; not authored in YAML |

### What does not belong

| Remove / avoid | Why |
| --- | --- |
| Author/meta language | “claims that change the decision”, “what settles the choice”, “check the fine print”, “the real gaps” |
| `evidence` / source-ledger sections | Research appendix; put consequential facts in pricing, decision, or FAQs |
| `limitations` / “where each falls short” | Symmetric autopsy is not sales copy; honesty goes in choose-if and FAQs |
| Pricing `caveat` / NOTE blurbs | Noise; keep price facts in price fields |
| Decision `closing` | Blog verdict; restates choose-if |
| Operational product chrome | Slash commands, internal UI names, rating enums, algorithm brands unless the comparison truly needs them |
| Generic decision headings | Prefer “When {Competitor} fits, when Buddy fits” |
| Promo / AI filler | Empty “unlocks”, “not just X”, “how to choose between them” with no substance |
| Competitor-only FAQs | Help-center trivia about X with no Buddy choice |

### FAQs (required comparison context)

FAQs exist to help someone choose **Buddy vs {Competitor}**, not to document the competitor alone.

**Every FAQ answer must:**

1. Mention **Buddy** by name, and  
2. Either contrast both products **or** answer a Buddy-side objection with the competitor as the alternative.

**Rewrite or delete if:**

- The question is only about the competitor (billing, cancel Pro, rename, offline-only-for-them) and the answer is a help article with Buddy tacked on in the last sentence.  
- A reader could paste the answer onto the competitor’s site with almost no edits.

**Good FAQ shapes:**

| Shape | Example |
| --- | --- |
| Cost on both sides | “What is free on Quizlet vs Buddy?” |
| Job on both sides | “Which one works on a phone?” → Knowt yes / Buddy desktop only |
| Buddy limitation with competitor as fit | “Does Buddy have parent controls like Khanmigo?” → No; use Khanmigo parent plan if you need that |
| Migration / import | “Can I import Quizlet sets into Buddy?” → No; rebuild in Buddy or stay on Knowt/Quizlet for import |

**Weak (rewrite):**

- “If I stop paying for RemNote Pro, do I lose my cards?” → almost pure RemNote  
- “Did NotebookLM get renamed?” → no Buddy choice  
- “Is MagicSchool free?” with no Buddy cost contrast  

**Strong (keep pattern):**

- “Who keeps your cards if you stop paying?” → RemNote free tier vs Buddy no subscription, files local  
- “What is free on X vs Buddy?”  
- “Can students use X or Buddy?”  

Minimum **3 FAQs** per page (schema). Prefer 4–5 distinct objections, not restatements of the decision block.

### Decision block (choose-if)

- `competitorHeading` / `buddyHeading`: “Choose {X} when” / “Choose Buddy when”  
- Reasons: concrete situations, not feature laundry lists  
- **Must** include real cases where the competitor is the better fit (trust + filters bad installs)  
- No `closing` paragraph after the two columns  

### Prose and voice

- Direct, specific, professional.  
- Concrete product claims over process talk (“the sequence decides…”).  
- Keep product names and job words (**study**, **practice**, **teachers**, **flashcards**) even when they repeat—SEO and clarity beat synonym cycling.  
- Apply avoid-ai-writing in **edit** mode, **professional** voice, **blog** context, ≤2 passes; do not distort facts, URLs, prices, or plan names.

### Optional section types (sales pages)

**Allowed when they earn their place:** `prose`, `snapshot`, `decision-factors`, `workflow`, `comparison-table`, `pricing`, `test-results` (only with real method/results), `decision`.

**Not used on sales compare pages:** `evidence`, `limitations` (removed from schema for this reason).

Honesty for Buddy gaps belongs in **decision reasons** and **FAQs**, not a dedicated trade-offs funeral.

## Review process (any agent)

Run after authoring or editing compare YAML. **Order matters.**

### Step 1 — Structural content check

For each `buddy-vs-*.yaml`:

1. Schema-valid; 3–6 unique section types; exactly one `decision`.  
2. No `evidence` or `limitations`; no decision `closing`; no pricing `caveat`.  
3. No reader-facing meta about “the decision”, research waves, or block types.  
4. Slug is `buddy-vs-…`; `relatedCompares` only existing slugs.  
5. `title` and `headline` both use **Buddy vs** + competitor (or clear equivalent).  
6. FAQs: ≥3; **every answer names Buddy** and contrasts or situates the choice; no competitor-only help text.  
7. Decision block includes at least one honest “choose competitor when…” reason.

### Step 2 — Deterministic writing audit (must pass)

From repo root:

```bash
node packages/site/scripts/audit-compare-ai-writing.mjs --write-temps
```

| | |
| --- | --- |
| What it does | Extracts human-facing strings; hold-out temps; runs avoid-ai-writing `patterns.js` |
| Hold-out | Product **proper nouns** only. Domain SEO words stay |
| Actionable (fail) | All **high** + **medium**; **low** except `low-ttr` |
| Informational | **`low-ttr`** — expected; do not synonym-spin to kill it |
| Temps | `/tmp/buddy-compare-ai-audit/` with `--write-temps` |
| Env | `AVOID_AI_DETECTOR` if detector path differs |

Fix every **actionable** hit in YAML.

### Step 3 — Subjective skill pass (judgment only)

Categories the script **cannot** detect, including:

- “not just / it’s not X, it’s Y”  
- Self-labeling (“the real…”, “what matters is…”)  
- Meta essay framing; empty “how to choose”  
- Promotional filler (“unlocks” with no substance)  
- Generic headings and stock conclusions  
- FAQs that only document the competitor  
- False concessions, vague validation, synonym cycling  

Edit only where the page feels AI-written or off-purpose (not a sales compare). Keep vs-titles and product-name density.

### Step 4 — Re-run the script

```bash
node packages/site/scripts/audit-compare-ai-writing.mjs --write-temps
```

Must exit **0** with **actionable: none**. If subjective edits reintroduced high/medium issues, fix and repeat 2–4.

### Step 5 — Content spot-check

- One competitor-shaped choice; competitor can win in choose-if / FAQs.  
- Claims still accurate (price, eligibility, privacy qualified).  
- Related links resolve; no duplicate titles/descriptions across entries.  
- Every FAQ still has Buddy in the answer after edits.

## Historical cleanup (context)

Derived from a full pass that:

1. Stripped research/blog chrome (evidence, limitations, decision closings, pricing notes, meta “decision” copy).  
2. Aligned titles and slugs to **Buddy vs {Product}** (Raycast / Zapier / Warp-style).  
3. Shortened lead prose; removed operational jargon from reader text.  
4. Rewrote FAQs so none are competitor-only help articles.  
5. Codified hold-out detector audit so SEO repetition is not a false failure.  
6. Shared install CTA on all compare surfaces (implementation lives in page composition, not YAML).

**Current bar:** standards above + script **PASS** + subjective skim + script re-run.

## Minimal checklist (copy-paste)

```
[ ] buddy-vs-* slug and relatedCompares
[ ] title + headline = Buddy vs {Product} (+ job)
[ ] no evidence / limitations / decision closing / pricing caveat
[ ] no author-meta or operational-chrome copy
[ ] decision has honest "choose competitor when" reasons
[ ] every FAQ answer names Buddy and contrasts the choice
[ ] no competitor-only FAQs (rewrite or delete)
[ ] node packages/site/scripts/audit-compare-ai-writing.mjs
[ ] fix actionable issues only (not low-ttr by force)
[ ] subjective avoid-ai-writing + FAQ skim
[ ] re-run audit script (exit 0)
```
