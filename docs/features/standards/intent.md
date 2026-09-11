# Standards Intelligence — Intent

Buddy integrates standards frameworks (such as Common Core and state standards) as a **local standards intelligence layer**, not as a separate browsing mode or graph-exploration UI.

## Product Capabilities

Standards intelligence powers four core pedagogical workflows:

1. **Standards-Aware Goal Planning:** When a learner requests a broad or vague subject (e.g., "fractions" or "rigid motions"), Buddy resolves relevant standard nodes, derives testable operational goals, and annotates goals with standard references.
2. **Prerequisite Remediation:** When a learner struggles on a specific standard, Buddy traverses upstream prerequisite edges (`supports`, `buildsTowards`) to diagnose gaps and generate a targeted catch-up practice ladder.
3. **Granular Practice & Assessment:** Buddy uses fine-grained `LearningComponent` definitions under each standard to construct specific, teachable tasks, concept checks, and transfer problems.
4. **Crosswalk Translation:** Maps equivalent standard codes across different state jurisdictions (e.g., Texas TEKS to California CCSS).

### Prerequisite remediation ladder

When a learner is stuck, use the graph to identify a prerequisite and follow the product pattern **review prerequisite → guided practice → independent practice → quick check**. Record outcomes against existing Buddy goal IDs; do not create a separate graph-specific learning loop.

## Architecture & Data Strategy

- **Local Storage:** Packaged as a local SQLite database compressed with zstd (`learning-commons-knowledge-graph.db.zst`), queried via indexed lookups on startup.
- **Local Tool Primitives:** Core feature tools registered on the runtime:
  - `search_standards` — keyword and domain search
  - `get_standard` — lookup standard item and description by code/UUID
  - `get_learning_components` — retrieve granular sub-skills for a standard
  - `get_prerequisites` — traverse incoming dependency edges
  - `get_next_standards` — fetch subsequent progression standards
  - `get_crosswalk` — resolve equivalent standards across jurisdictions
  - `query_standards_sql` — execute direct SQL queries against local standards database

**Important rule: expose semantics, not SQL.** Prefer the named standards tools for learner-facing retrieval and orchestration. `query_standards_sql` is a shipped, read-only exception for advanced diagnostics and narrowly justified queries; its current row cap issue is tracked as **L08-C06** (the cap is applied after SQLite materialization), so callers must keep queries bounded.
- **Artifact Integration:** Standard metadata (`standardCode`, `standardJurisdiction`, `learningComponentRefs`) attaches as optional fields on native Buddy `GoalArtifact` records.
- **Non-Goals:** No raw graph-visualization UI, no external hosted MCP dependencies in core flows, and no separate learner state outside canonical Buddy artifacts.

## License, attribution, and dataset shape

The packaged graph is Learning Commons Knowledge Graph data, not a Buddy-authored curriculum library.

**License (from upstream `knowledge-graph/LICENSE.md`):**

- Repository code: MIT
- Graph dataset: **CC BY 4.0** (attribution required)
- Some underlying learning progressions: CC0

Buddy may transform and package the data as local SQLite (`learning-commons-knowledge-graph.db.zst`). Attribution for CC BY 4.0 content remains required. The pack is a **map of learning structure** (standard statements, skill components, hierarchy and crosswalks). It does **not** include full lesson bodies, question banks, worksheets, or ready-made assessment item text.

**Relationship taxonomy (dataset edges, not just product verbs):**

| Edge | Role |
| --- | --- |
| `hasChild` | Standards hierarchy |
| `supports` | Learning component → standard |
| `hasEducationalAlignment` | Lesson / activity / assessment / course → standard |
| `hasStandardAlignment` | State-to-state or framework crosswalks |
| `buildsTowards` | Prerequisite / progression |
| `hasPart`, `hasDependency`, `hasReference`, `relatesTo` | Additional structural links |

Entity counts and a neighborhood trace (`HSG-CO.B.6`) are in [docs/learning/commons/knowledge-graph-data-summary.md](../../learning/commons/knowledge-graph-data-summary.md).

**Grade fields:** origin data often stores `gradeLevel` as a stringified JSON array (for example `"[\"6\"]"`). The pack builder stores that string as-is (`packages/buddy/script/knowledge-graph/build.ts`). Query-time parsing happens in `parseGradeLevels` (`packages/buddy/src/learning/features/standards/service.ts`). Do not claim grades are normalized at import.

## Rejected alternative: hosted Learning Commons MCP

Learning Commons offers a hosted MCP at `https://kg.mcp.learningcommons.org/mcp` (private beta / early access, `x-api-key`). Buddy does **not** use it in core flows.

| Concern | Hosted MCP | Buddy choice |
| --- | --- | --- |
| Location | Cloud | Local SQLite on the machine |
| Offline | Requires internet | Packaged database |
| Secrets | External API key | None for graph lookup |
| Stability | Breaking beta changes | Buddy-controlled pack |
| Privacy | Queries leave the machine | Queries stay local |

The hosted tools prove the **value** of lookup, skill decomposition, and prerequisite tracing. Buddy ships the same capabilities as **local** tools (`search_standards`, `get_standard`, `get_learning_components`, `get_prerequisites`, `get_next_standards`, `get_crosswalk`, `query_standards_sql`). Design notes that compared hosted MCP to a local tool list: [docs/learning/commons/knowledge-graph-mcp-analysis.md](../../learning/commons/knowledge-graph-mcp-analysis.md).

## Context injection policy

Do **not** inject standards context into every conversation by default. Retrieve standards only when the learner's goal, topic, prerequisite struggle, practice, assessment, or crosswalk request makes it relevant; keep unrelated turns free of graph context and token cost.
