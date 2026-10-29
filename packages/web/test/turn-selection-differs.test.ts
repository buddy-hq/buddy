import { describe, expect, test } from "bun:test"
import { turnSelectionDiffers } from "../src/lib/directory-chat/chat-prompt-helpers"

const model = { providerID: "openai", modelID: "gpt-x" }
const turn = { agent: "buddy", model: { ...model, variant: "high" } }
const next = { agent: "buddy", model, variant: "high" }

describe("turnSelectionDiffers", () => {
  test("the same choice can steer the running turn", () => {
    expect(turnSelectionDiffers(turn, next)).toBe(false)
  })

  test("a different agent waits for the running turn", () => {
    expect(turnSelectionDiffers(turn, { ...next, agent: "tutor" })).toBe(true)
  })

  test("a different model waits for the running turn", () => {
    expect(turnSelectionDiffers(turn, { ...next, model: { ...model, modelID: "gpt-y" } })).toBe(
      true,
    )
    expect(turnSelectionDiffers(turn, { ...next, model: { ...model, providerID: "azure" } })).toBe(
      true,
    )
  })

  test("a different variant waits for the running turn", () => {
    expect(turnSelectionDiffers(turn, { ...next, variant: "low" })).toBe(true)
  })

  test("default and absent variants are the same choice", () => {
    expect(turnSelectionDiffers({ agent: "buddy", model }, { ...next, variant: "default" })).toBe(
      false,
    )
    expect(
      turnSelectionDiffers(
        { agent: "buddy", model: { ...model, variant: "default" } },
        { agent: "buddy", model },
      ),
    ).toBe(false)
    expect(
      turnSelectionDiffers(
        { agent: "buddy", model: { ...model, variant: null } },
        { agent: "buddy", model },
      ),
    ).toBe(false)
  })

  test("retired and current Azure provider IDs are the same choice", () => {
    const retiredModel = { ...model, providerID: "azure-cognitive-services" }
    const currentModel = { ...model, providerID: "azure" }
    expect(
      turnSelectionDiffers(
        { agent: "buddy", model: retiredModel },
        { agent: "buddy", model: currentModel },
      ),
    ).toBe(false)
    expect(
      turnSelectionDiffers(
        { agent: "buddy", model: currentModel },
        { agent: "buddy", model: retiredModel },
      ),
    ).toBe(false)
  })

  test("no running turn does not require queuing", () => {
    expect(turnSelectionDiffers(undefined, next)).toBe(false)
  })

  test("no next model does not require queuing", () => {
    expect(turnSelectionDiffers(turn, { agent: "tutor", variant: "low" })).toBe(false)
  })
})
