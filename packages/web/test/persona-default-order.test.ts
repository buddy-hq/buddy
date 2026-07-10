import { describe, expect, test } from "bun:test"
import type { PersonaConfigOption } from "../src/state/chat-actions"
import { resolveDefaultPersonaID } from "../src/state/chat-actions"

function persona(id: PersonaConfigOption["id"], hidden = false): PersonaConfigOption {
  return {
    id,
    label: id,
    description: id,
    surfaces: ["curriculum"],
    defaultSurface: "curriculum",
    hidden,
  }
}

describe("resolveDefaultPersonaID", () => {
  test("prefers configured default when visible", () => {
    const personas = [persona("buddy"), persona("teaching-buddy")]
    expect(resolveDefaultPersonaID(personas, "teaching-buddy")).toBe("teaching-buddy")
  })

  test("falls back to the first visible persona in catalog order", () => {
    const personas = [persona("buddy"), persona("teaching-buddy")]
    expect(resolveDefaultPersonaID(personas, "unknown-persona")).toBe("buddy")
  })

  test("skips hidden personas during default resolution", () => {
    const personas = [persona("buddy", true), persona("teaching-buddy")]
    expect(resolveDefaultPersonaID(personas)).toBe("teaching-buddy")
  })
})
