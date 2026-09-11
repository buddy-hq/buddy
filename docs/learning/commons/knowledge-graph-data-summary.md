# Knowledge Graph Data Summary

Status: Dataset reference for the local standards pack. Product intent, license, MCP rejection, and grade-parsing truth: [docs/features/standards/intent.md](../../features/standards/intent.md).

## What It Is

Learning Commons Knowledge Graph is a local graph dataset exported as two JSONL files:

- `knowledge-graph/nodes.jsonl` (`242 MB`)
- `knowledge-graph/relationships.jsonl` (`403 MB`)

Total raw size: about `645 MB`.

Each line is one JSON object.

- `nodes.jsonl`: entities
- `relationships.jsonl`: edges between entities

## What Data Is Present

Main node types verified:

- `StandardsFrameworkItem` (`222,241`): individual standards and standard groupings
- `LearningComponent` (`4,069`): granular skills
- `Lesson` (`2,550`): lesson metadata
- `Activity` (`8,173`): activity metadata
- `Assessment` (`4,516`): assessment metadata
- `LessonGrouping` (`764`): curriculum grouping units
- `StandardsFramework` (`212`): full standards frameworks
- `Course` (`18`): course metadata

Important relationship types verified:

- `hasChild` (`222,538`): standards hierarchy
- `supports` (`74,658`): learning component -> standard
- `hasEducationalAlignment` (`52,807`): lesson/activity/assessment/course -> standard
- `hasStandardAlignment` (`20,548`): state-to-state or framework crosswalks
- `hasPart` (`17,373`)
- `buildsTowards` (`757`): prerequisite/progression links
- `hasDependency` (`209`)
- `hasReference` (`472`)
- `relatesTo` (`284`)

## What Is Directly Included

Included directly:

- Full standard descriptions
- Learning component descriptions
- Curriculum titles and metadata
- Hierarchy and alignment relationships
- Crosswalks between standards
- Progression and prerequisite links

Not included directly:

- Full lesson bodies
- Question banks
- Worksheets
- Assessment item text
- Ready-made practice problems

So this is mainly a **map of learning structure**, not a full curriculum content library.

## Packaging Evidence (retained benchmark)

The original packaging analysis measured the dataset snapshot above. These figures are evidence for the packaging decision, not a live import pipeline; repeat the benchmark when the source snapshot changes.

### Full JSONL compression

| Method | Size | % of original |
| --- | ---: | ---: |
| gzip -6 | 49.3 MB | 7.6% |
| **zstd -3** | **44.6 MB** | **6.9%** |
| zstd -6 | 41.2 MB | 6.4% |
| zstd -9 | 38.3 MB | 5.9% |
| zstd -19 | 15.5 MB | 2.4% |
| xz | 32.5 MB | 5.0% |

### zstd levels for `nodes.jsonl`

| Level | Size | Time profile |
| ---: | ---: | --- |
| -3 | 22.8 MB | Fastest |
| -6 | 20.8 MB | Balanced |
| -9 | 19.3 MB | Good |
| -12 | 18.9 MB | Slower |
| -15 | 18.5 MB | Slower |
| -19 | 15.5 MB | Slowest |

### Filtered essentials

Filtering to standards and learning components measured:

| Format | Size |
| --- | ---: |
| Raw JSONL | 226 MB |
| zstd -3 | 22.0 MB |
| zstd -6 | 20.1 MB |
| zstd -9 | 18.6 MB |

The filtered pack retained an estimated **97% of useful data at 35% of the size** of the source snapshot.

### SQLite packaging

| Format | Size |
| --- | ---: |
| Raw SQLite | 152 MB |
| gzip | 50.7 MB |
| **zstd -3** | **44.8 MB** |
| zstd -9 | 40.1 MB |
| xz | 30.3 MB |

The indexed SQLite benchmark included:

- `idx_standards_code`
- `idx_standards_jurisdiction`
- `idx_standards_subject`
- `idx_rel_source`
- `idx_rel_target`
- `idx_rel_label`

### Shipping options considered

1. **Minimal:** Ship only CCSS Math + ELA (`Multi-State`), estimated **5–10 MB compressed**. Small and useful for an MVP, but narrower coverage.
2. **Core (recommended):** Ship all standards and learning components as a zstd-compressed SQLite pack, about **40 MB download** and **152 MB locally** with indexes. This balances coverage, query speed, and footprint.
3. **Full dataset:** Ship all curriculum metadata as zstd-compressed JSONL, about **38 MB compressed** and **645 MB expanded**. Use only if broad curriculum alignment becomes a requirement.
4. **Modular:** Ship a 5–10 MB CCSS Math base pack and downloadable subject/jurisdiction extensions. This improves initial size at the cost of pack lifecycle and UX complexity.

**Bottom line:** Buddy should use **SQLite for indexed local queries and zstd for distribution**, with the core filtered pack as the default production balance. gzip is more universal, while xz is smaller but slower; neither changes the recommendation.

## Example Node Types

### 1. Standard

Example: `6.NS.B.4` (Common Core Math / `Multi-State`)

> Find the greatest common factor of two whole numbers less than or equal to 100 and the least common multiple of two whole numbers less than or equal to 12. Use the distributive property to express a sum of two whole numbers 1-100 with a common factor as a multiple of a sum of two whole numbers with no common factor.

Key fields present:

- `statementCode`
- `description`
- `gradeLevel`
- `academicSubject`
- `jurisdiction`
- `caseIdentifierUUID`
- `caseIdentifierURI`

### 2. Learning Component

Example:

> Use models, including number lines, to add integers between -20 and 20

These are the smaller skills that support standards.

### 3. Lesson

Example lesson metadata:

- `name`: `Connecting Similarity and Transformations`
- `courseCode`: `im360:Math2`
- `ordinalName`: `Lesson 6`
- `timeRequired`: `PT45M`

This is metadata only, not the full lesson content.

### 4. Activity

Example activity metadata:

- `name`: `Notice and Wonder: Water`
- `courseCode`: `im360:Acc6`
- `ordinalName`: `Activity 1`
- `timeRequired`: `PT5M`

### 5. Assessment

Example assessment metadata:

- `name`: `Practice Problems`
- `courseCode`: `im360:3`
- `educationalUse`: `assessment`

Title and metadata, not actual problems.

### 6. Course

Example course metadata:

- `name`: `Grade 2`
- `courseCode`: `im360:2`
- includes a course description / big ideas summary

## Example: One Standard's Full Neighborhood

Example standard: `HSG-CO.B.6`

> Use geometric descriptions of rigid motions to transform figures and to predict the effect of a given rigid motion on a given figure; given two figures, use the definition of congruence in terms of rigid motions to decide if they are congruent.

Verified connected data:

- Parent:
  - `HSG-CO.B` -> `Understand congruence in terms of rigid motions`
- Prerequisites that build toward it:
  - `8.G.A.2`
  - `HSG-CO.A.5`
- Standards it builds toward:
  - `HSG-CO.B.7`
  - `HSG-CO.B.8`
  - `HSG-CO.C.9`
- Learning components:
  - `Given two figures, use the definition of congruence in terms of rigid motions to decide if they are congruent`
  - `Use descriptions of rigid motion and transformed geometric figures to predict the effects rigid motion has on figures in the coordinate plane`
- State crosswalks:
  - Mississippi: `G-CO.6`
  - New Jersey: `G.CO.B.6`
  - Wisconsin: `M.9-12.G.CO.B.6`
  - West Virginia: `M.GHS.10`
  - Iowa: `G.G-CO.B.6`
  - Utah: `G.CO.6`
  - Kansas: `G.CO.5`
  - Kentucky: `KY.HS.G.4.c`
- Curriculum alignments:
  - Illustrative Mathematics lessons aligned via `hasEducationalAlignment`

This demonstrates the graph structure: one standard connects hierarchy, granular skills, prerequisite chains, equivalent state standards, and curriculum alignments.

## Jurisdictions and Grades

Jurisdictions include all 50 states, `Washington, D.C.`, and `Multi-State`.

`Multi-State` includes major shared frameworks:

- `Common Core State Standards for Math`
- `Common Core State Standards for ELA`
- `Next Generation Science Standards`
- WIDA frameworks

Grades present: `PK`, `K`, `1`-`12`, `elementary_school`, `middle_school`, `high_school`.

Note: origin `gradeLevel` values are often stringified JSON arrays such as `"[\"6\"]"`. The SQLite pack stores that string as-is at import (`packages/buddy/script/knowledge-graph/build.ts`). `parseGradeLevels` in `packages/buddy/src/learning/features/standards/service.ts` parses the string **at query time**. Do not claim import-time normalization.

## License & Legal Attribution

From `knowledge-graph/LICENSE.md`:

- Repository code: `MIT`
- Graph dataset: `CC BY 4.0` (Creative Commons Attribution 4.0 International)
- Underlying learning progressions: `CC0` (Public Domain)

**Legal and Operational Takeaway:**
- Data can be transformed and packaged into local SQLite formats (`learning-commons-knowledge-graph.db.zst`).
- **Attribution is legally required for CC BY 4.0 content.**
- Complies with Learning Commons Terms of Use for local desktop packaging.

## Role in Buddy

Used for:
- Standards-aware goal planning
- Prerequisite-aware practice generation
- Skill decomposition from standards to learning components
- Cross-state standard mapping
- Progress tracking by standard and subskill

**Not a content library:** the graph is not a source of complete lessons, prewritten assessments, or question banks. Combine it with Buddy-generated practice and learner state. See also "Not included directly" above.
