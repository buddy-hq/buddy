import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import z from "zod"
import { createConfigConformanceHarness, type ConfigConformanceHarness } from "./harness-config"

let harness: ConfigConformanceHarness
const sessionSchema = z.object({ id: z.string() })

describe("References port conformance", () => {
  beforeAll(async () => {
    harness = await createConfigConformanceHarness()
  })
  afterAll(async () => {
    await harness?.[Symbol.asyncDispose]()
  })

  test("the reference catalog describes available notebook documentation", async () => {
    const notebook = await harness.notebook("reference-catalog")
    const referencePath = await harness.addReferenceFixture(notebook.directory)
    const catalog = await notebook.json(
      "/reference",
      z.object({
        location: z.object({ directory: z.string() }),
        data: z.array(
          z.object({
            name: z.string(),
            path: z.string(),
            description: z.string().optional(),
            source: z.object({ type: z.string(), path: z.string() }),
          }),
        ),
      }),
    )
    expect(catalog.location.directory).toBe(notebook.directory)
    expect(catalog.data).toContainEqual({
      name: "docs",
      path: referencePath,
      description: "Shared conformance documentation",
      source: { type: "local", path: referencePath },
    })
  })

  test("current and legacy composer references expand to the same model input", async () => {
    const notebook = await harness.notebook("reference-expansion", {
      agent: {
        "reference-reader": {
          name: "Reference reader",
          mode: "primary",
          prompt: "Read the configured reference documentation.",
          model: "scripted/chat",
        },
      },
    })
    const referencePath = await harness.addReferenceFixture(notebook.directory)
    const prompts: string[] = []
    for (const type of ["opencode-reference", "reference"]) {
      const session = await notebook.json("/session", sessionSchema, {
        body: { title: "Reference expansion" },
      })
      await notebook.json(`/session/${session.id}/message`, z.json(), {
        body: {
          content: "reference-expanded-prompt",
          agent: "reference-reader",
          parts: [{ type, name: "docs", path: referencePath }],
        },
      })
      const request = harness.latestRequest("reference-expanded-prompt")
      expect(request.prompt).toContain("conformance-guide.md")
      expect(request.prompt).toContain("shared-docs")
      prompts.push(request.prompt)
    }
    expect(prompts[1]).toBe(prompts[0])
  })

  test("an unavailable composer reference returns a client error before admitting the prompt", async () => {
    const notebook = await harness.notebook("reference-unavailable")
    const referencePath = await harness.addReferenceFixture(notebook.directory)
    const session = await notebook.json("/session", sessionSchema, {
      body: { title: "Missing reference" },
    })
    const response = await notebook.request(`/session/${session.id}/message`, {
      body: {
        content: "reference-missing-prompt",
        parts: [{ type: "opencode-reference", name: "missing", path: referencePath }],
      },
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: expect.any(String) })
    expect(await notebook.json(`/session/${session.id}/message`, z.array(z.json()))).toEqual([])
  })
})
