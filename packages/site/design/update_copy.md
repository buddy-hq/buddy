# Buddy Educator Copy — Update Proposal

> [!NOTE]
> This proposal covers only the **Educators** audience copy in [site.ts](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts). Learner copy is out of scope.

---

## What Makes Claude's Copy Strong (and Ours Weak)

| Quality | Claude for Teachers | Buddy (current) |
|---|---|---|
| **Opening hook** | Leads with *why* — the gap between research and what a teacher's week allows | Leads with *what* — a generic "teaching buddy" tagline |
| **Credibility** | Cites decades of research, names practices (differentiation, mastery-based, small-group) | Lists framework acronyms (CCSS, NGSS, Bloom, DOK) without explaining why they matter |
| **Emotional resonance** | "protect what teachers value most — time with their students" | "for whatever's next on your list" |
| **Specificity** | Concrete workflows: "hand Claude a folder of data… it builds a clear picture of where every student is" | Vague: "Plan with any learning framework" |
| **Trust & privacy** | Dedicated section: FERPA, K-12 Data Processing Addendum, AFT partnership | One-liner: "No tracking" |
| **Social proof** | Named schools (Prospect Schools), named orgs (AFT, Gates Foundation, TFA) | None |
| **Structure** | Clear narrative arc: Why → What → How → Safety → Getting Started | Flat list of features with no narrative |

---

## Section-by-Section Comparison & Recommendations

### 1. Hero

````carousel
**BEFORE** — current copy ([site.ts L375–378](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts#L375-L378)):
```
headline: "A teaching buddy for whatever's next on your list."
subtext:  "Plan, create, and assess with a teaching assistant that lives on your computer."
```
❌ Generic. "Whatever's next on your list" could be about a to-do app.
❌ "Teaching assistant" undersells — Buddy is a full agent with subagents, skills, standards, and curriculum planning.
<!-- slide -->
**AFTER** — proposed:
```
headline: "A planning and creation partner that lives on your computer."
subtext:  "Align to standards, build materials, assess understanding — with an AI teaching partner that keeps your data on your machine."
```
✅ "Planning and creation partner" matches the persona description from the codebase.
✅ Leads with the three verbs teachers care about: align, build, assess.
✅ "Keeps your data on your machine" is the trust hook, not an afterthought.
````

### 2. Features Header

````carousel
**BEFORE** ([site.ts L379–382](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts#L379-L382)):
```
headline: "Built for how you actually teach."
subtext:  ""
```
❌ Empty subtext is a wasted opportunity.
❌ "How you actually teach" is a nice line but needs support.
<!-- slide -->
**AFTER** — proposed:
```
headline: "Built for how you actually teach."
subtext:  "Every skill is grounded in learning science — from Bloom's Taxonomy to explicit instruction to formative assessment."
```
✅ Keeps the strong headline.
✅ Subtext establishes pedagogical credibility upfront, before the features list.
✅ Names specific frameworks Buddy actually ships (see [learningDesignFrameworksSkill](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/features/teaching-guidance/skills/learning-design-frameworks/SKILL.md)).
````

### 3. Feature Cards (the big rewrite)

The current 5 features (ALIGN, PLAN, CREATE, RESEARCH, BUILD) are correct in coverage but weak in copy. Claude's pattern: **verb-driven title → one concrete scenario → what happens next**. Here's a before/after for each:

#### 3a. ALIGN

````carousel
**BEFORE** ([site.ts L385–389](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts#L385-L389)):
```
tag:     "ALIGN"
title:   "Align content to standards or books."
subtext: "Buddy comes with built-in CCSS, NGSS, and all-U.S.-state standards.
          For Indian teachers, it can download NCERT and state board books,
          DIKSHA resources, and any public resource published on GOI websites."
```
❌ "Built-in CCSS, NGSS" reads like a spec sheet.
❌ Tries to cover US + India in one breath — muddled.
<!-- slide -->
**AFTER** — proposed:
```
tag:     "ALIGN"
title:   "Grounded in your standards, not generic prompts."
subtext: "Buddy ships with CCSS, NGSS, and state standards for all 50 US states —
          plus NCERT textbooks and DIKSHA resources for Indian educators.
          Ask for a lesson and it maps to the standards you teach, down to
          individual learning components and prerequisite chains."
```
✅ Title creates contrast: "your standards" vs. "generic prompts."
✅ Separates US and India clearly.
✅ "Down to individual learning components and prerequisite chains" is specific — it's what the [standardsFeature](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/features/standards/feature.ts) actually provides (`getLearningComponents`, `getPrerequisites`, `getNextStandards`).
````

#### 3b. PLAN

````carousel
**BEFORE** ([site.ts L391–395](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts#L391-L395)):
```
tag:     "PLAN"
title:   "Plan with any learning framework."
subtext: "Buddy can align your content to Bloom levels, DOK levels, or Piaget's stages.
          It can sequence your lessons using instruction models.
          It can also help you with materials for project-based learning, SEL,
          scaffolding, and formative and summative assessment."
```
❌ "Can… can… can also" is a lazy list, not a story.
❌ Piaget's stages aren't actually a shipped skill. The real skills are Bloom's, DOK, SOLO, SIOP, explicit instruction, success criteria.
<!-- slide -->
**AFTER** — proposed:
```
tag:     "PLAN"
title:   "Plan a lesson in minutes, not hours."
subtext: "Tell Buddy the topic and grade. It drafts a lesson plan scaffolded with
          Bloom's levels, DOK depth, and your state's standards — then generates
          differentiated student-facing materials for each readiness level."
```
✅ Title promises a concrete outcome ("minutes, not hours") — mirrors Claude's pattern.
✅ Shows a workflow, not a feature list.
✅ "Differentiated student-facing materials for each readiness level" — this is exactly what the [teachingResourceAuthoringSkill](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/features/teaching-guidance/skills/teaching-resource-authoring) and scaffolding levels (`worked-example`, `guided`, `independent`, `transfer` from [teaching-vocabulary.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/shared/teaching-vocabulary.ts#L16)) deliver.
````

#### 3c. CREATE

````carousel
**BEFORE** ([site.ts L397–401](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts#L397-L401)):
```
tag:     "CREATE"
title:   "Create docs, presentations, or spreadsheets."
subtext: "Buddy can create worksheets or lesson plans for your students.
          And it can create reports, presentations, or spreadsheets for your peers.
          All ready to export."
```
❌ Sounds like Google Docs marketing, not a teaching tool.
❌ "All ready to export" — export where? How?
<!-- slide -->
**AFTER** — proposed:
```
tag:     "CREATE"
title:   "Create worksheets, question sets, and flashcard decks."
subtext: "Buddy's subagents draft question sets, flashcard decks, and practice
          worksheets aligned to your lesson goals. Review them on the Bench,
          tweak what needs changing, and share with your class."
```
✅ Names the actual surfaces and subagents that exist: [question-set-author](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/features/question-sets/feature.ts), [flashcard-author](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/features/flashcards/feature.ts), [assessment-agent](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/features/assessment/feature.ts).
✅ Introduces the Bench naturally.
✅ "Review… tweak… share" is a workflow, not a feature.
````

#### 3d. RESEARCH

````carousel
**BEFORE** ([site.ts L403–407](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts#L403-L407)):
```
tag:     "RESEARCH"
title:   "Research around your material."
subtext: "Upload your PDFs, ebooks, documents, or web links.
          Buddy can parse, understand, and answer questions about them.
          Buddy has a built-in ebook reader, whiteboarding area, and source system
          to make your research easier."
```
❌ "Research around your material" is vague — research what?
❌ Three capabilities crammed into one sentence.
<!-- slide -->
**AFTER** — proposed:
```
tag:     "RESEARCH"
title:   "Read and reason over your own materials."
subtext: "Drop in PDFs, textbooks, or web links. Buddy reads alongside you in a
          built-in ebook reader, answers questions about the content, and lets you
          sketch ideas on an Excalidraw whiteboard — all without leaving the app."
```
✅ "Read and reason" — active verbs, clear outcome.
✅ Each capability gets its own clause instead of a pile-up.
✅ "Without leaving the app" reinforces the local-first, all-in-one story.
````

#### 3e. BUILD

````carousel
**BEFORE** ([site.ts L409–413](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts#L409-L413)):
```
tag:     "BUILD"
title:   "Build interactive experiences."
subtext: "Ask for an app, a game, or a website, and Buddy builds and publishes it,
          ready to share with students or peers. Every teacher, a builder."
```
❌ "Build interactive experiences" is marketing jargon.
❌ "Publishes it" — where? This is vague.
<!-- slide -->
**AFTER** — proposed:
```
tag:     "BUILD"
title:   "Turn any topic into an interactive app."
subtext: "Ask Buddy to build a simulation, a quiz game, or an interactive diagram
          for your students. It writes the code, renders it on the Bench, and gives
          you something you can share in class — no coding required."
```
✅ Concrete examples: simulation, quiz game, interactive diagram.
✅ "Renders it on the Bench" — uses the real product term.
✅ "No coding required" — answers the obvious objection.
````

### 4. Philosophy (Privacy/Trust)

````carousel
**BEFORE** ([site.ts L190–213](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts#L190-L213)):
```
headline: "Your classroom, your data."
subtext:  "No account, no cloud, no tracking. Your curriculum and your learners'
           data never leave your computer."
items:
  - "No logins"   → "Open the app and start..."
  - "On device"   → "Your notes and files live on your computer..."
  - "Asks permission" → "Buddy asks before it does anything..."
  - "No tracking"  → "We can't see what you teach..."
```
⚠️ This section is actually decent — but the subtext is generic and the items are identical to the learner version.
<!-- slide -->
**AFTER** — proposed:
```
headline: "Your classroom, your data."
subtext:  "No account, no cloud, no student data in the cloud.
           Your curriculum, assessments, and student work stay on your machine."
items:
  - "No account needed"   → "Open the app and start. No sign-up, no password, no district IT ticket."
  - "Local-first"         → "All files, lessons, and student data live on your computer. Only model calls go to your AI provider."
  - "You approve every action" → "Buddy asks before it reads, writes, or runs anything. Full permission control."
  - "Zero telemetry"      → "We can't see what you teach or who your students are. No analytics, no tracking, no data collection."
```
✅ Subtext now specifically mentions "student data" — the thing educators actually worry about.
✅ "No district IT ticket" speaks to the real friction.
✅ "Zero telemetry" is stronger than "No tracking."
✅ Each item is now educator-specific, not a copy of the learner version.
````

### 5. SEO

````carousel
**BEFORE** ([site.ts L258–264](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts#L258-L264)):
```
title:       "Buddy - The Teaching Superapp"
description: "Plan lessons, align to standards, create materials, and assess with
              Buddy—the local-first teaching superapp for Mac and Windows."
```
⚠️ "Teaching Superapp" is fine but vague.
<!-- slide -->
**AFTER** — proposed:
```
title:       "Buddy — AI Teaching Partner for Educators"
description: "Plan standards-aligned lessons, create differentiated materials, and assess
              understanding with Buddy — a local-first AI teaching partner for Mac and Windows.
              No account. No cloud. Your data stays on your computer."
```
✅ "AI Teaching Partner" is more searchable than "superapp."
✅ Description now includes the privacy hook which is a key differentiator for SEO.
✅ Mirrors Claude for Teachers' clarity in the meta.
````

---

## New Sections to Add

Claude for Teachers has sections that Buddy's site currently lacks. Here's what's worth adding, and how to add each one.

### New Section A: "Why we built this" (narrative opener)

**What Claude has:** A full "Why we're building for teachers" section — cites research, names the problem (time, budgets, class size), and positions the product as a bridge.

**What to write for Buddy:**

```
headline: "The gap between best practice and a teacher's week."
body:     "Research shows that differentiation, formative assessment, and scaffolded
           instruction reliably improve outcomes. But planning these takes hours
           that most teachers don't have. Buddy is designed to close that gap —
           a local AI partner that handles the preparation, so you can focus on
           the teaching."
```

**How to add it in the codebase:**

1. **Add a new type** in [site.ts](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts):
```typescript
export type WhySection = {
  readonly headline: string
  readonly body: string
}
```

2. **Add the data** alongside the other educator constants:
```typescript
const educatorWhy: WhySection = {
  headline: "The gap between best practice and a teacher's week.",
  body: "Research shows that differentiation, formative assessment, ..."
}
```

3. **Wire it into the `content.educators` object** and update the `satisfies` constraint.

4. **Create a new Astro component** like `WhySection.astro` in [components/](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/components).

5. **Add it to the page** in [AudienceLanding.astro](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/components/AudienceLanding.astro), right after `<Hero>` and before `<PhilosophyNew>`:
```astro
<Hero initialAudience={audience} />
<WhySection initialAudience={audience} />   <!-- NEW -->
<hr />
<PhilosophyNew initialAudience={audience} />
```

---

### New Section B: "How it works" (workflow walkthrough)

**What Claude has:** A step-by-step "How it works" section — "Plan a lesson from high-quality instructional materials", "Differentiate for every learner in your room", etc.

**What to write for Buddy:**

```
headline: "How it works"
steps:
  1. title: "Set your curriculum"
     desc:  "Tell Buddy your subject, grade, and standards framework. It loads
             CCSS, NGSS, or your state standards — plus NCERT and DIKSHA for
             Indian educators."

  2. title: "Plan a lesson"
     desc:  "Ask for a lesson on any topic. Buddy maps it to your standards,
             scaffolds it with learning progressions, and drafts student-facing
             materials at multiple readiness levels."

  3. title: "Create assessments"
     desc:  "Buddy's assessment agent generates question sets, flashcard decks,
             and practice problems — aligned to your lesson goals and tagged by
             Bloom's level."

  4. title: "Build and share"
     desc:  "Turn any concept into an interactive widget, simulation, or diagram.
             Buddy builds it on the Bench and gives you something ready to share
             in class."
```

**How to add it:**

1. **Add types** in [site.ts](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts):
```typescript
export type WorkflowStep = {
  readonly title: string
  readonly desc: string
}

export type HowItWorks = {
  readonly headline: string
  readonly steps: readonly [WorkflowStep, WorkflowStep, WorkflowStep, WorkflowStep]
}
```

2. **Add data**, create component (`HowItWorksSection.astro`), wire into `AudienceLanding.astro` after `FeatureSteps`:
```astro
<FeatureSteps initialAudience={audience} />
<hr />
<HowItWorksSection initialAudience={audience} />  <!-- NEW -->
<hr />
<CapabilitiesSection />
```

---

### New Section C: "Skills library" (what Claude calls "teaching skills")

**What Claude has:** They call out that Claude ships with "a set of tailored teaching skills grounded in learning science" and link to an open-source repo.

**Buddy already has this!** The [teaching-guidance feature](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/features/teaching-guidance/feature.ts) ships with:
- `learningDesignFrameworksSkill` (Bloom's, DOK, SOLO, SIOP, explicit instruction, formative assessment, success criteria)
- `teachingModelsSkill`
- `teachingResourceAuthoringSkill`
- `alignTeachingTopicsToGradeLevelAndAgeSkill`
- `findIndianEducationResourcesSkill`
- `fetchIndianCompetitionPapersSkill`
- `resolveConfusionSkill`
- `teachChemistrySkill`

**What to write:**

```
headline: "A library of teaching skills, built in."
subtext:  "Every skill is grounded in peer-reviewed learning science. Buddy uses
           them automatically when the task calls for it — or you can ask for
           any framework by name."
items:
  - "Learning design frameworks"  → "Bloom's Taxonomy, DOK, SOLO, SIOP, explicit instruction"
  - "Standards alignment"         → "Map any topic to CCSS, NGSS, state standards, NCERT, DIKSHA"
  - "Differentiation"             → "Scaffolded materials at four levels: worked example, guided, independent, transfer"
  - "Assessment authoring"        → "Question sets, flashcard decks, and rubrics aligned to your lesson goals"
  - "Resource authoring"          → "Worksheets, lesson plans, and student-facing materials ready to use"
```

**How to add it:** Same pattern as above — type, data, component, wire into page. Place it after `HowItWorks` and before `CapabilitiesSection`.

---

### New Section D: Enhanced "Download / Getting Started" CTA

**What Claude has:** "Once verified, educators can access Claude for Teachers entirely free."

**What Buddy should say:**

```
tagline: "Free. No account. Download and start teaching."
subtext: "Buddy is free for every educator. No sign-up, no approval, no district procurement.
          Download the app, bring your own AI, and start planning."
```

This replaces the current bare `tagline: "The teaching superapp"` in the download section.

---

## Section Ordering — Proposed vs. Current

| # | Current | Proposed |
|---|---------|----------|
| 1 | Hero | Hero *(rewritten)* |
| 2 | Philosophy (privacy) | **Why we built this** *(new)* |
| 3 | Features (ALIGN, PLAN, CREATE, RESEARCH, BUILD) | Philosophy (privacy) *(rewritten, educator-specific)* |
| 4 | Capabilities (agent features) | Features *(rewritten)* |
| 5 | Bring Your Own AI | **How it works** *(new)* |
| 6 | Install / Download | **Skills library** *(new)* |
| | | Capabilities *(keep as-is, it's good)* |
| | | Bring Your Own AI *(keep as-is)* |
| | | Install / Download *(CTA rewritten)* |

> [!IMPORTANT]
> The new ordering follows Claude's narrative arc: **Why → Trust → What → How → Depth → Pricing → CTA**. The current flat structure jumps from hero to privacy to features with no connective tissue.

---

## Summary of Changes

| Change | Type | Effort |
|--------|------|--------|
| Hero rewrite | Copy edit in [site.ts](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts) | Small |
| Features header subtext | Copy edit in [site.ts](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts) | Small |
| All 5 feature cards rewritten | Copy edit in [site.ts](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts) | Small |
| Philosophy items rewritten | Copy edit in [site.ts](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts) | Small |
| SEO title/description | Copy edit in [site.ts](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts) | Small |
| Download tagline | Copy edit in [site.ts](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts) | Small |
| "Why we built this" section | New type + data + component + page wiring | Medium |
| "How it works" section | New type + data + component + page wiring | Medium |
| "Skills library" section | New type + data + component + page wiring | Medium |
| Section reordering | Edit [AudienceLanding.astro](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/components/AudienceLanding.astro) | Small |

> [!TIP]
> All the "Small" changes can be done in a single edit to [site.ts](file:///Users/prashantbhudwal/Code/buddy/packages/site/src/content/site.ts). The "Medium" changes each need a new Astro component plus type/data additions.
