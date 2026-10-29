import { expect, test } from "bun:test"
import { app } from "../../src/app"
import { createRuntimeHarness, messageText, patchModel, scenario } from "./harness"

test("patching the model before the first session lets its first prompt finish", async () => {
  await using api = await createRuntimeHarness()
  const patched = await app.request("/api/config", {
    method: "PATCH",
    headers: { "x-buddy-directory": api.directory, "content-type": "application/json" },
    body: JSON.stringify({ model: `${patchModel.providerID}/${patchModel.modelID}` }),
  })
  expect(patched.status).toBe(200)
  const session = await api.create()
  await using events = await api.events()
  const [response] = await Promise.all([
    api.prompt(session.id, scenario({ kind: "reply", text: "After config patch" })),
    events.idle(session.id),
  ])
  expect(response.status).toBe(200)
  const reply = (await api.messages(session.id)).at(-1)
  if (!reply) throw new Error("Missing completed reply")
  expect(reply.info).toMatchObject({ role: "assistant", ...patchModel, finish: "stop", time: { completed: expect.any(Number) } })
  expect(messageText(reply)).toBe("After config patch")
}, 5_000)
