import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Hono } from "hono"
import { describeRoute, generateSpecs, resolver } from "hono-openapi"
import { MessageWithParts } from "@buddy/transcript-contract/message"
import { Session, SessionCreate, SessionStatus } from "@buddy/transcript-contract/session"
import { toOpenApiSchema } from "../../src/http/effect-schema"

async function transcriptSchemas() {
  const app = new Hono()
  for (const [path, schema] of [
    ["/message", MessageWithParts],
    ["/session", Session],
    ["/status", SessionStatus],
  ] as const) {
    app.get(
      path,
      describeRoute({
        responses: {
          200: {
            description: "Transcript",
            content: { "application/json": { schema: resolver(toOpenApiSchema(schema)) } },
          },
        },
      }),
      (c) => c.json({}),
    )
  }
  return (await generateSpecs(app)).components?.schemas
}

describe("transcript OpenAPI components", () => {
  test("keeps the named transcript components through Buddy's actual schema converter", async () => {
    const schemas = await transcriptSchemas()
    for (const name of [
      "Session",
      "SessionStatus",
      "Message",
      "Part",
      "TextPart",
      "ToolPart",
      "OutputFormat",
      "NoticePart",
      "CompactionPart",
    ]) {
      expect(schemas).toHaveProperty(name)
    }
  })

  test("describes JSON bodies: undefined optional keys are omitted, not null, and numbers are plain", async () => {
    const schemas = await transcriptSchemas()
    expect(schemas?.Session).toMatchObject({
      required: ["id", "projectID", "directory", "title", "time"],
      properties: {
        parentID: { anyOf: [{ type: "string" }] },
        time: {
          properties: { created: { type: "number" }, archived: { anyOf: [{ type: "number" }] } },
        },
        revert: {
          anyOf: [{ type: "object", properties: { partID: { anyOf: [{ type: "string" }] } } }],
        },
      },
    })
    expect(schemas?.AssistantMessage).toMatchObject({
      properties: {
        cost: { type: "number" },
        error: { anyOf: [{ $ref: "#/components/schemas/MessageError" }] },
        finish: { anyOf: [{ anyOf: [{ type: "string" }, { type: "null" }] }] },
      },
    })
  })

  test("validates JSON request bodies with the same optional-key rules as the contract", async () => {
    const body = toOpenApiSchema(Schema.optional(SessionCreate))["~standard"]
    expect(await body.validate({ title: "Notes" })).toEqual({ value: { title: "Notes" } })
    expect(await body.validate({ title: null })).toHaveProperty("issues")
  })
})
