# Knowledge Graph MCP Analysis

Status: Historical design notes plus the still-current rejection of hosted MCP. Canonical product write-up: [docs/features/standards/intent.md](../../features/standards/intent.md). The TypeScript tool list below is a **design-time sketch that matches the shipped local tools**; do not treat it as an unimplemented backlog.

## What Learning Commons Offers

Learning Commons provides a **hosted MCP server** at:
```
https://kg.mcp.learningcommons.org/mcp
```

**Status:** Private beta / Early access (breaking changes expected)

**Authentication:** API key via `x-api-key` header

## Their MCP Tools

| Tool | Input | Output | Use Case |
|------|-------|--------|----------|
| **Find standard statement** | `statementCode`, `jurisdiction?` | Standard text + metadata | Resolve code to full description |
| **Find learning components** | `caseIdentifierUUID` | List of granular skills | Break standard into teachable skills |
| **Find learning progressions** | `caseIdentifierUUID`, `direction` (backward/forward) | Prereqs or next standards | Trace learning pathway |

**Example query:**
```javascript
"I am a 4th grade teacher in California. A new student is struggling with 4.OA.A.3. 
What skills are required for mastery and what unfinished learning should I address?"
```

The MCP server:
1. Resolves `4.OA.A.3` to the full standard
2. Gets learning components (granular skills)
3. Traces backward progressions (prerequisites)

## Why Buddy Should NOT Use Their Hosted MCP

| Concern | Their MCP | Buddy's Constitution |
|---------|-----------|---------------------|
| **Location** | Cloud-hosted | "Local — runs on your machine" |
| **Offline** | ❌ Requires internet | All data stays local |
| **Dependencies** | ❌ External API key | No external service required |
| **Stability** | ❌ Early access, breaking changes | Stable, controlled |
| **Privacy** | ❌ Queries sent to their servers | Private, never leaves machine |

**Verdict:** Using their hosted MCP violates Buddy's core "Local" principle.

## What Buddy Built Instead (local tools)

**Historical heading in the original draft was "What Buddy Should Build Instead."** The local tools listed here shipped. Hosted MCP remains rejected.

### Core Tools (same functionality as hosted MCP, local SQLite)

| Tool | Input | Output | Improvement Over Theirs |
|------|-------|--------|------------------------|
| `get_standard` | `code` | Full standard details | Fuzzy matching on codes |
| `get_learning_components` | `code` | Granular skills | Same, but local |
| `get_prerequisites` | `code`, `depth?` | Prerequisite chain | Configurable depth (1-3 levels) |
| `get_next_standards` | `code` | Standards this leads to | Their "forward" progression |

### Enhanced Tools (Better UX)

| Tool | Input | Output | Why Better |
|------|-------|--------|------------|
| `search_standards` | `query`, `subject?`, `grade?` | Matching standards | Natural language, not just exact codes |
| `get_crosswalk` | `code`, `target_jurisdiction?` | Equivalent standards | They don't expose this; crucial for mobile students |

## Tool Interface Design

```typescript
// Buddy Knowledge Graph Tools
const knowledgeGraphTools = [
  {
    name: "search_standards",
    description: `Find educational standards by keyword, subject, grade, or jurisdiction.
      Use when the user mentions a topic like "fractions" or "linear equations"
      but hasn't specified an exact standard code.`,
    parameters: {
      query: "string (e.g., 'fractions', 'linear equations')",
      subject: "string? (e.g., 'Mathematics', 'English Language Arts')",
      grade: "string? (e.g., '6', '9-12')",
      jurisdiction: "string? (e.g., 'Multi-State', 'California')"
    }
  },
  
  {
    name: "get_standard",
    description: `Get full details of a specific standard by its code.
      Use when the user provides an exact standard code like "6.NS.B.4".`,
    parameters: {
      code: "string (e.g., '6.NS.B.4', 'HSG-CO.B.6')"
    }
  },
  
  {
    name: "get_prerequisites",
    description: `Get prerequisite standards and skills for a target standard.
      Use when the user is struggling with a topic and needs to review foundations.
      Set depth=2 or 3 to get deeper prerequisite chains.`,
    parameters: {
      code: "string",
      include_learning_components: "boolean (default: true)",
      depth: "number (1-3, default: 1)"
    }
  },
  
  {
    name: "get_learning_components",
    description: `Get granular, teachable skills that make up a standard.
      Use to create targeted practice problems or identify specific skill gaps.`,
    parameters: {
      code: "string"
    }
  },
  
  {
    name: "get_crosswalk",
    description: `Find equivalent standards in other states/jurisdictions.
      Use when a student moved from another state or needs to align curricula.
      Leave target_jurisdiction empty to see all equivalents.`,
    parameters: {
      code: "string",
      target_jurisdiction: "string? (e.g., 'Texas', 'California')"
    }
  }
];
```

## Usage Examples

### Scenario 1: "I want to learn fractions"

**Agent reasoning:**
1. User mentions topic but no code → `search_standards`
2. Call: `search_standards(query: "fractions", subject: "Mathematics")`
3. Returns: `4.NF.A.1`, `5.NF.A.1`, `5.NF.B.4`, etc.
4. Agent presents options, user picks `5.NF.A.1`
5. Call: `get_learning_components(code: "5.NF.A.1")`
6. Agent generates practice for specific skills

### Scenario 2: "I'm stuck on 6.NS.B.4"

**Agent reasoning:**
1. User provides exact code → `get_prerequisites`
2. Call: `get_prerequisites(code: "6.NS.B.4", depth: 2)`
3. Returns chain: `6.NS.B.4` → `4.OA.B.4` → `3.OA.C.7`
4. Agent identifies gap at `4.OA.B.4` (factors/multiples)
5. Agent generates remediation practice for that prerequisite

### Scenario 3: "I learned math in Texas, now I'm in California"

**Agent reasoning:**
1. Cross-state mapping needed → `get_crosswalk`
2. Call: `get_crosswalk(code: "TEKS.6.2", target_jurisdiction: "California")`
3. Returns: `6.NS.B.4` (CA equivalent)
4. Agent can now reference the correct standard for CA curriculum

## Implementation Path

**Option A: Direct tools (shipped).** Query local SQLite. No hosted MCP. Tools registered on the Buddy runtime (`packages/buddy/src/learning/features/standards/tools/`).

**Option B: Local MCP server wrapping SQLite (not shipped).** Interoperability later if needed.

## Key Insight

Learning Commons' MCP proves the **value of the tools** — standards lookup, skill decomposition, prerequisite tracing.

Buddy ships those capabilities against the **local** packaged graph, not the hosted service.

**Result:** Same lookup/progression/crosswalk jobs, local and private.
