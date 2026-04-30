import path from "node:path"
import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { KnowledgeGraphService } from "../../src/learning/knowledge-graph/service"
import { KNOWLEDGE_GRAPH_DB_ENV } from "../../src/learning/knowledge-graph/constants"
import { ensureKnowledgeGraphToolsRegistered } from "../../src/learning/knowledge-graph/tools/register"
import { tmpdir } from "../helpers/tmpdir"
import { createToolContext, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"

function createFixtureDatabase(databasePath: string) {
  const database = new Database(databasePath)

  database.exec(`
    create table standards (
      id text primary key,
      code text,
      description text,
      subject text,
      jurisdiction text,
      grade_level text,
      case_uuid text
    );
    create table learning_components (
      id text primary key,
      description text,
      subject text
    );
    create table relationships (
      label text,
      source_id text,
      target_id text
    );
    create index idx_standards_code on standards(code);
    create index idx_standards_jurisdiction on standards(jurisdiction);
    create index idx_standards_subject on standards(subject);
    create index idx_rel_source on relationships(source_id);
    create index idx_rel_target on relationships(target_id);
    create index idx_rel_label on relationships(label);
  `)

  const insertStandard = database.query<
    never,
    [string, string, string, string, string, string, string]
  >(
    `
      insert into standards (id, code, description, subject, jurisdiction, grade_level, case_uuid)
      values (?, ?, ?, ?, ?, ?, ?)
    `,
  )
  const insertLearningComponent = database.query<never, [string, string, string]>(
    `
      insert into learning_components (id, description, subject)
      values (?, ?, ?)
    `,
  )
  const insertRelationship = database.query<never, [string, string, string]>(
    `
      insert into relationships (label, source_id, target_id)
      values (?, ?, ?)
    `,
  )

  insertStandard.run(
    "std_parent",
    "HSG-CO.B",
    "Understand congruence in terms of rigid motions",
    "Mathematics",
    "Multi-State",
    '["9","10","11","12"]',
    "uuid-parent",
  )
  insertStandard.run(
    "std_target",
    "HSG-CO.B.6",
    "Use geometric descriptions of rigid motions to transform figures.",
    "Mathematics",
    "Multi-State",
    '["9","10","11","12"]',
    "uuid-target",
  )
  insertStandard.run(
    "std_next_1",
    "HSG-CO.B.7",
    "Use the definition of congruence in terms of rigid motions.",
    "Mathematics",
    "Multi-State",
    '["9","10","11","12"]',
    "uuid-next-1",
  )
  insertStandard.run(
    "std_next_2",
    "HSG-CO.B.8",
    "Explain how the criteria for triangle congruence follow from rigid motions.",
    "Mathematics",
    "Multi-State",
    '["9","10","11","12"]',
    "uuid-next-2",
  )
  insertStandard.run(
    "std_prev_1",
    "8.G.A.2",
    "Understand that a two-dimensional figure is congruent to another if the second can be obtained from the first by a sequence of rotations, reflections, and translations.",
    "Mathematics",
    "Multi-State",
    '["8"]',
    "uuid-prev-1",
  )
  insertStandard.run(
    "std_prev_2",
    "HSG-CO.A.5",
    "Given a geometric figure and a rotation, reflection, or translation, draw the transformed figure using graph paper, tracing paper, or geometry software.",
    "Mathematics",
    "Multi-State",
    '["9","10","11","12"]',
    "uuid-prev-2",
  )
  insertStandard.run(
    "std_ca",
    "G-CO.6",
    "California equivalent for rigid motion congruence.",
    "Mathematics",
    "California",
    '["9","10","11","12"]',
    "uuid-ca",
  )
  insertStandard.run(
    "std_tx",
    "G.CO.5",
    "Texas equivalent for rigid motion congruence.",
    "Mathematics",
    "Texas",
    '["9","10","11","12"]',
    "uuid-tx",
  )
  insertStandard.run(
    "std_fraction",
    "3.NF.A.1",
    "Understand fractions as the quantity formed by equal parts of a whole.",
    "Mathematics",
    "Multi-State",
    '["3"]',
    "uuid-fraction",
  )

  insertLearningComponent.run(
    "lc_1",
    "Given two figures, use the definition of congruence in terms of rigid motions to decide if they are congruent.",
    "Mathematics",
  )
  insertLearningComponent.run(
    "lc_2",
    "Use descriptions of rigid motion and transformed geometric figures to predict the effects rigid motion has on figures in the coordinate plane.",
    "Mathematics",
  )

  insertRelationship.run("hasChild", "std_parent", "std_target")
  insertRelationship.run("buildsTowards", "std_prev_1", "std_target")
  insertRelationship.run("buildsTowards", "std_prev_2", "std_target")
  insertRelationship.run("buildsTowards", "std_target", "std_next_1")
  insertRelationship.run("buildsTowards", "std_target", "std_next_2")
  insertRelationship.run("supports", "lc_1", "std_target")
  insertRelationship.run("supports", "lc_2", "std_target")
  insertRelationship.run("hasStandardAlignment", "std_target", "std_ca")
  insertRelationship.run("hasStandardAlignment", "std_tx", "std_target")

  database.close()
}

describe("knowledge graph tools", () => {
  test("queries the local standards database and preserves graph directionality", async () => {
    await using project = await tmpdir({ git: true })
    const databasePath = path.join(project.path, "kg-test.db")
    createFixtureDatabase(databasePath)

    const service = new KnowledgeGraphService({
      databasePath,
    })

    const searchResults = service.searchStandards({
      query: "fractions",
      subject: "Mathematics",
    })
    expect(searchResults[0]?.code).toBe("3.NF.A.1")

    const coursePrefixResults = service.searchStandards({
      query: "HSG-CO",
      subject: "Mathematics",
    })
    expect(coursePrefixResults.map((entry) => entry.code)).toContain("HSG-CO.B.6")

    const standard = service.getStandard({
      code: "HSG-CO.B.6",
    })
    expect(standard.standard.code).toBe("HSG-CO.B.6")
    expect(standard.parents.map((entry) => entry.code)).toEqual(["HSG-CO.B"])

    const components = service.getLearningComponents({
      code: "HSG-CO.B.6",
    })
    expect(components).toHaveLength(2)

    const prerequisites = service.getPrerequisites({
      code: "HSG-CO.B.6",
      depth: 1,
    })
    expect(prerequisites.map((entry) => entry.code)).toEqual(["8.G.A.2", "HSG-CO.A.5"])

    const nextStandards = service.getNextStandards({
      code: "HSG-CO.B.6",
      depth: 1,
    })
    expect(nextStandards.map((entry) => entry.code)).toEqual(["HSG-CO.B.7", "HSG-CO.B.8"])

    const crosswalks = service.getCrosswalk({
      code: "HSG-CO.B.6",
    })
    expect(crosswalks.map((entry) => entry.jurisdiction)).toEqual(["California", "Texas"])

    const sqlRows = service.runSqlQuery({
      sql: "select code, jurisdiction from standards where jurisdiction = 'Texas'",
    })
    expect(sqlRows.rows).toEqual([
      {
        code: "G.CO.5",
        jurisdiction: "Texas",
      },
    ])

    expect(() =>
      service.runSqlQuery({
        sql: "insert into standards (id) values ('blocked')",
      }),
    ).toThrow("must be read-only")
  })

  test("registers first-class knowledge graph tools in the runtime", async () => {
    await using project = await tmpdir({ git: true })
    const databasePath = path.join(project.path, "kg-test.db")
    createFixtureDatabase(databasePath)

    const previous = process.env[KNOWLEDGE_GRAPH_DB_ENV]
    process.env[KNOWLEDGE_GRAPH_DB_ENV] = databasePath

    try {
      const result = await OpenCodeInstance.provide({
        directory: project.path,
        async fn() {
          await ensureKnowledgeGraphToolsRegistered(project.path)
          const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
          const searchTool = requireTool(tools, "search_standards")
          const getStandardTool = requireTool(tools, "get_standard")
          const prerequisitesTool = requireTool(tools, "get_prerequisites")
          const sqlTool = requireTool(tools, "query_standards_sql")
          const ctx = createToolContext({
            sessionID: "ses_kg",
            messageID: "msg_kg",
            agent: "buddy",
          })

          return {
            search: await searchTool.execute({ query: "fractions" }, ctx),
            standard: await getStandardTool.execute({ code: "HSG-CO.B.6" }, ctx),
            prerequisites: await prerequisitesTool.execute({ code: "HSG-CO.B.6" }, ctx),
            sql: await sqlTool.execute(
              { sql: "select code from standards order by code limit 1" },
              ctx,
            ),
          }
        },
      })

      expect(result.search.output).toContain("3.NF.A.1")
      expect(result.standard.output).toContain("HSG-CO.B.6")
      expect(result.prerequisites.output).toContain("8.G.A.2")
      expect(result.sql.output).toContain("3.NF.A.1")
    } finally {
      if (previous === undefined) {
        delete process.env[KNOWLEDGE_GRAPH_DB_ENV]
      } else {
        process.env[KNOWLEDGE_GRAPH_DB_ENV] = previous
      }
    }
  })
})
