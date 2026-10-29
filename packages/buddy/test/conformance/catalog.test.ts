import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import z from "zod"
import { createConfigConformanceHarness, type ConfigConformanceHarness } from "./harness-config"

let harness: ConfigConformanceHarness
const sessionSchema = z.object({ id: z.string() })
const json = z.json()

describe("Catalog port conformance", () => {
  beforeAll(async () => { harness = await createConfigConformanceHarness() })
  afterAll(async () => { await harness?.[Symbol.asyncDispose]() })

  test("listed personas are selectable and offer Buddy feature tools to the model", async () => {
    const notebook = await harness.notebook("personas", { agent: {
      buddy: { prompt: "conformance-persona-buddy-system" },
      "teaching-buddy": { prompt: "conformance-persona-teaching-buddy-system" },
    } })
    const personas = await notebook.json("/config/personas", z.array(z.object({ id: z.string(), label: z.string() })))
    expect(personas).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "buddy", label: "Buddy" }),
      expect.objectContaining({ id: "teaching-buddy", label: "Teaching Buddy" }),
    ]))
    const agents = await notebook.json("/config/agents", z.array(z.object({ name: z.string(), mode: z.string().optional() })))
    expect(agents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "buddy", mode: "primary" }),
      expect.objectContaining({ name: "teaching-buddy", mode: "primary" }),
      expect.objectContaining({ name: "question-set-author", mode: "subagent" }),
    ]))
    for (const persona of ["buddy", "teaching-buddy"]) {
      const session = await notebook.json("/session", sessionSchema, { body: { title: `Catalog ${persona}`, agent: persona } })
      const marker = `catalog-persona-${persona}`
      await notebook.json(`/session/${session.id}/message`, json, { body: { content: marker, persona } })
      expect(harness.latestRequest(marker).tools).toContain("render_mermaid")
      expect(harness.latestRequest(marker).tools).toContain("render_svg")
      expect(harness.latestRequest(marker).system).toContain(`conformance-persona-${persona}-system`)
    }
  })

  test("a configured agent can be listed and selected for a prompt", async () => {
    const notebook = await harness.notebook("configured-agent", { agent: { "conformance-tutor": { name: "Conformance tutor", mode: "primary", prompt: "conformance-agent-instructions", model: "scripted/chat" } } })
    const agents = await notebook.json("/config/agents", z.array(z.object({ name: z.string(), mode: z.string().optional() })))
    expect(agents).toContainEqual(expect.objectContaining({ name: "conformance-tutor", mode: "primary" }))
    const session = await notebook.json("/session", sessionSchema, { body: { title: "Configured agent", agent: "conformance-tutor" } })
    await notebook.json(`/session/${session.id}/message`, json, { body: { content: "catalog-configured-agent", agent: "conformance-tutor" } })
    expect(harness.latestRequest("catalog-configured-agent").system).toContain("conformance-agent-instructions")
  })

  test("installed skills and executable commands are discoverable through Buddy catalogs", async () => {
    const notebook = await harness.notebook("skills-and-commands")
    const skillRoot = await harness.addCatalogFixtures(notebook.directory)
    await notebook.json("/config", json, { method: "PATCH", body: { skills: { paths: [skillRoot] } } })
    const skills = await notebook.json("/skills", z.object({ installed: z.array(z.object({ name: z.string(), description: z.string(), enabled: z.boolean() })) }))
    expect(skills.installed).toContainEqual(expect.objectContaining({ name: "conformance-review", enabled: true }))
    const commands = await notebook.json("/command", z.array(z.object({ name: z.string(), source: z.string() })))
    expect(commands).toContainEqual(expect.objectContaining({ name: "conformance-review", source: "command" }))
  })

  test("a notebook tool policy changes advertised tools without affecting another notebook", async () => {
    const restricted = await harness.notebook("restricted", { tools: { render_mermaid: false } })
    const unrestricted = await harness.notebook("unrestricted")
    for (const [notebook, marker, enabled] of [[restricted, "catalog-restricted", false], [unrestricted, "catalog-unrestricted", true]] as const) {
      const session = await notebook.json("/session", sessionSchema, { body: { title: marker } })
      await notebook.json(`/session/${session.id}/message`, json, { body: { content: marker, persona: "buddy" } })
      expect(harness.latestRequest(marker).tools.includes("render_mermaid")).toBe(enabled)
      expect(harness.latestRequest(marker).tools).toContain("render_svg")
    }
  })

  test("reloaded configuration changes the next prompt in an existing conversation", async () => {
    const notebook = await harness.notebook("reload")
    const session = await notebook.json("/session", sessionSchema, { body: { title: "Reload conformance" } })
    await notebook.json(`/session/${session.id}/message`, json, { body: { content: "catalog-before-reload", persona: "buddy" } })
    expect(harness.latestRequest("catalog-before-reload").tools).toContain("render_mermaid")
    await notebook.json("/config", json, { method: "PATCH", body: { tools: { render_mermaid: false }, agent: { buddy: { prompt: "catalog-reloaded-instructions" } } } })
    expect(await notebook.json("/global/dispose", z.boolean(), { method: "POST" })).toBe(true)
    await notebook.json(`/session/${session.id}/message`, json, { body: { content: "catalog-after-reload", persona: "buddy" } })
    const request = harness.latestRequest("catalog-after-reload")
    expect(request.tools).not.toContain("render_mermaid")
    expect(request.system).toContain("catalog-reloaded-instructions")
    expect((await notebook.json(`/session/${session.id}`, sessionSchema)).id).toBe(session.id)
  })
})
