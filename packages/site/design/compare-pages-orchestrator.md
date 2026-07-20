# Orchestrator prompt: produce Buddy comparison pages from research

Copy everything below into a fresh agent task at the repository root. The user may attach or name research files, a directory, or a subset of competitors—**infer the job from what they give you**. Do not assume a fixed competitor list.

---

You are the primary orchestrator for Buddy competitor-comparison publishing. Complete the entire run for **whatever research inputs the user supplies**. Do not stop after planning or dispatching agents.

## Inputs (user-driven)

The user will provide one or more of:

- paths under `packages/site/design/research/vs/` (files and/or the whole directory);
- named competitors whose research lives in that tree;
- explicit “author these research files” instructions.

**Infer everything from the research and the user message:**

| Infer | From |
| --- | --- |
| How many pages | One publishable YAML per research file that is a real competitor brief (see exclusions) |
| Competitor name | Research title / product name in the brief |
| Audience | Research framing (learners, educators, both)—default `both` only if ambiguous |
| Slug | `buddy-vs-{kebab-from-competitor}` (stable, lowercase, schema-safe) |
| Related pages | After all new pages exist; also link to **already published** `buddy-vs-*.yaml` when relevant |
| Central choice | The decision the research is actually about |

### Research location

Default research root:

`packages/site/design/research/vs/`

Typical files: one markdown brief per competitor (e.g. `chatgpt.md`, `quizlet.md`). Also read sibling notes only if the user points at them.

### Exclusions (do not publish pages for these unless the user explicitly overrides)

- Planning or wave notes (e.g. `wave1.md`, `wave2.md`)
- Non-competitor inventories, meta SEO dumps, or files that are clearly not a vs-brief
- Files the user says to skip

If the user names specific files, only those. If they say “all vs research,” take every eligible brief under `vs/`. If unclear, list candidates and proceed with all clear competitor briefs—or ask once if nothing is eligible.

### Existing site pages

- Do **not** assume the current set of compares (ChatGPT, Quizlet, etc.) is the job inventory.
- **Do** discover already-published pages via `packages/site/src/content/compares/buddy-vs-*.yaml` for:
  - avoiding slug/title collisions;
  - wiring `relatedCompares`;
  - improving pages **in place** when the user re-runs research for a competitor that already has a YAML file.
- Never erase user work blindly; improve in place when the output path already exists and contains real content.

## Mission

Convert each selected research brief into one production-ready structured comparison **YAML** page. Shared infrastructure already exists (schema, components, routes, JSON-LD, sitemap, `llms.txt`, install CTA, validators). **Do not redesign, replace, or weaken that infrastructure.**

These are **sales product-compare pages**, not research appendices, blogs, or competitor help centers.

**Required editorial standards:** `packages/site/design/compare-pages-cleanup.md`  
(architecture/field shapes: `packages/site/design/research/compare-pages-architecture.md`—if it conflicts with cleanup or the schema, **cleanup + schema win**.)

## Fixed paths

- Repository root: repository root of this monorepo
- Site package: `packages/site`
- Research default: `packages/site/design/research/vs`
- Content directory: `packages/site/src/content/compares`
- Empty starter: `packages/site/src/content/compares/_template.yaml.example`
- Content standards: `packages/site/design/compare-pages-cleanup.md`
- Architecture / block shapes: `packages/site/design/research/compare-pages-architecture.md`
- Schema: `packages/site/src/content.config.ts`
- Page composition: `packages/site/src/components/compare/ComparePage.astro`
- Section dispatcher: `packages/site/src/components/compare/CompareSection.astro`
- Loader: `packages/site/src/lib/compare.ts`
- Production validator: `packages/site/scripts/validate-compare-pages.ts`
- Writing audit: `packages/site/scripts/audit-compare-ai-writing.mjs`
- Writing-quality skill: path to avoid-ai-writing `SKILL.md` (commonly `~/code/avoid-ai-writing/SKILL.md` or `AVOID_AI_DETECTOR`’s sibling skill)

## Output rule

For each eligible research brief:

| | |
| --- | --- |
| Output path | `packages/site/src/content/compares/buddy-vs-{slug-suffix}.yaml` |
| URL | `/compare/buddy-vs-{slug-suffix}/` |
| One file only | Exactly one YAML per research brief |

Slug suffix: lowercase kebab derived from the competitor (e.g. Claude for Teachers → `claude-teachers`). Must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

**Never** author new pages as bare competitor slugs (`chatgpt.yaml`). Always `buddy-vs-…`.

## Concurrency

- One isolated authoring job **per page**, all started in one wave when multiple pages are in scope.
- If the runtime cannot run all children at once: spawn as many as allowed; root may own one page under the same one-file contract; do not serialize the whole set.
- Do not spend first-wave slots on planning, research summaries, infrastructure design, or validation. Authors write YAML; root integrates later.

## Before dispatching

Root orchestrator, read-only:

1. Resolve the **input set** from the user message + `design/research/vs/` (list every research file → competitor → output slug).
2. Read repository / `packages/site` AGENTS instructions.
3. Read completely: `compare-pages-cleanup.md`, `_template.yaml.example`, `content.config.ts`, `lib/compare.ts`, `validate-compare-pages.ts`.
4. Confirm avoid-ai-writing skill exists; confirm `audit-compare-ai-writing.mjs` exists.
5. `git status --short` as before-snapshot; preserve unrelated changes.
6. For each output path: if YAML already has user work, instruct improve-in-place; never wipe blindly.
7. List already-published `buddy-vs-*.yaml` for related-link and uniqueness awareness (do not send other pages’ full copy to authors in the first wave).

Do not full-build before dispatch unless infrastructure is obviously broken.

## Lessons from past compare runs (orchestrator + every author)

These failures already happened on real Buddy compare drafts. **Do not recreate them.** Fold them into every subagent prompt (see Page-author contract).

| What went wrong | Why it failed | What to do instead |
| --- | --- | --- |
| Research/blog voice on a product page | Source ledgers, “check the fine print”, “claims that change the decision” | Sales compare: facts in prose/factors/pricing/decision/FAQs—not a bibliography section |
| Meta “decision” copy | Author language (“what settles the choice”, “the real gaps”, section labels about The Decision) | Name products and tradeoffs; never narrate the content strategy |
| Evidence / limitations sections | Symmetric “where each falls short” and source appendices do not sell | **Forbidden** in schema; honesty = “Choose them when…” + FAQs |
| Decision `closing` blurb | Restated choose-if; felt like a blog verdict | Choose-if columns only—**no** `closing` field |
| Pricing NOTE / `caveat` | Visual noise under price cards | Price facts only in `buddy` / `competitor` strings—**no** `caveat` |
| Poetic dualism H1s | “Chat in the cloud, or practice on your machine” does not say it is a compare page | H1/title = **`Buddy vs {Product}`** (+ job); dualism only in tagline/prose if useful |
| Bare competitor slugs | `/compare/chatgpt/` looks like a product page, not a vs page | Always **`buddy-vs-{kebab}`** files and URLs |
| Competitor-only FAQs | “If I cancel RemNote Pro…” is their help center, not a Buddy compare | Every FAQ answer **names Buddy** and contrasts the choice (or Buddy limitation + when to use them) |
| Operational chrome in copy | `/flashcard`, Practice rail, SM-2 rating lists, internal Bench jargon | Plain outcomes: “ask for a deck”, “scheduled review”, “documents beside chat” |
| Long essay prose + essay H2 | Felt like a blog; duplicated the hero | 2 short paragraphs; prose has **no** `heading` |
| Generic decision H2 | “Which one fits the way you study” on every page | “When {Competitor} fits, when Buddy fits” (competitor-specific) |
| Empty promo / AI filler | “unlocks”, “not just X”, “how to choose between them” | Concrete claims; delete filler |
| Symmetrical autopsy for “fairness” | Does not convert; choose-if already concedes fit | Concede in **decision** and **FAQs**, not a limitations funeral |
| Detector gaming | Synonym-spinning product names to kill `low-ttr` | Fix real high/medium AI-isms only; keep product/job terms for SEO |
| No CTA | Compare pages without install left intent hanging | CTA is **shared page chrome**—authors never write it in YAML |

**Remember:** research files are for **truth**. Published YAML is for **choosing and installing Buddy**. Extract only what changes the buy.

## Sales-compare content contract (all authors)

Full detail: `compare-pages-cleanup.md`. Summary:

### Purpose

- Sell Buddy to the right user; filter users who should stay on the competitor.
- Install CTA is **shared infrastructure**—do **not** author CTA/download blocks in YAML.

### Metadata

- `competitor`, `competitorUrl` (first-party from research), `audience` ∈ `learners` | `educators` | `both`.
- `title` (≤60): **`Buddy vs {Product}`** (+ short job if it fits). Unique across all compares (including pre-existing).
- `description` (120–160): natural comparison framing; no empty “which fits you / how to choose” filler.
- `headline` (≤100, H1): **`Buddy vs {Product}`** (+ job). Must signal comparison. **No** dualisms without product names.
- `tagline` (≤180): concrete product difference.
- `targetQueries`: ≥2 natural queries the page actually answers.
- `lastVerified` / `lastUpdated` as schema dates (from research / authoring day).
- `relatedCompares`: `[]` until root wires after all **new** pages exist.
- Omit og images unless assets already exist (this run does not create assets).

### FAQs (critical)

- ≥3; each answer ≥40 characters.
- **Every answer names Buddy** and contrasts both products **or** answers a Buddy objection with the competitor as alternative.
- **No competitor-only help-center FAQs** (cancel plan, rename, competitor-only offline) with Buddy tacked on at the end.
- Prefer: cost on both sides, phone/desktop, classroom vs solo, privacy, migration into Buddy.

### Sections

- 3–6 unique typed blocks; exactly one `decision`.
- **Allowed:** `prose`, `snapshot`, `decision-factors`, `workflow`, `comparison-table`, `pricing`, `test-results`, `decision`.
- **Forbidden:** `evidence`, `limitations` (not in schema). Gaps and honesty → decision choose-if + FAQs.
- **`prose`:** short paragraphs only; **no** `heading` field.
- **`pricing`:** `heading`, `intro`, `buddy`, `competitor` only—**no** `caveat`.
- **`decision`:** choose-if only; heading like “When {Competitor} fits, when Buddy fits”; real “choose competitor when…” reasons; **no** `closing`.
- **`test-results`:** only if research records a real method and results.
- Field length minima: follow `content.config.ts` (intros/paragraphs ≥40 where required; details generally ≥24).

### Voice

- Facts that change the **buy**, not the full research dump.
- No meta (research files, waves, SEO, YAML, block types, “the decision”).
- No operational chrome (`/flashcard`, Practice rail, rating enums) unless essential—prefer plain outcomes.
- No doorway templates (`overview → features → pricing → winner`).
- No generic headings (Overview, Features, Pros and cons, Why Buddy wins, Verdict, Conclusion).

### Buddy product boundary

Buddy: free local-first desktop app, macOS/Windows, one OS user, one machine, local folders, no Buddy account for core use, practice + documents/whiteboards/widgets, user-chosen model provider. Not open source; not offline-only; not cloud-only chat. Model calls may leave the machine. **Do not claim** mobile/web/sync/collab/student accounts/rostering/LMS admin/district compliance Buddy does not ship.

### Fairness

Accurate competitor workflow; keep strongest competitor advantages; qualify price/eligibility/privacy/region; no invented precision.

### Writing pass (every author)

After factual draft: avoid-ai-writing **edit** / `professional` / `blog` / ≤2 passes. Preserve facts and identifiers. Re-check FAQs for Buddy context; no forbidden fields.

Authors **do not** run builds, lint, or the audit script in the first wave.

## Page-author contract (dispatch template)

Replace bracketed values per job. The block below must be sent **verbatim in substance** (including **Hard lessons**) so each subagent is independent of chat history and of other pages.

---

> You own one Buddy comparison content file and no other file.
>
> Repository root: `[REPO_ROOT]`
>
> Competitor: `[COMPETITOR]`
>
> Slug: `buddy-vs-[SLUG_SUFFIX]`
>
> Research input: `[ABSOLUTE_PATH_TO_RESEARCH_MD]`
>
> Required output: `[ABSOLUTE_PATH_TO]/buddy-vs-[SLUG_SUFFIX].yaml`
>
> ## Hard lessons from prior Buddy compare drafts (do not recreate)
>
> Past runs produced pages that felt like research blogs or competitor help centers. Avoid every item below.
>
> 1. **Sales compare, not research.** Do not add evidence/source-ledger sections, “check the fine print”, or “claims that change the decision”. Put consequential facts into pricing, decision-factors, choose-if, or FAQs.
> 2. **No meta about “the decision”.** Never write author process language (“what settles the choice”, “the real gaps”, “feature checklists make them look closer”). State products and differences.
> 3. **Forbidden section types:** `evidence`, `limitations` (not allowed). Do not invent “where each product falls short” blocks. Honesty = “Choose {Competitor} when…” plus FAQs.
> 4. **No decision `closing`.** End with choose-if lists only—no summary verdict under the cards.
> 5. **No pricing `caveat` / NOTE.** Only `heading`, `intro`, `buddy`, `competitor` price fields.
> 6. **Titles must say compare.** `title` and `headline` = `Buddy vs {Product}` (optional short job). Never a poetic dualism alone as H1 (“cloud or machine”). Dualism may appear only in tagline/prose if useful.
> 7. **Slug is always `buddy-vs-…`.** Never bare competitor filenames.
> 8. **FAQs must compare.** Every answer **names Buddy** and contrasts both sides (or a Buddy limit with when to use the competitor). Delete competitor-only FAQs (e.g. cancel Pro, product rename, competitor-only trivia) even if research is full of them. Prefer: free/cost on both, phone vs desktop, classroom vs solo, privacy, import into Buddy.
> 9. **No operational product chrome** in reader text: no `/flashcard`, `/quiz`, “Practice rail”, Again/Hard/Good/Easy lists, “leech”, etc. Describe outcomes (“ask for a deck”, “scheduled review”).
> 10. **Prose is a short lead.** Prefer 2 tight paragraphs. Prose has **no** `heading` field—no second essay title under the H1.
> 11. **Decision heading is specific:** e.g. “When {Competitor} fits, when Buddy fits”—not generic “Which one fits the way you study”.
> 12. **Concede for real.** Include strong “Choose {Competitor} when…” reasons. Do not pretend Buddy wins every factor. Do not add a limitations funeral to look fair.
> 13. **No download/CTA copy in YAML.** Install buttons are page infrastructure.
> 14. **Do not game writing detectors** by renaming Buddy/competitor/job words. Keep product names for SEO. Avoid tier-1 filler (`features` as fluff, empty “unlocks”, “not just X”, stock conclusions, em dashes).
> 15. **Research ≠ publish.** Research may list every source and caveat; the page only publishes what changes the **buy**.
>
> ## Read completely before writing
>
> 1. your assigned research file;
> 2. `packages/site/design/compare-pages-cleanup.md` (full standards);
> 3. `packages/site/src/content/compares/_template.yaml.example`;
> 4. `packages/site/src/content.config.ts` (schema wins on fields);
> 5. avoid-ai-writing `SKILL.md`.
>
> Schema and cleanup win over architecture docs if they conflict. Research is authority for competitor claims. Verify Buddy capabilities only against Buddy source or public site—not against other compare YAMLs. Do not read other agents’ YAML outputs.
>
> ## Scope
>
> Create or edit only the required output file. Do not touch research, schemas, components, routes, validators, styles, deps, lockfiles, starter, or other comparison files. No builds, installs, servers, fmt, lint, typecheck, audit script, commits, or deploys.
>
> Structured content only—no HTML/CSS/Astro/layout. Follow the **Sales-compare content contract** in the orchestrator and `compare-pages-cleanup.md`.
>
> ## Metadata (must)
>
> - `competitor`, `competitorUrl`, `audience` (`learners` | `educators` | `both`);
> - `title` ≤60: `Buddy vs {Product}` (+ job if fits);
> - `description` 120–160: comparison framing, no empty “which fits you”;
> - `headline` ≤100: `Buddy vs {Product}` (+ job)—must read as a vs page;
> - `tagline` ≤180: concrete difference;
> - `targetQueries` ≥2; `lastVerified` / `lastUpdated` dates;
> - `faqs` ≥3, each answer ≥40 chars, **each answer names Buddy** and compares;
> - `sections` 3–6 unique types, exactly one `decision`;
> - `relatedCompares: []` until root wires related slugs;
> - no og image fields unless assets already exist.
>
> ## Sections (must)
>
> Allowed only: `prose`, `snapshot`, `decision-factors`, `workflow`, `comparison-table`, `pricing`, `test-results`, `decision`.
>
> - `prose`: paragraphs (prefer 2 short); optional bullets; **no heading**.
> - `pricing`: heading, intro, buddy, competitor—**no caveat**.
> - `decision`: heading + competitorHeading + competitorReasons + buddyHeading + buddyReasons—**no closing**. Include real competitor wins.
> - `test-results`: only if research has real method/results.
> - Never pad with unused block types. Never feature-dump the research file.
>
> Field minima: follow `content.config.ts`.
>
> ## Buddy boundary
>
> Free local-first desktop (macOS/Windows), one user/machine, local folders, no Buddy account for core use, practice + bench-style documents, user-chosen model. No mobile/web/sync/collab/student roster/LMS admin/district compliance claims Buddy does not ship.
>
> ## Writing pass
>
> After factual draft: avoid-ai-writing **edit** mode, `professional` voice, `blog` context, ≤2 passes. Preserve facts, URLs, prices, plan names. Then re-check: every FAQ names Buddy; no forbidden fields; no meta; no operational chrome.
>
> ## Return report
>
> Path; section types in order; central choice in one line; strongest competitor concession; FAQ count; confirmation of hard-lessons + writing pass. Do not paste the whole YAML.

---

## Isolation

- One writer per output file.
- First wave: no reading/normalizing peers’ drafts.
- No shared paragraph banks or content generators.
- No infrastructure edits from page agents.

## After the wave

1. `git status` vs snapshot; preserve unrelated work.
2. Confirm each job only touched its YAML.
3. Confirm every planned output exists (and only those new pages were required).
4. Uniqueness: titles, descriptions, headlines, competitor URLs vs **all** compares including pre-existing.
5. FAQ audit: every answer contains `Buddy`; no competitor-only FAQs.
6. No `evidence` / `limitations` / decision `closing` / pricing `caveat`.
7. Fact-check against each research file; real competitor concessions present.
8. Optional blocks must not duplicate each other.

Send focused fix jobs to owning writers; parallelize across files.

## Related comparisons

After all **new** pages exist and pass the factual audit:

- Set each new page’s `relatedCompares` to 2–4 **`buddy-vs-*` slugs** (new and/or already published).
- No self-links or duplicates.
- Infer neighborhoods from audience and job (study vs educator vs general AI)—do not force one global related set.
- Mechanical pass only; do not rewrite body copy here.

## Deterministic writing audit (root) — temp-file hold-out pass

Run this **after** related-slug wiring and **after** any content or subjective writing fixes. Page authors do **not** run it in the first wave.

### Why temp files

Compare pages must repeat product names (`Buddy`, competitor brands) for SEO and clarity. A raw detector pass over that text often flags **low type-token ratio (`low-ttr`)** and can bury real AI-isms. The audit script therefore:

1. Extracts human-facing strings from every `packages/site/src/content/compares/buddy-vs-*.yaml`.
2. Writes a **raw** corpus and an **audit** corpus (product proper nouns replaced with neutral tokens like `AppA` / `AppB`).
3. Runs the avoid-ai-writing **deterministic** detector (`patterns.js`) on the audit text.
4. Treats **high + medium** (and low issues other than `low-ttr`) as **actionable failures**.
5. Leaves **`low-ttr` as informational** — do not synonym-spin product or job terms to silence it.

Domain words (`study`, `practice`, `free`, `local`, `teachers`, …) stay in the audit text so medium flags still fire.

### How to run

From the **monorepo root**:

```sh
node packages/site/scripts/audit-compare-ai-writing.mjs --write-temps
```

Without temps (pass/fail only, no files on disk):

```sh
node packages/site/scripts/audit-compare-ai-writing.mjs
```

**Detector path:** the script looks for avoid-ai-writing `detector/patterns.js` under common locations, or use:

```sh
export AVOID_AI_DETECTOR=/absolute/path/to/avoid-ai-writing/detector/patterns.js
node packages/site/scripts/audit-compare-ai-writing.mjs --write-temps
```

### Temp file layout (`--write-temps`)

Directory: `/tmp/buddy-compare-ai-audit/`

| File | Contents |
| --- | --- |
| `buddy-vs-{slug}.raw.txt` | Extracted human-facing copy as published (product names intact) |
| `buddy-vs-{slug}.audit.txt` | Same text with product proper nouns held out (what the detector scores) |
| `report.json` | Machine-readable actionable + informational issues |

Use `.audit.txt` when inspecting why a flag fired. Use `.raw.txt` when editing YAML so you fix real reader-facing strings.

### How to read the result

| Exit code | Meaning |
| --- | --- |
| `0` | **PASS** — no actionable high/medium (or non-ttr low) issues |
| `1` | **FAIL** — fix listed actionable issues in the owning YAML, then re-run |
| `2` | Script/setup error (e.g. detector not found) |

Console summary per file:

- `raw=` score on unredacted extract (often noisy; do not chase raw-only `low-ttr`)
- `audit=` score on hold-out text (this is the gate)
- `actionable:` must be empty / `none` for pass
- `informational:` may list `low:low-ttr` — expected on compare pages

There is also a **per-chunk** pass so medium issues are not diluted in long documents.

### Fix loop

1. Run with `--write-temps`.
2. If FAIL: open the listed YAML (and matching `.audit.txt` / `.raw.txt` for context).
3. Fix **actionable** hits only (tier-1 vocab, other high/medium patterns). Do **not** brute-force `low-ttr` with synonym cycling of Buddy/competitor/job words.
4. Re-run the same command until exit `0`.
5. Optional: subjective avoid-ai-writing skim per `compare-pages-cleanup.md` (meta, “not just”, competitor-only FAQs).
6. **Always re-run the deterministic script after subjective edits** — judgment passes can reintroduce detector hits.

### Orchestrator responsibility

- Root (or a single post-wave agent) owns the audit—not the parallel page authors.
- Do not mark the publishing run done until this pass exits `0`.
- Include audit exit code and a one-line summary in the final report.

## Production validation

```sh
cd packages/site && bun run build
```

Then production-output validation as wired by the package (`validate-compare-pages` or equivalent). Never weaken schema/components/validators to accept weak content.

Verify hub, sitemap, and `llms.txt` include the new URLs; install CTA is present via shared composition (not YAML).

## Repository gates

From monorepo root, sequentially:

```sh
bun lint
bun typecheck
node packages/site/scripts/audit-compare-ai-writing.mjs
```

No concurrent package+root typechecks. No `bun fmt` unless the user says the work is done. No deploy/commit/PR unless asked.

## Definition of done

- Every user-selected (or inferred-eligible) research brief produced exactly one `buddy-vs-*.yaml`.
- No page agent changed shared infrastructure or another page.
- Content matches sales-compare contract (titles, FAQs, forbidden blocks, honesty in choose-if).
- Related slugs resolve; writing audit pass; build + lint + typecheck pass.
- Unrelated worktree left intact.

Final report:

1. Input set (research paths → output paths).
2. Parallel dispatch notes.
3. Per page: section types, one-line choice, top competitor concession, FAQ count.
4. Writing-audit, build, lint, typecheck results.
5. Pre-existing dirty paths left untouched.

Do not claim success while writers are running or gates are red.
