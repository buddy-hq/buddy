import { describe, expect, test } from "bun:test"
import { preflightMermaidSource } from "../../src/learning/features/diagrams/service/preflight"

describe("Mermaid preflight", () => {
  test("extracts fenced mermaid from surrounding prose and canonicalizes flowchart labels", () => {
    const result = preflightMermaidSource(`
Before the diagram.

\`\`\`mermaid
graph TD
Query['searchLearnerMemory(query)']
\`\`\`

After the diagram.
`)

    expect(result.diagramType).toBe("flowchart")
    expect(result.source).toBe('graph TD\nQuery["searchLearnerMemory(query)"]')
    expect(result.repairs.map((repair) => repair.code)).toEqual([
      "trimmed_wrapping_prose",
      "stripped_fence",
      "converted_flowchart_single_quoted_label",
    ])
  })

  test("quotes er relationship labels and normalizes timeline periods", () => {
    const er = preflightMermaidSource("erDiagram\nA ||--o{ B : one to many")
    expect(er.source).toBe('erDiagram\nA ||--o{ B : "one to many"')
    expect(er.repairs.map((repair) => repair.code)).toContain("quoted_er_relationship_label")

    const timeline = preflightMermaidSource('timeline\n"2025:Q1" : Started')
    expect(timeline.source).toBe("timeline\n2025.Q1 : Started")
    expect(timeline.repairs.map((repair) => repair.code)).toContain("normalized_timeline_period")

    const gitGraph = preflightMermaidSource("gitgraph\ncommit\ncommit")
    expect(gitGraph.source).toBe("gitGraph\ncommit\ncommit")
    expect(gitGraph.diagramType).toBe("gitGraph")
    expect(gitGraph.repairs.map((repair) => repair.code)).toContain("canonicalized_header")
  })

  test("keeps nested mindmap branches instead of trimming them as prose", () => {
    const result = preflightMermaidSource(`mindmap
  root((Buddy))
    Learning
      Goals
      Practice
      Assessment
    Content
      Resources
      Diagrams
      Flashcards`)

    expect(result.source).toBe(`mindmap
  root((Buddy))
    Learning
      Goals
      Practice
      Assessment
    Content
      Resources
      Diagrams
      Flashcards`)
    expect(result.repairs.map((repair) => repair.code)).not.toContain("trimmed_wrapping_prose")
  })

  test("treats unknown Mermaid headers as diagram starts when the following lines look structural", () => {
    const result = preflightMermaidSource(`Before the diagram.

topology
    topic internet [
        [Internet]
    ]
    topic cloud [
        [[Cloud Services]]
    ]
    internet <--> cloud

After the diagram.`)

    expect(result.diagramType).toBe("topology")
    expect(result.source).toBe(`topology
    topic internet [
        [Internet]
    ]
    topic cloud [
        [[Cloud Services]]
    ]
    internet <--> cloud`)
    expect(result.repairs.map((repair) => repair.code)).toContain("trimmed_wrapping_prose")
  })

  test("renames colliding node ids without rewriting visible label text", () => {
    const result = preflightMermaidSource(`flowchart TD
subgraph G6[Group 6]
  A --> B
end
G6[depends on G6]
A --> G6`)

    expect(result.source).toContain("subgraph G6[Group 6]")
    expect(result.source).toContain("G6_node[depends on G6]")
    expect(result.source).toContain("A --> G6_node")
    expect(result.source).not.toContain("depends on G6_node")
    expect(result.repairs.map((repair) => repair.code)).toContain("renamed_subgraph_node_collision")
  })

  test("does not rewrite distinct hyphenated ids while repairing an exact collision", () => {
    const result = preflightMermaidSource(`flowchart TD
subgraph G6[Group 6]
  A --> B
end
G6[main]
G6-a[secondary]
A --> G6
A --> G6-a`)

    expect(result.source).toContain("G6_node[main]")
    expect(result.source).toContain("G6-a[secondary]")
    expect(result.source).toContain("A --> G6-a")
    expect(result.source).not.toContain("G6_node-a")
  })
})
