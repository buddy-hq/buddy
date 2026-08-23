# Knowledge Graph Data Summary

## What It Is

Learning Commons Knowledge Graph is a local graph dataset exported as two JSONL files:

- `knowledge-graph/nodes.jsonl` (`242 MB`)
- `knowledge-graph/relationships.jsonl` (`403 MB`)

Total raw size: about `645 MB`.

Each line is one JSON object.

- `nodes.jsonl`: entities
- `relationships.jsonl`: edges between entities

## What Data Is Present

Main node types we verified:

- `StandardsFrameworkItem` (`222,241`): individual standards and standard groupings
- `LearningComponent` (`4,069`): granular skills
- `Lesson` (`2,550`): lesson metadata
- `Activity` (`8,173`): activity metadata
- `Assessment` (`4,516`): assessment metadata
- `LessonGrouping` (`764`): curriculum grouping units
- `StandardsFramework` (`212`): full standards frameworks
- `Course` (`18`): course metadata

Important relationship types we verified:

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

- full standard descriptions
- learning component descriptions
- curriculum titles and metadata
- hierarchy and alignment relationships
- crosswalks between standards
- some progression/prerequisite links

Not included directly:

- full lesson bodies
- question banks
- worksheets
- assessment item text
- ready-made practice problems

So this is mainly a **map of learning structure**, not a full curriculum content library.

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

Again, title + metadata, not actual problems.

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

This shows the graph's value: one standard can connect to hierarchy, granular skills, prerequisite chains, equivalent state standards, and curriculum alignments.

## Jurisdictions and Grades

Jurisdictions include all 50 states, `Washington, D.C.`, and `Multi-State`.

`Multi-State` includes major shared frameworks we verified such as:

- `Common Core State Standards for Math`
- `Common Core State Standards for ELA`
- `Next Generation Science Standards`
- WIDA frameworks

Grades present:

- `PK`, `K`, `1`-`12`
- `elementary_school`
- `middle_school`
- `high_school`

Note: grade arrays are often stored as strings like `"[\"6\"]"` and may need normalization on import.

## License

From `knowledge-graph/LICENSE.md`:

- repo code: `MIT`
- graph data: `CC BY 4.0`
- some underlying learning progressions: `CC0`

Practical takeaway:

- you can use and transform the data
- attribution is required for CC BY content
- the repo also references Learning Commons Terms of Use

## What This Could Help Buddy Do

Useful for Buddy if you want:

- standards-aware goal planning
- prerequisite-aware practice generation
- skill decomposition from standards to learning components
- cross-state standard mapping
- progress tracking by standard / subskill

Not useful as a direct source of:

- complete lessons
- prewritten assessments
- question banks

Best product use: combine this graph with Buddy's own generation and learner state.
