import { expect, test } from "bun:test"
import z from "zod"
import { createConfigConformanceHarness } from "./harness-config"

test("Buddy's model-facing instructions describe Buddy and omit worktree guidance", async () => {
  await using harness = await createConfigConformanceHarness()
  const notebook = await harness.notebook("buddy-identity")
  const session = await notebook.json("/session", z.object({ id: z.string() }), { body: { title: "Buddy identity", agent: "buddy" } })
  const marker = "Explain why the sky is blue."
  await notebook.json(`/session/${session.id}/message`, z.json(), { body: { content: marker, persona: "buddy" } })
  const { system } = harness.latestRequest(marker)
  expect(system).toContain("Tools for managing Buddy itself, such as working with sessions, searching the available models, and reading MCP resources.")
  expect(system).not.toContain("OpenCode")
  expect(system).not.toContain("worktree")
})
