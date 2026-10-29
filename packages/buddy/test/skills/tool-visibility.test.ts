import { expect, test } from "bun:test"
import { createRuntimeHarness, scenario } from "../conformance/harness"

test("loads a Buddy teaching skill through the runtime skill tool and notebook permissions", async () => {
  await using harness = await createRuntimeHarness()
  const session = await harness.create({ agent: "buddy" })
  const response = await harness.prompt(session.id, scenario({ kind: "tool", name: "skill", arguments: { id: "teaching-models" } }), { agent: "buddy" })
  expect(response.status).toBe(200)
  const history = await harness.messages(session.id)
  const loaded = history.flatMap((message) => message.parts).find((part) => part.type === "tool" && part.tool === "skill")
  expect(loaded?.type === "tool" ? loaded.state.status : undefined).toBe("completed")
  expect(loaded?.type === "tool" && loaded.state.status === "completed" ? loaded.state.output : undefined).toContain('<skill_content name="teaching-models">')
})
