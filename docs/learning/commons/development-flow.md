# Knowledge Graph Integration - Complete Development Flow

## Phase 1: Data Infrastructure

### Step 1: Create Import Pipeline
Location: `scripts/knowledge-graph/`

Create scripts to download KG JSONL, filter to scope (Multi-State Math + ELA), validate, and output filtered JSONL.

Key decisions:
- Jurisdictions: Multi-State only initially
- Subjects: Math + ELA
- Node types: StandardsFrameworkItem, LearningComponent
- Relationships: supports, hasChild, buildsTowards, hasStandardAlignment

### Step 2: Build SQLite Converter
Location: `scripts/knowledge-graph/import.ts`

Convert filtered JSONL to SQLite with tables:
- standards: id, code, description, subject, jurisdiction, grade_level, case_uuid
- learning_components: id, description, subject
- relationships: label, source_id, target_id

### Step 3: Add Compression
Location: `scripts/knowledge-graph/compress.ts`

Compress SQLite with zstd. Output: `kg-ccss-core-v1.7.0.db.zst`

### Step 4: Create Version Manifest
Location: `scripts/knowledge-graph/manifest.json`

Track version, scope, checksums, build date, row counts.

## Phase 2: Runtime Data Layer

### Step 5: Create KG Service Module
Location: `packages/buddy/src/learning/knowledge-graph/`

Files:
- service.ts - main service class
- types.ts - TypeScript definitions
- connection.ts - database connection
- queries.ts - SQL builders

Responsibilities: open SQLite on startup, provide query methods, normalize results.

### Step 6: Implement Query Methods

In service.ts implement:
1. searchStandards(query, filters) - full-text search
2. getStandardByCode(code) - exact + fuzzy match
3. getLearningComponents(standardId) - via supports relationship
4. getPrerequisites(standardId, depth) - traverse buildsTowards backward
5. getNextStandards(standardId) - traverse buildsTowards forward
6. getCrosswalk(standardId, targetJurisdiction) - via hasStandardAlignment

### Step 7: First-Run Setup
Location: `packages/buddy/src/learning/knowledge-graph/setup.ts`

Check local DB, decompress from assets if needed, show progress, verify integrity, handle updates.

## Phase 3: Tool Layer

### Step 8: Create Tool Definitions
Location: `packages/buddy/src/learning/knowledge-graph/tools/`

Files:
- search.ts - search_standards tool
- get.ts - get_standard tool
- components.ts - get_learning_components tool
- prereqs.ts - get_prerequisites tool
- next.ts - get_next_standards tool
- crosswalk.ts - get_crosswalk tool
- tools.ts - tool group export

Pattern: createBuddyTool with description, parameters schema, execute function.

### Step 9: Register in Catalog
Location: `packages/buddy/src/learning/tools/tool-catalog.ts`

Import KG tools, add to learningToolGroups as knowledgeGraph, follow existing group patterns.

### Step 10: Add Permissions
Define patterns: knowledge_graph_search (allow), knowledge_graph_read (allow). No write needed.

## Phase 4: Goal System Integration

### Step 11: Extend Goal Schema
Location: `packages/buddy/src/learning/learner-model/repository/types.ts`

Add to GoalArtifactSchema:
- standardRef: { code, jurisdiction, caseIdentifierUUID, subject } (optional)
- learningComponentIds: string[] (default [])

### Step 12: Modify Goal Writer
Location: `packages/buddy/src/learning/curriculum/goals/writer.agent.ts`

If learner mentions topic without clear goal: search standards, present options or auto-select, use components to inform goal writing, store standard reference.

### Step 13: Update Goal Display
Show standard code badge if present, link to prerequisite view, keep subtle.

## Phase 5: Practice Integration

### Step 14: Enhance Practice Tool
Location: `packages/buddy/src/learning/capabilities/pedagogy/tools/`

Check if goal has learningComponentIds, fetch descriptions, include in prompt context, generate targeted tasks.

### Step 15: Add Prerequisite Practice
Location: `packages/buddy/src/learning/intents/practice/capabilities.ts`

When learner stuck: get prerequisites for current goal's standard, check learner evidence, generate remediation if gaps found.

### Step 16: Update Question Sets
Location: `packages/buddy/src/learning/capabilities/question-set/service.ts`

If goal has standard reference: fetch components, distribute questions across them, tag with component IDs.

## Phase 6: Assessment Integration

### Step 17: Enhance Mastery Checks
Location: `packages/buddy/src/learning/intents/assess/capabilities.ts`

Use components for varied mastery checks, cross-reference demonstrated vs required, generate transfer tasks combining components.

### Step 18: Update Evidence Recording
Location: `packages/buddy/src/learning/learner-model/workflows/record-assessment.ts`

Track which components were assessed, update mastery status, inform recommendations.

## Phase 7: Learner Model

### Step 19: Add Progress Tracking
Location: `packages/buddy/src/learning/learner-model/projections/snapshot.ts`

Include in snapshot: standards touched, progress by standard, prerequisite readiness, suggested next standards.

### Step 20: Create Progression View (Optional)
Visualize: current standard in progression, prerequisites status, next standards, cross-state equivalents.

## Phase 8: Persona Integration

### Step 21: Update Math Buddy
Location: `packages/buddy/src/learning/personas/math-buddy/agent.ts`

Add tool permissions: search_standards, get_standard, get_learning_components, get_prerequisites (all allow).

### Step 22: Update General Buddy
Location: `packages/buddy/src/learning/personas/buddy/agent.ts`

Add same tool permissions, set defaults to allow.

### Step 23: Configure Code Buddy (Optional)
Location: `packages/buddy/src/learning/personas/code-buddy/agent.ts`

Consider enabling for CS curriculum alignment, AP CS standards, programming progressions.

## Phase 9: UI Integration

### Step 24: Goal Card Badges
Show standard code subtly, link to prerequisites, do not dominate UI.

### Step 25: Add Prerequisite Warnings
When relevant: show missing prerequisites, suggest review before advancing.

### Step 26: Progress Indicators
Show mastery at component level, not just goal level.

### Step 27: Crosswalk UI (Optional)
For mobile students: show equivalent standards in other states.

## Phase 10: Testing and Polish

### Step 28: Unit Tests
Test each query method, test tool execution, test edge cases (missing data, malformed codes).

### Step 29: Integration Tests
Test full flow: topic search -> goal creation -> practice generation -> assessment -> evidence recording.

### Step 30: Performance Tests
Measure query latency (target under 50ms), test with full dataset, optimize slow queries.

### Step 31: Error Handling
Handle missing standards gracefully, handle network failures during first-run setup, provide clear error messages.

### Step 32: Documentation
Document tools for agent developers, add inline code comments, update architecture docs.

## Key Principles Throughout

1. Local-first - no cloud dependencies in core flows
2. Invisible - learner does not need to know graph exists
3. Optional - standard references on goals are optional
4. Incremental - add features gradually, validate value at each step
5. Backward compatible - existing goals/practice continue working without standard refs

## File Locations Reference

New code goes in:
- `packages/buddy/src/learning/knowledge-graph/` - core service
- `packages/buddy/src/learning/knowledge-graph/tools/` - tool definitions
- `scripts/knowledge-graph/` - data pipeline
- `packages/buddy/assets/knowledge-graph/` - compressed data files

Modify existing:
- `packages/buddy/src/learning/tools/tool-catalog.ts` - add tool group
- `packages/buddy/src/learning/learner-model/repository/types.ts` - extend schema
- `packages/buddy/src/learning/curriculum/goals/writer.agent.ts` - use standards
- `packages/buddy/src/learning/personas/*/agent.ts` - add permissions
- `packages/buddy/src/learning/capabilities/pedagogy/tools/` - enhance practice
- `packages/buddy/src/learning/capabilities/question-set/service.ts` - use components
- `packages/buddy/src/learning/intents/practice/capabilities.ts` - prerequisite flow
- `packages/buddy/src/learning/intents/assess/capabilities.ts` - mastery checks
- `packages/buddy/src/learning/learner-model/workflows/` - record metadata
- `packages/buddy/src/learning/learner-model/projections/snapshot.ts` - progress view
