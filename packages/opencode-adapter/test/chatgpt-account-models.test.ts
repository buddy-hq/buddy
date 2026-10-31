import { expect, test } from "bun:test"
import { applyAccountModels } from "../src/extension/chatgpt"

test("a ChatGPT account model keeps a fast sibling that requests the same model at priority", () => {
  const models = applyAccountModels(new Map(), [{ id: "gpt-6.1-terra", name: "GPT-6.1 Terra" }])

  expect(models.map((model) => String(model.id))).toEqual(["gpt-6.1-terra", "gpt-6.1-terra-fast"])
  expect(models[0]?.body).toBeUndefined()
  expect(models[1]).toMatchObject({
    modelID: "gpt-6.1-terra",
    name: "GPT-6.1 Terra Fast",
    body: { service_tier: "priority" },
    enabled: true,
  })
})

test.each(["gpt-5.5-pro", "gpt-5.3-codex-spark", "gpt-6.1-mini"])(
  "%s does not get a fast sibling",
  (id) => {
    expect(applyAccountModels(new Map(), [{ id }]).map((model) => String(model.id))).toEqual([id])
  },
)

test("a fast model the account lists itself is not duplicated", () => {
  const models = applyAccountModels(new Map(), [{ id: "gpt-6-sol" }, { id: "gpt-6-sol-fast" }])

  expect(models.map((model) => String(model.id))).toEqual(["gpt-6-sol", "gpt-6-sol-fast"])
})
