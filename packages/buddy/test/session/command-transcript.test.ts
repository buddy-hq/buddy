import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { getAgentRuntime } from "../../src/runtime/agent-runtime"
import { createConfigConformanceHarness } from "../conformance/harness-config"
import { createRuntimeHarness, scenario, transcript } from "../conformance/harness"

const sessionSchema = z.object({ id: z.string() })

describe("command transcript", () => {
  test("streams compact command text while the model receives the expanded template", async () => {
    await using api = await createRuntimeHarness()
    const session = await api.create()
    await using events = await api.events()
    const argument = scenario({ kind: "command", text: "Command answer" })
    const response = await api.request(`/session/${session.id}/command`, {
      method: "POST",
      body: JSON.stringify({
        command: "conformance",
        arguments: argument,
        agent: "conformance-runner",
      }),
    })
    expect(response.status).toBe(200)
    await events.idle(session.id)
    const parts = events.seen
      .filter((event) => event.payload.type === "message.part.updated")
      .map(transcript)
      .flatMap((event) =>
        event.type === "message.part.updated" && event.properties.part.type === "text"
          ? [event.properties.part.text]
          : [],
      )
    expect(parts).toContain(`/conformance ${argument}`)
    expect(parts.some((text) => text.includes("Expanded conformance command:"))).toBe(false)
    expect(
      (await api.messages(session.id)).find((message) => message.info.role === "user")?.parts,
    ).toContainEqual(expect.objectContaining({ type: "text", text: `/conformance ${argument}` }))
  })

  test("correlates identical concurrent commands with distinct admitted prompt IDs", async () => {
    await using api = await createRuntimeHarness()
    const session = await api.create()
    const runtime = await getAgentRuntime()
    const results = await Promise.all(
      [1, 2].map(() =>
        runtime.execution.command(
          { sessionID: session.id, name: "conformance", arguments: "same" },
          { directory: api.directory },
        ),
      ),
    )
    const parents = results.map((result) => {
      if (!result.ok || !("info" in result.value) || result.value.info.role !== "assistant")
        throw new Error("Expected a completed command assistant")
      return result.value.info.parentID
    })
    expect(new Set(parents).size).toBe(2)
    expect(
      (await api.messages(session.id))
        .filter((message) => message.info.role === "user")
        .map((message) => message.info.id)
        .toSorted(),
    ).toEqual(parents.toSorted())
  })

  test("executes a skill-only command with compact display and model-visible instructions", async () => {
    await using harness = await createConfigConformanceHarness()
    const notebook = await harness.notebook("skill-fallback")
    const skillRoot = path.join(notebook.directory, "skills")
    const skillDirectory = path.join(skillRoot, "review-skill")
    await fs.mkdir(skillDirectory, { recursive: true })
    await fs.writeFile(
      path.join(skillDirectory, "SKILL.md"),
      "---\nname: review-skill\ndescription: Review a chapter\n---\nReview skill instructions.\n",
    )
    await fs.mkdir(path.join(skillRoot, "init"), { recursive: true })
    await fs.writeFile(
      path.join(skillRoot, "init", "SKILL.md"),
      "---\nname: init\ndescription: Start a lesson\n---\nInit skill instructions.\n",
    )
    await notebook.json("/config", z.record(z.string(), z.json()), {
      method: "PATCH",
      body: { skills: { paths: [skillRoot] } },
    })
    const runtime = await getAgentRuntime()
    expect(await runtime.catalog.commands(notebook.directory)).toContainEqual({
      name: "review-skill",
      description: "Review a chapter",
      source: "skill",
    })
    const session = await notebook.json("/session", sessionSchema, { body: {} })
    const result = await runtime.execution.command(
      { sessionID: session.id, name: "/review-skill", arguments: " chapter 3 " },
      { directory: notebook.directory },
    )
    if (!result.ok || !("info" in result.value) || result.value.info.role !== "assistant")
      throw new Error("Expected a completed skill command assistant")
    const assistant = result.value.info
    const history = await runtime.conversations.history({
      directory: notebook.directory,
      sessionID: session.id,
    })
    expect(
      history.items.find((message) => message.info.id === assistant.parentID)?.parts,
    ).toContainEqual(expect.objectContaining({ type: "text", text: "/review-skill chapter 3" }))
    expect(harness.latestRequest("chapter 3").prompt).toContain("Review skill instructions.")
    expect(
      await runtime.execution.command(
        { sessionID: session.id, name: "missing-entry", arguments: "" },
        { directory: notebook.directory },
      ),
    ).toMatchObject({ ok: false, error: { kind: "not_found" } })
    expect(
      (
        await runtime.execution.command(
          { sessionID: session.id, name: "init", arguments: "lesson four" },
          { directory: notebook.directory },
        )
      ).ok,
    ).toBe(true)
    expect(harness.latestRequest("lesson four").prompt).toContain("Init skill instructions.")
  })
})
